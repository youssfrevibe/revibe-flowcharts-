"use client";

import { useMemo } from "react";
import { FlowNode, FlowConnection, NodeType, Actor } from "@/lib/types";
import { connId } from "@/lib/ops";

interface Props {
  nodes: FlowNode[];
  connections: FlowConnection[];
  onClose: () => void;
  /** Select a node and pan to it. */
  onFocusNode: (id: string) => void;
  /** Select multiple nodes. */
  onSelectNodes: (ids: string[]) => void;
}

const TYPE_LABELS: Record<NodeType, string> = {
  start: "Start",
  step: "Process Step",
  decision: "Decision",
  sub: "Sub-Process",
  ok: "Success End",
  fail: "Failure End",
  note: "Comment",
};

const TYPE_COLORS: Record<NodeType, string> = {
  start: "#22c55e",
  step: "#3b82f6",
  decision: "#f59e0b",
  sub: "#8b5cf6",
  ok: "#10b981",
  fail: "#ef4444",
  note: "#94a3b8",
};

export default function DiagramStats({ nodes, connections, onClose, onFocusNode, onSelectNodes }: Props) {
  const stats = useMemo(() => {
    // Type breakdown
    const typeCounts = new Map<NodeType, number>();
    for (const n of nodes) {
      typeCounts.set(n.type, (typeCounts.get(n.type) || 0) + 1);
    }

    // Connection stats
    const inDegree = new Map<string, number>();
    const outDegree = new Map<string, number>();
    for (const n of nodes) {
      inDegree.set(n.id, 0);
      outDegree.set(n.id, 0);
    }
    for (const c of connections) {
      outDegree.set(c.from, (outDegree.get(c.from) || 0) + 1);
      inDegree.set(c.to, (inDegree.get(c.to) || 0) + 1);
    }
    const avgConns = nodes.length > 0
      ? (connections.length * 2 / nodes.length).toFixed(1)
      : "0";

    // Orphans: no connections at all (ignore notes)
    const orphans = nodes.filter(
      (n) => n.type !== "note" && (inDegree.get(n.id) || 0) === 0 && (outDegree.get(n.id) || 0) === 0
    );

    // Dead ends: non-terminal nodes with outgoing but no path to an end node
    const terminals = new Set(nodes.filter((n) => n.type === "ok" || n.type === "fail").map((n) => n.id));
    const deadEnds = nodes.filter((n) => {
      if (n.type === "ok" || n.type === "fail" || n.type === "start" || n.type === "note") return false;
      // Has outgoing?
      const out = (outDegree.get(n.id) || 0);
      if (out === 0) return true; // No outgoing at all on a process step
      return false;
    });

    // Longest path (BFS from starts)
    const starts = nodes.filter((n) => n.type === "start");
    let longestPath = 0;
    for (const start of starts) {
      const visited = new Set<string>();
      const queue: { id: string; depth: number }[] = [{ id: start.id, depth: 1 }];
      while (queue.length > 0) {
        const { id, depth } = queue.shift()!;
        if (visited.has(id)) continue;
        visited.add(id);
        longestPath = Math.max(longestPath, depth);
        for (const c of connections) {
          if (c.from === id && !visited.has(c.to)) {
            queue.push({ id: c.to, depth: depth + 1 });
          }
        }
      }
    }

    // Actor coverage
    const actorCounts = new Map<string, number>();
    let noActor = 0;
    for (const n of nodes) {
      if (n.type === "note") continue;
      if (n.actor) {
        actorCounts.set(n.actor, (actorCounts.get(n.actor) || 0) + 1);
      } else {
        noActor++;
      }
    }

    // Missing fields
    const processNodes = nodes.filter((n) => n.type !== "note" && n.type !== "start");
    const missingSLA = processNodes.filter((n) => !n.sla);
    const missingActor = processNodes.filter((n) => !n.actor);
    const missingStage = processNodes.filter((n) => !n.internalStage && !n.externalStage);

    return {
      typeCounts,
      totalConns: connections.length,
      avgConns,
      orphans,
      deadEnds,
      longestPath,
      actorCounts,
      noActor,
      missingSLA,
      missingActor,
      missingStage,
    };
  }, [nodes, connections]);

  const ACTOR_LABELS: Record<string, string> = {
    revibe: "Revibe",
    seller: "Seller",
    system: "System",
    carrier: "Carrier",
  };

  return (
    <div
      className="fixed inset-0 z-[810] flex justify-end bg-black/40 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-sm h-full bg-white dark:bg-zinc-800 border-l border-zinc-200 dark:border-zinc-700 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200 dark:border-zinc-700/80 bg-zinc-50/50 dark:bg-zinc-900/40">
          <div>
            <h2 className="text-[15px] font-bold font-display text-zinc-900 dark:text-zinc-100">
              Diagram Insights
            </h2>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              Structure analysis &amp; health checks
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors text-lg"
          >
            &times;
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Overview */}
          <section>
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-2.5">Overview</h3>
            <div className="grid grid-cols-3 gap-2">
              <StatCard label="Nodes" value={nodes.length} color="#3b82f6" />
              <StatCard label="Connections" value={stats.totalConns} color="#8b5cf6" />
              <StatCard label="Longest Path" value={stats.longestPath} color="#10b981" />
            </div>
          </section>

          {/* Node Breakdown */}
          <section>
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-2.5">Node Breakdown</h3>
            <div className="space-y-1">
              {(["start", "step", "decision", "sub", "ok", "fail", "note"] as NodeType[]).map((type) => {
                const count = stats.typeCounts.get(type) || 0;
                if (count === 0) return null;
                const pct = nodes.length > 0 ? (count / nodes.length) * 100 : 0;
                return (
                  <div key={type} className="flex items-center gap-2 text-xs">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: TYPE_COLORS[type] }} />
                    <span className="flex-1 text-zinc-700 dark:text-zinc-300">{TYPE_LABELS[type]}</span>
                    <span className="font-mono text-zinc-500 tabular-nums">{count}</span>
                    <div className="w-16 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: TYPE_COLORS[type] }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Actor Coverage */}
          {(stats.actorCounts.size > 0 || stats.noActor > 0) && (
            <section>
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-2.5">Actor Coverage</h3>
              <div className="space-y-1">
                {Array.from(stats.actorCounts.entries()).map(([actor, count]) => (
                  <div key={actor} className="flex items-center gap-2 text-xs">
                    <span className="flex-1 text-zinc-700 dark:text-zinc-300">{ACTOR_LABELS[actor] || actor}</span>
                    <span className="font-mono text-zinc-500 tabular-nums">{count}</span>
                  </div>
                ))}
                {stats.noActor > 0 && (
                  <button
                    onClick={() => onSelectNodes(stats.missingActor.map((n) => n.id))}
                    className="flex items-center gap-2 text-xs w-full text-left hover:bg-zinc-100 dark:hover:bg-zinc-700/60 rounded-lg px-1.5 py-0.5 -mx-1.5 transition-colors"
                  >
                    <span className="flex-1 text-amber-600 dark:text-amber-400">No actor assigned</span>
                    <span className="font-mono text-amber-500 tabular-nums">{stats.noActor}</span>
                  </button>
                )}
              </div>
            </section>
          )}

          {/* Health Checks */}
          <section>
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-2.5">Health Checks</h3>
            <div className="space-y-2">
              <HealthRow
                label="Orphan nodes"
                desc="No connections at all"
                count={stats.orphans.length}
                good={stats.orphans.length === 0}
                onClick={stats.orphans.length > 0 ? () => onSelectNodes(stats.orphans.map((n) => n.id)) : undefined}
              />
              <HealthRow
                label="Dead ends"
                desc="Process nodes with no outgoing"
                count={stats.deadEnds.length}
                good={stats.deadEnds.length === 0}
                onClick={stats.deadEnds.length > 0 ? () => onSelectNodes(stats.deadEnds.map((n) => n.id)) : undefined}
              />
              <HealthRow
                label="Missing SLA"
                desc="Process nodes without SLA"
                count={stats.missingSLA.length}
                good={stats.missingSLA.length === 0}
                onClick={stats.missingSLA.length > 0 ? () => onSelectNodes(stats.missingSLA.map((n) => n.id)) : undefined}
              />
              <HealthRow
                label="Missing stage"
                desc="No internal or external stage"
                count={stats.missingStage.length}
                good={stats.missingStage.length === 0}
                onClick={stats.missingStage.length > 0 ? () => onSelectNodes(stats.missingStage.map((n) => n.id)) : undefined}
              />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className="flex flex-col items-center p-2.5 rounded-xl border border-zinc-200/90 dark:border-zinc-700/80 bg-zinc-50/60 dark:bg-zinc-900/40">
      <span className="text-xl font-bold font-display tabular-nums" style={{ color }}>{value}</span>
      <span className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5">{label}</span>
    </div>
  );
}

function HealthRow({ label, desc, count, good, onClick }: { label: string; desc: string; count: number; good: boolean; onClick?: () => void }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={`flex items-center gap-2.5 p-2 rounded-lg border text-left w-full transition-colors ${
        good
          ? "border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/60 dark:bg-emerald-950/30"
          : onClick
            ? "border-amber-200 dark:border-amber-900/60 bg-amber-50/60 dark:bg-amber-950/30 hover:bg-amber-100 dark:hover:bg-amber-950/50 cursor-pointer"
            : "border-amber-200 dark:border-amber-900/60 bg-amber-50/60 dark:bg-amber-950/30"
      }`}
    >
      <span className={`text-sm ${good ? "text-emerald-500" : "text-amber-500"}`}>
        {good ? "✓" : "⚠"}
      </span>
      <div className="flex-1 min-w-0">
        <div className={`text-[12px] font-semibold ${good ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"}`}>
          {label}
        </div>
        <div className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate">{desc}</div>
      </div>
      <span className={`text-[13px] font-mono font-bold tabular-nums ${good ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
        {count}
      </span>
      {onClick && !good && (
        <span className="text-[10px] text-amber-500 dark:text-amber-400 shrink-0">Select →</span>
      )}
    </Tag>
  );
}
