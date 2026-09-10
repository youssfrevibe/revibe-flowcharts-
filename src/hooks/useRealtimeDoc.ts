"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getBrowserClient } from "@/lib/supabase-browser";
import { Collaborator, Op } from "@/lib/types";

type ConnStatus = "connecting" | "live" | "offline";

interface Options {
  slug: string;
  user: Collaborator | null;
  /** Per-tab client id used to suppress our own broadcast echoes (distinct from userId). */
  clientId: string;
  /** Called for every remote op (already filtered to exclude our own). */
  onRemoteOp: (op: Op) => void;
}

interface Result {
  peers: Collaborator[];
  status: ConnStatus;
  /** Broadcast local ops to everyone else on this diagram. A batch travels as ONE
   *  message — see the note on `broadcast` below. */
  broadcast: (ops: Op | Op[]) => void;
}

/**
 * Live sync (no cursors) via Supabase Realtime:
 * - Presence tracks who is currently editing the diagram (name + color).
 * - Broadcast relays granular ops so remote edits land in ~1s.
 * Durability comes from the debounced autosave to the flowcharts table elsewhere.
 */
export function useRealtimeDoc({ slug, user, clientId, onRemoteOp }: Options): Result {
  const [peers, setPeers] = useState<Collaborator[]>([]);
  const [status, setStatus] = useState<ConnStatus>("connecting");
  const channelRef = useRef<RealtimeChannel | null>(null);

  // Keep the latest callback without forcing a resubscribe.
  const onOpRef = useRef(onRemoteOp);
  onOpRef.current = onRemoteOp;

  const userId = user?.userId;
  const userName = user?.name;
  const userColor = user?.color;

  useEffect(() => {
    if (!slug || !userId) return;
    const client = getBrowserClient();
    if (!client) {
      setStatus("offline");
      return;
    }

    const channel = client.channel(`flowchart:${slug}`, {
      config: { broadcast: { self: false, ack: false }, presence: { key: userId } },
    });
    channelRef.current = channel;

    channel.on("broadcast", { event: "op" }, ({ payload }) => {
      // Two wire shapes: a bare op, and `{ ops: [...] }` for a batch. Both are accepted
      // so a tab left open across a deploy still understands the other one.
      const p = payload as Op | { ops?: Op[] } | null;
      const ops: Op[] = p && Array.isArray((p as { ops?: Op[] }).ops)
        ? ((p as { ops: Op[] }).ops)
        : p
          ? [p as Op]
          : [];
      for (const op of ops) {
        if (op && op.origin !== clientId) onOpRef.current(op);
      }
    });

    const syncPeers = () => {
      const state = channel.presenceState<Collaborator>();
      const seen = new Map<string, Collaborator>();
      Object.values(state).forEach((metas) => {
        metas.forEach((m) => {
          // Skip yourself: presence includes the local user, so a solo editor saw one
          // "collaborator" in the avatar stack and every count was one too high.
          if (m.userId && m.userId !== userId) {
            seen.set(m.userId, { userId: m.userId, name: m.name, color: m.color });
          }
        });
      });
      setPeers([...seen.values()]);
    };

    channel.on("presence", { event: "sync" }, syncPeers);

    channel.subscribe((s) => {
      if (s === "SUBSCRIBED") {
        setStatus("live");
        channel.track({ userId, name: userName, color: userColor });
      } else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT") {
        setStatus("offline");
      } else if (s === "CLOSED") {
        setStatus("connecting");
      }
    });

    return () => {
      channel.untrack().catch(() => {});
      client.removeChannel(channel);
      channelRef.current = null;
    };
  }, [slug, userId, userName, userColor]);

  /**
   * One message per *batch*, not per op.
   *
   * This used to send each op separately, so capturing geometry on a 109-node diagram
   * fired 109 sends in a single tick, as did deleting, duplicating or recolouring a
   * large selection. Realtime rate-limits messages per client and drops the overflow,
   * and a dropped op is a silent divergence: the sender's document and the peer's stop
   * matching with nothing on screen to say so.
   *
   * Batches are still split by serialised size, because the other way to lose a message
   * is to exceed the per-message payload limit — one oversized send would drop the whole
   * batch, which is strictly worse than the fan-out it replaced.
   */
  const broadcast = useCallback((ops: Op | Op[]) => {
    const ch = channelRef.current;
    if (!ch) return;
    const list = Array.isArray(ops) ? ops : [ops];
    if (!list.length) return;

    const send = (batch: Op[]) => {
      if (!batch.length) return;
      // The result was thrown away, so a rejected or rate-limited send looked exactly
      // like a delivered one and the badge still read "live" while peers silently fell
      // behind. Report it instead; the next successful send flips it back.
      void ch
        .send({ type: "broadcast", event: "op", payload: { ops: batch } })
        .then((res) => setStatus(res === "ok" ? "live" : "offline"))
        .catch(() => setStatus("offline"));
    };

    // Comfortably under Realtime's 256KB ceiling, leaving room for envelope overhead.
    const MAX_BYTES = 180_000;
    let batch: Op[] = [];
    let bytes = 0;
    for (const op of list) {
      const size = JSON.stringify(op).length;
      // A single op larger than the cap cannot be split; send it alone and let the
      // server decide rather than silently dropping it in with others.
      if (batch.length && bytes + size > MAX_BYTES) {
        send(batch);
        batch = [];
        bytes = 0;
      }
      batch.push(op);
      bytes += size;
    }
    send(batch);
  }, []);

  return { peers, status, broadcast };
}
