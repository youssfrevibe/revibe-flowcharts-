import { FlowConnection, FlowNode } from "./types";
import { Size, bestPorts, portPos, computeBounds, sizeOf } from "./graph";
import { getNodeFill } from "./node-colors";

const EDGE_STROKE: Record<string, string> = {
  "": "#a1a1aa",
  cyes: "#10b981",
  cno: "#ef4444",
  camber: "#f59e0b",
};

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function wrap(text: string, max: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > max) {
      if (cur) lines.push(cur);
      cur = w;
      if (lines.length >= maxLines) break;
    } else {
      cur = (cur + " " + w).trim();
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  if (lines.length === maxLines && words.join(" ").length > lines.join(" ").length) {
    lines[maxLines - 1] = lines[maxLines - 1].replace(/.{1}$/, "…");
  }
  return lines;
}

/** Builds a standalone, self-contained SVG string of the diagram (for SVG/PNG export). */
export function buildDiagramSVG(
  nodes: FlowNode[],
  connections: FlowConnection[],
  sizes: Map<string, Size>,
  opts: { pad?: number; background?: string } = {}
): { svg: string; width: number; height: number } {
  const pad = opts.pad ?? 48;
  const bg = opts.background ?? "#f4f4f5";
  const bounds = computeBounds(nodes, sizes);
  if (!bounds) return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"></svg>`, width: 100, height: 100 };

  const W = Math.ceil(bounds.w + pad * 2);
  const H = Math.ceil(bounds.h + pad * 2);
  const ox = pad - bounds.minX;
  const oy = pad - bounds.minY;
  const byId = new Map(nodes.map((n) => [n.id, n]));

  const markers = Object.entries(EDGE_STROKE)
    .map(
      ([k, color]) =>
        `<marker id="a${k || "d"}" markerWidth="9" markerHeight="9" refX="7" refY="4" orient="auto"><polygon points="0,0 8,4 0,8" fill="${color}"/></marker>`
    )
    .join("");

  const edges = connections
    .map((c) => {
      const fn = byId.get(c.from);
      const tn = byId.get(c.to);
      if (!fn || !tn) return "";
      const auto = bestPorts(fn, tn, sizes);
      const fp = c.fromPort || auto.fp;
      const tp = c.toPort || auto.tp;
      const st = portPos(fn, fp, sizes);
      const en = portPos(tn, tp, sizes);
      const vertical = fp === "top" || fp === "bottom";
      const tens = Math.min(Math.abs(vertical ? en.y - st.y : en.x - st.x) * 0.5, 110) + 20;
      const c1 = fp === "bottom" ? { x: st.x, y: st.y + tens } : fp === "top" ? { x: st.x, y: st.y - tens } : fp === "right" ? { x: st.x + tens, y: st.y } : { x: st.x - tens, y: st.y };
      const c2 = tp === "bottom" ? { x: en.x, y: en.y + tens } : tp === "top" ? { x: en.x, y: en.y - tens } : tp === "right" ? { x: en.x + tens, y: en.y } : { x: en.x - tens, y: en.y };
      const d = `M${st.x + ox},${st.y + oy} C${c1.x + ox},${c1.y + oy} ${c2.x + ox},${c2.y + oy} ${en.x + ox},${en.y + oy}`;
      const color = EDGE_STROKE[c.type];
      const label = c.label
        ? `<text x="${(st.x + en.x) / 2 + ox}" y="${(st.y + en.y) / 2 + oy - 5}" text-anchor="middle" font-family="sans-serif" font-size="11" font-weight="700" fill="${color}">${esc(c.label)}</text>`
        : "";
      const strokeWidth = c.bold ? "3.5" : "1.5";
      return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" marker-end="url(#a${c.type || "d"})"/>${label}`;
    })
    .join("");

  const SHAPE: Record<string, "process" | "terminator" | "decision" | "subprocess" | "note"> = {
    start: "terminator",
    ok: "terminator",
    fail: "terminator",
    step: "process",
    sub: "subprocess",
    decision: "decision",
    note: "note",
  };
  const TYPE_LABEL: Record<string, string> = {
    start: "START",
    ok: "OUTCOME",
    fail: "OUTCOME",
    step: "PROCESS STEP",
    sub: "SUB-PROCESS",
    decision: "DECISION",
    note: "COMMENT",
  };

  const nodeSvg = nodes
    .map((n) => {
      const s = sizeOf(n.id, sizes);
      const x = n.x + ox;
      const y = n.y + oy;
      const cx = x + s.w / 2;
      const cy = y + s.h / 2;
      const shape = SHAPE[n.type] || "process";
      const isNote = shape === "note";
      const fill = getNodeFill(n.color, n.type, isNote);

      // Sticky Comment Note
      if (isNote) {
        const labelLines = wrap(n.label || "", Math.floor(s.w / 8), 4);
        let ty = y + 32;
        const textSvg = labelLines
          .map((l) => {
            const t = `<text x="${x + 12}" y="${ty}" font-family="sans-serif" font-size="12" font-weight="500" fill="#451a03">${esc(l)}</text>`;
            ty += 16;
            return t;
          })
          .join("");
        return `<g><rect x="${x}" y="${y}" width="${s.w}" height="${s.h}" rx="10" fill="${fill}" stroke="#fde047" stroke-width="1"/><text x="${x + 12}" y="${y + 16}" font-family="sans-serif" font-size="9" font-weight="700" letter-spacing="0.5" fill="#78350f99">COMMENT</text>${textSvg}</g>`;
      }

      // External label positioning (Anti-Overlap)
      const textPos = n.textPosition || "inside";
      if (textPos !== "inside") {
        const iconSize = shape === "decision" ? 50 : 36;
        const bg =
          shape === "decision"
            ? `<polygon points="${cx},${cy - iconSize / 2} ${cx + iconSize / 2},${cy} ${cx},${cy + iconSize / 2} ${cx - iconSize / 2},${cy}" fill="${fill}"/>`
            : `<rect x="${cx - iconSize}" y="${cy - iconSize / 2}" width="${iconSize * 2}" height="${iconSize}" rx="${shape === "terminator" ? iconSize / 2 : 6}" fill="${fill}"/>`;

        const labelLines = wrap(n.label || "", Math.floor(s.w / 8), 2);
        const detailLines = n.detail ? wrap(n.detail, Math.floor(s.w / 6), 2) : [];
        const labelSvg = labelLines
          .map((l, i) => `<text x="${cx}" y="${cy + iconSize / 2 + 16 + i * 14}" text-anchor="middle" font-family="sans-serif" font-size="12" font-weight="700" fill="#18181b">${esc(l)}</text>`)
          .join("");
        const detailSvg = detailLines
          .map((l, i) => `<text x="${cx}" y="${cy + iconSize / 2 + 16 + labelLines.length * 14 + i * 12}" text-anchor="middle" font-family="sans-serif" font-size="10" fill="#71717a">${esc(l)}</text>`)
          .join("");

        return `<g>${bg}${labelSvg}${detailSvg}</g>`;
      }

      // Diamond (decision) and stadium (terminator): centered text.
      if (shape === "decision" || shape === "terminator") {
        const bg =
          shape === "decision"
            ? `<polygon points="${cx},${y} ${x + s.w},${cy} ${cx},${y + s.h} ${x},${cy}" fill="${fill}"/>`
            : `<rect x="${x}" y="${y}" width="${s.w}" height="${s.h}" rx="${s.h / 2}" fill="${fill}"/>`;
        const labelLines = wrap(n.label || "", Math.floor(s.w / (shape === "decision" ? 11 : 8)), 3);
        const detailLines =
          shape === "terminator" && n.detail ? wrap(n.detail, Math.floor(s.w / 6), 1) : [];
        const lh = 16;
        const blockH = labelLines.length * lh + detailLines.length * 13 + 12;
        let ty = cy - blockH / 2 + 16;
        const kicker = `<text x="${cx}" y="${ty - 12}" text-anchor="middle" font-family="sans-serif" font-size="8" font-weight="700" letter-spacing="0.5" fill="#ffffff99">${esc(
          TYPE_LABEL[n.type] || ""
        )}</text>`;
        const labelSvg = labelLines
          .map((l) => {
            const t = `<text x="${cx}" y="${ty}" text-anchor="middle" font-family="sans-serif" font-size="12.5" font-weight="700" fill="#ffffff">${esc(l)}</text>`;
            ty += lh;
            return t;
          })
          .join("");
        const detailSvg = detailLines
          .map((l) => {
            const t = `<text x="${cx}" y="${ty}" text-anchor="middle" font-family="sans-serif" font-size="10" fill="#ffffffcc">${esc(l)}</text>`;
            ty += 13;
            return t;
          })
          .join("");
        return `<g>${bg}${kicker}${labelSvg}${detailSvg}</g>`;
      }

      // Process / sub-process: rectangle, left-aligned text (sub adds double side bars).
      const labelLines = wrap(n.label || "", Math.floor(s.w / 8), 2);
      const detailLines = n.detail ? wrap(n.detail, Math.floor(s.w / 6), 2) : [];
      const pad = shape === "subprocess" ? 20 : 14;
      const bars =
        shape === "subprocess"
          ? `<line x1="${x + 6}" y1="${y}" x2="${x + 6}" y2="${y + s.h}" stroke="#ffffff66"/><line x1="${x + s.w - 6}" y1="${y}" x2="${x + s.w - 6}" y2="${y + s.h}" stroke="#ffffff66"/>`
          : "";
      let ty = y + 34;
      const labelSvg = labelLines
        .map((l) => {
          const t = `<text x="${x + pad}" y="${ty}" font-family="sans-serif" font-size="13" font-weight="700" fill="#ffffff">${esc(l)}</text>`;
          ty += 17;
          return t;
        })
        .join("");
      ty += 2;
      const detailSvg = detailLines
        .map((l) => {
          const t = `<text x="${x + pad}" y="${ty}" font-family="sans-serif" font-size="11" fill="#ffffffcc">${esc(l)}</text>`;
          ty += 14;
          return t;
        })
        .join("");
      return `<g><rect x="${x}" y="${y}" width="${s.w}" height="${s.h}" rx="10" fill="${fill}"/>${bars}<text x="${x + pad}" y="${y + 17}" font-family="sans-serif" font-size="9" font-weight="700" letter-spacing="0.5" fill="#ffffff99">${esc(
        TYPE_LABEL[n.type] || (n.type || "").toUpperCase()
      )}</text>${labelSvg}${detailSvg}</g>`;
    })
    .join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${markers}</defs><rect width="${W}" height="${H}" fill="${bg}"/>${edges}${nodeSvg}</svg>`;
  return { svg, width: W, height: H };
}
