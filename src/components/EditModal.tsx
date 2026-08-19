"use client";

import { FlowNode, NodeType, TextPosition, TextAlign, TextSize, NodeWidth } from "@/lib/types";
import { NODE_COLOR_PRESETS, NOTE_COLOR_PRESETS, getNodeStyle, getNodeFill, DEFAULT_TYPE_FILL } from "@/lib/node-colors";
import React, { useState, useEffect, useRef } from "react";

const NODE_TYPES: { value: NodeType; label: string }[] = [
  { value: "start", label: "Start" },
  { value: "step", label: "Process Step" },
  { value: "decision", label: "Decision" },
  { value: "sub", label: "Sub-process" },
  { value: "ok", label: "End (Success)" },
  { value: "fail", label: "End (Failed)" },
  { value: "note", label: "Comment / Note" },
];

const TEXT_POSITIONS: { value: TextPosition; label: string; icon: string; desc: string }[] = [
  { value: "inside", label: "Inside", icon: "▱", desc: "Default inside shape" },
  { value: "top", label: "Top", icon: "↑", desc: "Label above shape" },
  { value: "bottom", label: "Bottom", icon: "↓", desc: "Label below shape" },
  { value: "left", label: "Left", icon: "←", desc: "Label to the left" },
  { value: "right", label: "Right", icon: "→", desc: "Label to the right" },
];

const TEXT_ALIGNS: { value: TextAlign; label: string; icon: string }[] = [
  { value: "left", label: "Left", icon: "⫷" },
  { value: "center", label: "Center", icon: "⫸⫷" },
  { value: "right", label: "Right", icon: "⫸" },
];

const TEXT_SIZES: { value: TextSize; label: string }[] = [
  { value: "sm", label: "Small (11px)" },
  { value: "base", label: "Normal (13px)" },
  { value: "lg", label: "Large (15px)" },
];

