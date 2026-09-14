// Types only — so this file compiles to plain JS with no imports at all, which is what
// lets the MCP server reuse it without pulling the app in.
import type { FlowData, FlowNode } from "./types";

/**
 * The card standards, as checks.
 *
 * These were agreed in review and then re-litigated card by card for weeks, because
 * "looks fine" cannot catch an inconsistency in one card out of a hundred and sixty. Each
 * rule here is a predicate that runs over every card, so a breach cannot pass by being
 * unremarkable. They live in the app rather than in a script so the editor, the exporter
 * and the MCP server all judge a document the same way.
 *
 * `applies` narrows a rule to the cards it is about: R1 has nothing to say about a
 * decision, and reporting it as passing on all 90 non-stage cards would flatter the score.
 */

export type Severity = "breach" | "note";

export interface Rule {
  id: string;
  /** What a reader should be able to assume when this passes. */
  summary: string;
  severity: Severity;
  applies: (n: FlowNode, doc: FlowData) => boolean;
  passes: (n: FlowNode, doc: FlowData) => boolean;
}

export interface Breach {
  rule: string;
  summary: string;
  severity: Severity;
  nodeId: string;
  label: string;
}

export interface StandardsReport {
  cards: number;
  checks: number;
  passed: number;
  /** Rules with severity "breach" that did not pass. This is the number that matters. */
  failed: number;
  /** Rules with severity "note" that fired — things for a person to judge, not errors. */
  notes: number;
  notApplicable: number;
  byRule: { id: string; summary: string; applies: number; failing: number }[];
  breaches: Breach[];
}

/* ------------------------------------------------------------------ vocabulary */

const SHIPMENT = /\b(pickup|naif|return)?_?shipment[ _]?status\b/i;
const LOOSE_STAGE =
  /\bstage\s*=|\bstage\s*:|^stage\b|\bIS\s*[=+]|\bES\s*=|internal[ _]stage|external[ _]stage|return_claim_stage/i;
const SHIPMENT_VALUE = /^(Pending|Created|Shipped|Delivered|Failed)$/;

/** Which shipping leg a stage sits on. A stage on a leg must carry that leg's column, or
 *  the format is on one card and not on its neighbour — the complaint that started this. */
export const STAGE_LEG: Record<string, string> = {
  "Pending collection": "pickup_shipment_status",
  "Under collection": "pickup_shipment_status",
  "In transit": "pickup_shipment_status",
  "Under QC": "pickup_shipment_status",
  "Collection failed": "pickup_shipment_status",
  "Send to LAB": "naif_shipment_status",
  "Pending LAB collection": "naif_shipment_status",
  "In transit to LAB": "naif_shipment_status",
  "LAB under QC": "naif_shipment_status",
  "LAB to Seller": "naif_shipment_status",
  "Pending LAB to seller collection": "naif_shipment_status",
  "In transit from LAB to seller": "naif_shipment_status",
  "Delivered LAB to seller": "naif_shipment_status",
  "To ship back": "return_shipment_status",
  "Ship back under collection": "return_shipment_status",
  "Shipped back": "return_shipment_status",
  Delivered: "return_shipment_status",
};

const text = (n: FlowNode) => [n.label || "", n.detail || "", ...(n.agentSteps || [])];

/* ----------------------------------------------------------------------- rules */

