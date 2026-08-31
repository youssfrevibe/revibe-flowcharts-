"use client";

import { useState } from "react";
import { FlowNode, FlowConnection, NodeType } from "@/lib/types";
import { generateNodeId } from "@/lib/diagram-store";

interface StepForm {
  label: string;
  type: NodeType;
  detail: string;
  tools: string;
  sla: string;
  agentSteps: string;
}

interface Props {
  onImportProcess: (nodes: FlowNode[], connections: FlowConnection[]) => void;
  onClose: () => void;
}

export default function ProcessHandoverForm({ onImportProcess, onClose }: Props) {
  const [steps, setSteps] = useState<StepForm[]>([
    {
      label: "Customer Submits Request",
      type: "start",
      detail: "Customer creates a request or order on the site",
      tools: "Revibe Store, Shopify",
      sla: "Instant",
      agentSteps: "Check incoming notification in admin panel",
    },
    {
      label: "Agent Verifies Details",
      type: "step",
      detail: "Verify customer information, payment status, and IMEI",
      tools: "admin.revibe.me, Tamara Dashboard",
      sla: "24 hours",
      agentSteps: "1. Search customer by email or order ID\n2. Verify Tamara / COD payment confirmation\n3. Confirm device availability with supplier",
    },
    {
      label: "Is Device Available?",
      type: "decision",
      detail: "Confirm physical stock with assigned supplier",
      tools: "Supplier Portal",
      sla: "12 hours",
      agentSteps: "Check stock allocation list in warehouse app",
    },
    {
      label: "Ship Order to Customer",
      type: "ok",
      detail: "Hand package to shipping courier",
      tools: "Aramex, SMSA, Naqel",
      sla: "48 hours",
      agentSteps: "1. Generate Airway Bill (AWB)\n2. Affix tracking tag\n3. Mark order status as Shipped",
    },
  ]);

  const addStep = () => {
    setSteps((prev) => [
      ...prev,
      {
        label: "",
        type: "step",
        detail: "",
        tools: "",
        sla: "",
        agentSteps: "",
      },
    ]);
  };

  const removeStep = (idx: number) => {
    setSteps((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateStep = (idx: number, field: keyof StepForm, value: string) => {
    setSteps((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, [field]: value } : s))
    );
  };

  const handleGenerateFlowchart = (e: React.FormEvent) => {
    e.preventDefault();

    const generatedNodes: FlowNode[] = [];
    const generatedConnections: FlowConnection[] = [];

    const startX = 450;
    let currentY = 50;
    const ySpacing = 160;

    steps.forEach((step, idx) => {
      const id = generateNodeId();
      const node: FlowNode = {
        id,
        type: step.type,
        x: startX,
        y: currentY,
        label: step.label || `Step ${idx + 1}`,
        detail: step.detail || "No description provided",
        tools: step.tools ? step.tools.split(",").map((t) => t.trim()).filter(Boolean) : [],
        sla: step.sla.trim(),
        agentSteps: step.agentSteps ? step.agentSteps.split("\n").map((s) => s.trim()).filter(Boolean) : [],
      };
      generatedNodes.push(node);

      if (idx > 0) {
        generatedConnections.push({
          id: `c_${idx}_${Date.now()}`,
          from: generatedNodes[idx - 1].id,
          to: id,
          label: generatedNodes[idx - 1].type === "decision" ? "Yes" : "",
          type: generatedNodes[idx - 1].type === "decision" ? "cyes" : "",
        });
      }

      currentY += ySpacing;
    });

    onImportProcess(generatedNodes, generatedConnections);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-xs z-[800] flex items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white dark:bg-zinc-800 rounded-2xl shadow-2xl w-[720px] max-w-full max-h-[92vh] flex flex-col overflow-hidden border border-zinc-200 dark:border-zinc-700">
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-700/80 bg-zinc-50/50 dark:bg-zinc-900/40 shrink-0">
          <div>
            <h2 className="text-[16px] font-bold font-display text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <span>📋</span> Process Intake & Handover Form
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Fill in the operational steps sequentially to automatically construct the process flowchart & agent SOPs.
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors text-lg"
          >
            &times;
          </button>
        </div>

        <form onSubmit={handleGenerateFlowchart} className="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
          {steps.map((step, idx) => (
            <div
              key={idx}
              className="p-4 rounded-2xl border border-zinc-200/90 dark:border-zinc-700/80 bg-zinc-50/70 dark:bg-zinc-900/40 space-y-3 relative shadow-2xs"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-sky-600 dark:text-sky-400 uppercase tracking-wider text-[10.5px]">
                  Step {idx + 1}
                </span>
                {steps.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeStep(idx)}
                    className="text-red-500 hover:text-red-700 text-xs font-semibold"
                  >
                    Remove
                  </button>
                )}
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Step Name / Action Title *
                  </label>
                  <input
                    type="text"
                    required
                    value={step.label}
                    onChange={(e) => updateStep(idx, "label", e.target.value)}
                    placeholder="e.g. Verify Tamara Installment ID"
                    className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 text-xs focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Step Type
                  </label>
                  <select
                    value={step.type}
                    onChange={(e) => updateStep(idx, "type", e.target.value as NodeType)}
                    className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 text-xs focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  >
                    <option value="start">Start Process</option>
                    <option value="step">Action Step</option>
                    <option value="decision">Decision Point</option>
                    <option value="sub">Sub-process</option>
                    <option value="ok">Success Outcome</option>
                    <option value="fail">Failure Outcome</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Tools / Systems Used
                  </label>
                  <input
                    type="text"
                    value={step.tools}
                    onChange={(e) => updateStep(idx, "tools", e.target.value)}
                    placeholder="e.g. admin.revibe.me, Zendesk, Aramex"
                    className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 text-xs focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    SLA / Target Time
                  </label>
                  <input
                    type="text"
                    value={step.sla}
                    onChange={(e) => updateStep(idx, "sla", e.target.value)}
                    placeholder="e.g. 24h, 48h, Instant"
                    className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 text-xs focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Agent Step-by-Step Procedure (1 per line)
                </label>
                <textarea
                  rows={3}
                  value={step.agentSteps}
                  onChange={(e) => updateStep(idx, "agentSteps", e.target.value)}
                  placeholder={"1. Open admin panel\n2. Search by order ID\n3. Confirm status"}
                  className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 text-xs focus:ring-2 focus:ring-sky-500 focus:outline-none font-mono"
                />
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={addStep}
            className="w-full py-3 border-2 border-dashed border-zinc-300 dark:border-zinc-700 hover:border-sky-500 text-zinc-600 dark:text-zinc-300 font-semibold text-xs rounded-2xl transition-colors flex items-center justify-center gap-2"
          >
            ＋ Add Another Process Step
          </button>
        </form>

        <div className="flex items-center justify-between p-4 border-t border-zinc-200 dark:border-zinc-700/80 bg-zinc-50/50 dark:bg-zinc-900/40 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleGenerateFlowchart}
            className="px-5 py-2 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white font-semibold text-xs rounded-xl transition-all shadow-md shadow-sky-500/20"
          >
            Build Interactive Flowchart
          </button>
        </div>
      </div>
    </div>
  );
}
