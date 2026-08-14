"use client";

import { Collaborator } from "@/lib/types";
import { initials } from "@/lib/user";

interface Props {
  me: Collaborator | null;
  peers: Collaborator[];
  status: "connecting" | "live" | "offline";
  onEditName: () => void;
}

export default function PresenceBar({ me, peers, status, onEditName }: Props) {
  // Everyone currently here = me + peers (deduped by userId).
  const others = peers.filter((p) => p.userId !== me?.userId);
  const all = me ? [me, ...others] : others;
  const shown = all.slice(0, 5);
  const extra = all.length - shown.length;

  const dot =
    status === "live" ? "bg-emerald-500" : status === "connecting" ? "bg-amber-400" : "bg-zinc-400";
  const dotLabel = status === "live" ? "Live" : status === "connecting" ? "Connecting" : "Offline";

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1.5 pr-2" title={`Realtime: ${dotLabel}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${dot} ${status === "live" ? "animate-pulse" : ""}`} />
        <span className="text-[10px] font-medium text-zinc-400 hidden sm:inline">{dotLabel}</span>
      </div>
      <div className="flex items-center -space-x-1.5">
        {shown.map((c) => (
          <div
            key={c.userId}
            title={c.userId === me?.userId ? `${c.name} (you)` : c.name}
            onClick={c.userId === me?.userId ? onEditName : undefined}
            className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white ring-2 ring-white dark:ring-zinc-800 ${
              c.userId === me?.userId ? "cursor-pointer" : ""
            }`}
            style={{ backgroundColor: c.color }}
          >
            {initials(c.name)}
          </div>
        ))}
        {extra > 0 && (
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-zinc-600 dark:text-zinc-300 bg-zinc-200 dark:bg-zinc-700 ring-2 ring-white dark:ring-zinc-800">
            +{extra}
          </div>
        )}
      </div>
    </div>
  );
}
