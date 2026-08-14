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
  /** Broadcast a local op to everyone else on this diagram. */
  broadcast: (op: Op) => void;
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
      const op = payload as Op;
      if (op && op.origin !== clientId) onOpRef.current(op);
    });

    const syncPeers = () => {
      const state = channel.presenceState<Collaborator>();
      const seen = new Map<string, Collaborator>();
      Object.values(state).forEach((metas) => {
        metas.forEach((m) => {
          if (m.userId) seen.set(m.userId, { userId: m.userId, name: m.name, color: m.color });
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

  const broadcast = useCallback((op: Op) => {
    const ch = channelRef.current;
    if (!ch) return;
    ch.send({ type: "broadcast", event: "op", payload: op }).catch(() => {});
  }, []);

  return { peers, status, broadcast };
}
