"use client";

import { FlowNode, NodeType } from "@/lib/types";
import { useState, useEffect, useRef } from "react";

const NODE_TYPES: { value: NodeType; label: string }[] = [
  { value: "start", label: "Start" },
  { value: "step", label: "Process Step" },
  { value: "decision", label: "Decision" },
  { value: "sub", label: "Sub-process" },
  { value: "ok", label: "End (Success)" },
  { value: "fail", label: "End (Failed)" },
];

interface Props {
  node: FlowNode | null;
  onSave: (updated: FlowNode) => void;
  onDelete: (id: string) => void;
  onDuplicate: (node: FlowNode) => void;
  onClose: () => void;
}

export default function EditModal({ node, onSave, onDelete, onDuplicate, onClose }: Props) {
  const [type, setType] = useState<NodeType>("step");
  const [label, setLabel] = useState("");
  const [detail, setDetail] = useState("");
  const [tools, setTools] = useState("");
  const [sla, setSla] = useState("");
  const [agentSteps, setAgentSteps] = useState("");
  const labelRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (node) {
      setType(node.type);
      setLabel(node.label || "");
      setDetail(node.detail || "");
      setTools((node.tools || []).join(", "));
      setSla(node.sla || "");
      setAgentSteps((node.agentSteps || []).join("\n"));
      setTimeout(() => labelRef.current?.focus(), 80);
    }
  }, [node]);

  if (!node) return null;

  const handleSave = () => {
    const parsedTools = tools
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const parsedSteps = agentSteps
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    onSave({
      ...node,
      type,
      label,
      detail,
      tools: parsedTools,
      sla: sla.trim(),
      agentSteps: parsedSteps,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 z-[500] flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-white dark:bg-zinc-800 rounded-2xl shadow-2xl w-[480px] max-w-full max-h-[90vh] flex flex-col overflow-hidden"
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-zinc-200 dark:border-zinc-700 shrink-0">
          <h2 className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-100">
            Edit Process Anatomy & Step
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-400 text-lg"
          >
            &times;
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto flex-1 text-xs">
          <div>
            <label className="block text-[10.5px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
              Node Type
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as NodeType)}
              className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-900 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-emerald-500"
            >
              {NODE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10.5px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
              Label / Title
            </label>
            <input
              ref={labelRef}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Verify Device IMEI & Availability"
              className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-900 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-[10.5px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
              Description / Overview
            </label>
            <textarea
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              rows={2}
              placeholder="Brief explanation of what happens in this step..."
              className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 leading-relaxed resize-y focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Detailed Mode Fields */}
          <div className="pt-2 border-t border-zinc-200 dark:border-zinc-700 space-y-3">
            <div className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
              Agent Execution & Detailed Anatomy
            </div>

            <div>
              <label className="block text-[10.5px] font-bold uppercase tracking-wider text-zinc-400 mb-1">
                Agent Checklist (1 step per line)
              </label>
              <textarea
                value={agentSteps}
                onChange={(e) => setAgentSteps(e.target.value)}
                rows={4}
                placeholder={"1. Open admin.revibe.me\n2. Search by order number\n3. Click Availability -> Confirmed"}
                className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 leading-relaxed resize-y focus:outline-none focus:border-emerald-500 font-mono"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10.5px] font-bold uppercase tracking-wider text-zinc-400 mb-1">
                  Tools / Systems (comma separated)
                </label>
                <input
                  value={tools}
                  onChange={(e) => setTools(e.target.value)}
                  placeholder="Shopify, Revibe Admin, Aramex"
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[10.5px] font-bold uppercase tracking-wider text-zinc-400 mb-1">
                  SLA / Target Time
                </label>
                <input
                  value={sla}
                  onChange={(e) => setSla(e.target.value)}
                  placeholder="e.g. 24 hours, 48 hours"
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-2 p-4 border-t border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/50 shrink-0">
          <button
            onClick={() => onDelete(node.id)}
            className="flex-1 px-3 py-2 rounded-lg border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 text-xs font-medium hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
          >
            Delete
          </button>
          <button
            onClick={() => {
              onDuplicate(node);
              onClose();
            }}
            className="flex-1 px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
          >
            Duplicate
          </button>
          <button
            onClick={handleSave}
            className="flex-1 px-3 py-2 rounded-lg bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-600 transition-colors shadow-sm"
          >
            Save Anatomy
          </button>
        </div>
      </div>
    </div>
  );
}