export const RULES: Rule[] = [
  {
    id: "R1",
    summary: "A stage card is titled with its internal stage and nothing else",
    severity: "breach",
    applies: (n) => !!n.internalStage,
    passes: (n) => n.label === n.internalStage,
  },
  {
    id: "R2",
    summary: "“Stage” is never used loosely — it names the external column",
    severity: "breach",
    applies: (n) => n.type !== "note",
    passes: (n) => !text(n).some((t) => LOOSE_STAGE.test(t)),
  },
  {
    id: "R3",
    summary: "A shipment status lives in a field, never in a title or prose",
    severity: "breach",
    applies: (n) => n.type !== "note",
    passes: (n) =>
      !text(n).some((t) => SHIPMENT.test(t)) && !/\[[^\]]*=[^\]]*\]/.test(n.detail || ""),
  },
  {
    id: "R4",
    summary: "Every stage on a shipping leg carries that leg's status",
    severity: "breach",
    applies: (n) => !!n.internalStage && !!STAGE_LEG[n.internalStage],
    passes: (n) =>
      (n.conditions || []).some(
        (c) => c.field === STAGE_LEG[n.internalStage!] && SHIPMENT_VALUE.test(c.value)
      ),
  },
  {
    id: "R5",
    summary: "Stage pairs are complete, with no deprecated fields left behind",
    severity: "breach",
    applies: (n) => !!(n.internalStage || n.externalStage),
    passes: (n) => !!n.internalStage && !n.stage && !n.stageKind,
  },
  {
    id: "R6",
    summary: "A step, decision, stage and condition each look like what they are",
    severity: "breach",
    applies: (n) => n.type !== "note",
    passes: (n) => {
      const asks = /\?\s*$/.test(n.label || "");
      if (asks && n.type !== "decision") return false;
      if (!asks && n.type === "decision") return false;
      // A title that assigns a field is a condition wearing a step's clothes.
      if (n.type !== "decision" && /=/.test(n.label || "")) return false;
      return true;
    },
  },
  {
    id: "R7",
    summary: "Timing sits in the SLA field, not buried in prose",
    severity: "breach",
    applies: (n) => n.type !== "note",
    passes: (n) => {
      const d = n.detail || "";
      if (!n.sla && /\bSLA\b|\b\d+\s*(business\s*)?(day|days|hours)\b/i.test(d)) return false;
      if (n.sla && /\bSLA\b\s*:/i.test(d)) return false;
      return true;
    },
  },
  {
    id: "R8",
    summary: "Cards with the same title have the same owner, type and fields",
    severity: "breach",
    applies: () => true,
    passes: (n, doc) => {
      const key = (x: FlowNode) => (x.label || "").toLowerCase().replace(/\s+/g, " ").trim();
      const twins = doc.nodes.filter((x) => (x.level ?? 3) === (n.level ?? 3) && key(x) === key(n));
      if (twins.length < 2) return true;
      const shape = (x: FlowNode) =>
        `${x.type}|${x.actor || "-"}|${(x.conditions || []).map((c) => c.field).sort().join(",")}`;
      return new Set(twins.map(shape)).size === 1;
    },
  },
  {
    id: "R10",
    summary: "Every card says who does it",
    severity: "breach",
    applies: (n) => n.type !== "note",
    passes: (n) => !!n.actor,
  },
  {
    id: "R11",
    summary: "No working notes left on the canvas",
    severity: "note",
    applies: (n) => n.type === "note",
    passes: () => false, // a note always reports; it is for a human to judge, not a breach
  },
];

/* --------------------------------------------------------------------- runner */

/** Runs every rule over the given level (3 by default — the detailed view). */
export function checkStandards(doc: FlowData, level: 1 | 2 | 3 = 3): StandardsReport {
  const cards = (doc.nodes || []).filter((n) => (n.level ?? 3) === level);

  let checks = 0;
  let passed = 0;
  let failed = 0;
  let notes = 0;
  let notApplicable = 0;
  const breaches: Breach[] = [];
  const byRule: StandardsReport["byRule"] = [];

  for (const rule of RULES) {
    let applies = 0;
    let failing = 0;
    for (const n of cards) {
      if (!rule.applies(n, doc)) {
        notApplicable++;
        continue;
      }
      applies++;
      checks++;
      if (rule.passes(n, doc)) {
        passed++;
      } else {
        if (rule.severity === "breach") failed++;
        else notes++;
        failing++;
        breaches.push({
          rule: rule.id,
          summary: rule.summary,
          severity: rule.severity,
          nodeId: n.id,
          label: n.label || "",
        });
      }
    }
    byRule.push({ id: rule.id, summary: rule.summary, applies, failing });
  }

  return { cards: cards.length, checks, passed, failed, notes, notApplicable, byRule, breaches };
}

/** Pathways that run far right-to-left. A loop back to an earlier decision is legitimate;
 *  a jump across the whole diagram is the movement readers get lost in, so this reports
 *  rather than fails. */
export function longBackwardPathways(doc: FlowData, minPx = 1500) {
  const byId = new Map((doc.nodes || []).map((n) => [n.id, n]));
  const out: { from: string; to: string; px: number }[] = [];
  for (const c of doc.connections || []) {
    const a = byId.get(c.from);
    const b = byId.get(c.to);
    if (!a || !b || (a.level ?? 3) !== 3) continue;
    const dx = b.x - (a.x + (a.size?.w ?? 210));
    if (dx < -minPx) out.push({ from: a.label, to: b.label, px: Math.round(-dx) });
  }
  return out.sort((x, y) => y.px - x.px);
}

/** Disconnected pieces. A flow should be one; the wrong-device drawing was six, which is
 *  why it read as a mess before anyone looked at the cards. */
export function components(doc: FlowData, level: 1 | 2 | 3 = 3): number[] {
  const cards = (doc.nodes || []).filter((n) => (n.level ?? 3) === level && n.type !== "note");
  const ids = new Set(cards.map((n) => n.id));
  const adj = new Map(cards.map((n) => [n.id, [] as string[]]));
  for (const c of doc.connections || []) {
    if (!ids.has(c.from) || !ids.has(c.to)) continue;
    adj.get(c.from)!.push(c.to);
    adj.get(c.to)!.push(c.from);
  }
  const seen = new Set<string>();
  const sizes: number[] = [];
  for (const n of cards) {
    if (seen.has(n.id)) continue;
    const stack = [n.id];
    seen.add(n.id);
    let size = 0;
    while (stack.length) {
      const x = stack.pop()!;
      size++;
      for (const y of adj.get(x) || []) if (!seen.has(y)) { seen.add(y); stack.push(y); }
    }
    sizes.push(size);
  }
  return sizes.sort((a, b) => b - a);
}