const WIDTH_PRESETS: { value: NodeWidth; label: string; px: string }[] = [
  { value: "compact", label: "Compact", px: "170px" },
  { value: "normal", label: "Normal", px: "220px" },
  { value: "wide", label: "Wide", px: "300px" },
  { value: "xwide", label: "Extra Wide", px: "390px" },
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
  const [color, setColor] = useState<string>("");
  const [customHex, setCustomHex] = useState<string>("#3b82f6");
  const [textPosition, setTextPosition] = useState<TextPosition>("inside");
  const [textAlign, setTextAlign] = useState<TextAlign>("left");
  const [textSize, setTextSize] = useState<TextSize>("base");
  const [customWidth, setCustomWidth] = useState<NodeWidth>("normal");

  const labelRef = useRef<HTMLInputElement>(null);
  const noteTextareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (node) {
      setType(node.type);
      setLabel(node.label || "");
      setDetail(node.detail || "");
      setTools((node.tools || []).join(", "));
      setSla(node.sla || "");
      setAgentSteps((node.agentSteps || []).join("\n"));
      setColor(node.color || "");
      if (node.color && node.color.startsWith("#")) {
        setCustomHex(node.color);
      }
      setTextPosition(node.textPosition || "inside");
      setTextAlign(
        node.textAlign ||
          (node.type === "decision" || node.type === "start" || node.type === "ok" || node.type === "fail"
            ? "center"
            : "left")
      );
      setTextSize(node.textSize || "base");
      setCustomWidth(
        typeof node.customWidth === "string" ? (node.customWidth as NodeWidth) : "normal"
      );

      setTimeout(() => {
        if (node.type === "note") {
          noteTextareaRef.current?.focus();
        } else {
          labelRef.current?.focus();
        }
      }, 80);
    }
  }, [node]);

  if (!node) return null;

  const isNote = type === "note";

  const handleSave = () => {
    if (isNote) {
      onSave({
        ...node,
        type: "note",
        label: label.trim() || "Comment",
        detail: "",
        color: color || undefined,
        customWidth: customWidth !== "normal" ? customWidth : undefined,
      });
      return;
    }

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
      color: color || undefined,
      textPosition,
      textAlign,
      textSize,
      customWidth: customWidth !== "normal" ? customWidth : undefined,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose();
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSave();
    }
  };

  const swatches = isNote ? NOTE_COLOR_PRESETS : NODE_COLOR_PRESETS;
  const currentFill = getNodeFill(color, type, isNote);

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-xs z-[500] flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`bg-white dark:bg-zinc-800 rounded-2xl border border-zinc-200 dark:border-zinc-700 shadow-2xl ${
          isNote ? "w-[440px]" : "w-[560px]"
        } max-w-full max-h-[92vh] flex flex-col overflow-hidden`}
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-4 pb-3.5 border-b border-zinc-200 dark:border-zinc-700 shrink-0">
          <div className="flex items-center gap-2.5">
            <div
              className="w-4 h-4 rounded-full border border-black/20 shadow-xs"
              style={{ backgroundColor: currentFill }}
            />
            <h2 className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-100">
              {isNote ? "Edit Comment / Note" : "Edit Step Anatomy & Layout"}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors text-lg"
          >
            &times;
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1 text-xs">
          {/* If simple comment note */}
          {isNote ? (
            <div className="space-y-4">
              <div>
                <label className="block text-[10.5px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1.5">
                  Comment Text
                </label>
                <textarea
                  ref={noteTextareaRef}
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  rows={4}
                  placeholder="Type your comment or note here..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-900 text-sm text-zinc-900 dark:text-zinc-100 leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              {/* Note Color Swatches */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-[10.5px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Note Color Theme
                  </label>
                  {color && (
                    <button
                      type="button"
                      onClick={() => setColor("")}
                      className="text-[10px] text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 underline"
                    >
                      Reset default
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  {swatches.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setColor(s.id)}
                      title={s.name}
                      className={`w-7 h-7 rounded-full border border-black/10 transition-all ${
                        color === s.id ? "ring-2 ring-offset-2 ring-amber-500 ring-offset-white dark:ring-offset-zinc-800 scale-110 shadow-sm" : "hover:scale-105"
                      }`}
                      style={{ backgroundColor: s.fill }}
                    />
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Type and Color Section */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10.5px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1.5">
                    Node Type
                  </label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value as NodeType)}
                    className="w-full px-3.5 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-900 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {NODE_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10.5px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1.5">
                    SLA / Target Time
                  </label>
                  <input
                    value={sla}
                    onChange={(e) => setSla(e.target.value)}
                    placeholder="e.g. 24 hours, 10 min"
                    className="w-full px-3.5 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {/* Enhanced Node Color Palette & Custom Picker */}
              <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/70 border border-zinc-200 dark:border-zinc-700/80 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="block text-[10.5px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Node Color Accent
                  </label>
                  {color && (
                    <button
                      type="button"
                      onClick={() => setColor("")}
                      className="text-[10.5px] text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 underline"
                    >
                      Reset default ({type})
                    </button>
                  )}
                </div>

                {/* Swatches Grid */}
                <div className="flex items-center gap-2 flex-wrap">
                  {swatches.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setColor(s.id)}
                      title={s.name}
                      className={`w-6 h-6 rounded-full border border-black/15 transition-all ${
                        color === s.id
                          ? "ring-2 ring-offset-2 ring-emerald-500 ring-offset-white dark:ring-offset-zinc-800 scale-110 shadow-sm"
                          : "hover:scale-110 opacity-90 hover:opacity-100"
                      }`}
                      style={{ backgroundColor: s.fill }}
                    />
                  ))}

                  {/* Custom Hex Color Picker */}
                  <div className="flex items-center gap-1.5 pl-2 border-l border-zinc-200 dark:border-zinc-700">
                    <label
                      title="Pick custom color"
                      className={`relative w-6 h-6 rounded-full border border-zinc-300 dark:border-zinc-600 cursor-pointer overflow-hidden flex items-center justify-center transition-transform hover:scale-110 ${
                        color.startsWith("#") ? "ring-2 ring-offset-2 ring-emerald-500 ring-offset-white dark:ring-offset-zinc-800 scale-110" : ""
                      }`}
                      style={{ backgroundColor: customHex }}
                    >
                      <input
                        type="color"
                        value={customHex}
                        onChange={(e) => {
                          setCustomHex(e.target.value);
                          setColor(e.target.value);
                        }}
                        className="opacity-0 absolute inset-0 cursor-pointer w-full h-full"
                      />
                    </label>
                    <span className="text-[10px] text-zinc-400 font-mono">Custom</span>
                  </div>
                </div>
              </div>

              {/* Text Placement & Anti-Overlap Controls */}
              <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/70 border border-zinc-200 dark:border-zinc-700/80 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                    <span>📐</span> Text Placement & Anti-Overlap
                  </span>
                  <span className="text-[10px] text-zinc-400">Prevents clipping & overlapping</span>
                </div>

                {/* Text Position */}
                <div>
                  <label className="block text-[10px] font-semibold uppercase text-zinc-400 mb-1.5">
                    Text Placement Position
                  </label>
                  <div className="grid grid-cols-5 gap-1 bg-white dark:bg-zinc-800 p-1 rounded-lg border border-zinc-200 dark:border-zinc-700">
                    {TEXT_POSITIONS.map((pos) => (
                      <button
                        key={pos.value}
                        type="button"
                        onClick={() => setTextPosition(pos.value)}
                        title={pos.desc}
                        className={`py-1 px-1.5 rounded-md text-[11px] font-medium flex flex-col items-center gap-0.5 transition-all ${
                          textPosition === pos.value
                            ? "bg-emerald-700 text-white shadow-xs"
                            : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-700"
                        }`}
                      >
                        <span className="text-xs">{pos.icon}</span>
                        <span>{pos.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Text Alignment & Text Size */}
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-[10px] font-semibold uppercase text-zinc-400 mb-1.5">
                      Text Alignment
                    </label>
                    <div className="flex bg-white dark:bg-zinc-800 p-1 rounded-lg border border-zinc-200 dark:border-zinc-700">
                      {TEXT_ALIGNS.map((align) => (
                        <button
                          key={align.value}
                          type="button"
                          onClick={() => setTextAlign(align.value)}
                          className={`flex-1 py-1 text-[11px] font-medium rounded transition-all flex items-center justify-center gap-1 ${
                            textAlign === align.value
                              ? "bg-emerald-700 text-white shadow-xs"
                              : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
                          }`}
                        >
                          <span>{align.icon}</span>
                          <span>{align.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold uppercase text-zinc-400 mb-1.5">
                      Font Size
                    </label>
                    <select
                      value={textSize}
                      onChange={(e) => setTextSize(e.target.value as TextSize)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-[11.5px] text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      {TEXT_SIZES.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Node Width Sizing */}
                <div>
                  <label className="block text-[10px] font-semibold uppercase text-zinc-400 mb-1.5">
                    Node Width Sizing
                  </label>
                  <div className="grid grid-cols-4 gap-1.5 bg-white dark:bg-zinc-800 p-1 rounded-lg border border-zinc-200 dark:border-zinc-700">
                    {WIDTH_PRESETS.map((w) => (
                      <button
                        key={w.value}
                        type="button"
                        onClick={() => setCustomWidth(w.value)}
                        className={`py-1 px-2 rounded-md text-[11px] font-medium flex flex-col items-center transition-all ${
                          customWidth === w.value
                            ? "bg-emerald-700 text-white shadow-xs"
                            : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-700"
                        }`}
                      >
                        <span>{w.label}</span>
                        <span className="text-[9px] opacity-70 font-mono">{w.px}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Title and Description */}
              <div>
                <label className="block text-[10.5px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1.5">
                  Label / Title *
                </label>
                <input
                  ref={labelRef}
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="e.g. Verify Device IMEI & Availability"
                  className="w-full px-3.5 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-900 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[10.5px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1.5">
                  Description / Overview
                </label>
                <textarea
                  value={detail}
                  onChange={(e) => setDetail(e.target.value)}
                  rows={2}
                  placeholder="Brief explanation of what happens in this step..."
                  className="w-full px-3.5 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Detailed Execution Fields */}
              <div className="pt-2 border-t border-zinc-200 dark:border-zinc-700 space-y-3">
                <div className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
                  Detailed Procedures & Systems
                </div>

                <div>
                  <label className="block text-[10.5px] font-bold uppercase tracking-wider text-zinc-400 mb-1">
                    Checklist / Procedure (1 per line)
                  </label>
                  <textarea
                    value={agentSteps}
                    onChange={(e) => setAgentSteps(e.target.value)}
                    rows={3}
                    placeholder={"1. Open admin.revibe.me\n2. Search by order number\n3. Click Availability -> Confirmed"}
                    className="w-full px-3.5 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[10.5px] font-bold uppercase tracking-wider text-zinc-400 mb-1">
                    Tools / Systems (comma separated)
                  </label>
                  <input
                    value={tools}
                    onChange={(e) => setTools(e.target.value)}
                    placeholder="Shopify, Revibe Admin, Aramex"
                    className="w-full px-3.5 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex gap-2.5 p-4 border-t border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/50 shrink-0">
          <button
            onClick={() => onDelete(node.id)}
            className="flex-1 px-3 py-2 rounded-xl border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 text-xs font-medium hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
          >
            Delete
          </button>
          {!isNote && (
            <button
              onClick={() => {
                onDuplicate(node);
                onClose();
              }}
              className="flex-1 px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-600 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
            >
              Duplicate
            </button>
          )}
          <button
            onClick={handleSave}
            className={`flex-1 px-4 py-2 rounded-xl ${
              isNote ? "bg-amber-600 hover:bg-amber-500" : "bg-emerald-700 hover:bg-emerald-600"
            } text-white text-xs font-semibold transition-colors shadow-sm`}
          >
            {isNote ? "Save Comment" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
