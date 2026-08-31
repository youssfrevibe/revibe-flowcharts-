import { FlowConnection, FlowNode } from "./types";
import { Size, computeBounds, sizeOf } from "./graph";
import { getNodeFill, ACTOR_STYLES } from "./node-colors";
import { computeRoutes, roundedPath, CORNER } from "./routing";

const EDGE_STROKE: Record<string, string> = {
  "": "#94a3b8",
  cyes: "#059669",
  cno: "#dc2626",
  camber: "#d97706",
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
  const pad = opts.pad ?? 56;
  const bg = opts.background ?? "#0f172a";
  const bounds = computeBounds(nodes, sizes);
  if (!bounds) return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"></svg>`, width: 100, height: 100 };

  const W = Math.ceil(bounds.w + pad * 2);
  const H = Math.ceil(bounds.h + pad * 2);
  const ox = pad - bounds.minX;
  const oy = pad - bounds.minY;

  const markers = Object.entries(EDGE_STROKE)
    .map(
      ([k, color]) =>
        `<marker id="a${k || "d"}" markerWidth="9" markerHeight="9" refX="7" refY="4" orient="auto"><polygon points="0,0 8,4 0,8" fill="${color}"/></marker>`
    )
    .join("");

  const routes = computeRoutes(nodes, connections, sizes);
  const shift = (r: { pts: { x: number; y: number }[] }) =>
    roundedPath(r.pts.map((p) => ({ x: p.x + ox, y: p.y + oy })), CORNER);

  const edges = routes
    .map((r) => {
      const color = EDGE_STROKE[r.conn.type] || EDGE_STROKE[""];
      const strokeWidth = r.bold ? "3.5" : "1.85";
      const glow = r.bold
        ? `<path d="${shift(r)}" fill="none" stroke="${color}" stroke-opacity="0.25" stroke-width="7" stroke-linejoin="round" stroke-linecap="round"/>`
        : "";
      const lb = r.labelBox;
      const label =
        r.label && lb
          ? `<g><rect x="${lb.x + ox}" y="${lb.y + oy}" width="${lb.w}" height="${lb.h}" rx="6" fill="#1e293b" fill-opacity="0.95" stroke="#334155" stroke-width="1"/>` +
            `<text x="${lb.cx + ox}" y="${lb.cy + oy}" text-anchor="middle" dominant-baseline="central" font-family="Inter, system-ui, sans-serif" font-size="${
              r.bold ? 11 : 10
            }" font-weight="700" fill="${color}">${esc(r.label)}</text></g>`
          : "";
      return `${glow}<path d="${shift(r)}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linejoin="round" stroke-linecap="round" marker-end="url(#a${
        r.conn.type || "d"
      })"/>${label}`;
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
    ok: "SUCCESS",
    fail: "FAILURE",
    step: "PROCESS STEP",
    sub: "SUB-PROCESS",
    decision: "DECISION",
    note: "NOTE",
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
      const actorStyle = n.actor ? ACTOR_STYLES[n.actor] : null;
      const actorRing = actorStyle ? `stroke="${actorStyle.ring}" stroke-width="2.5"` : `stroke="#334155" stroke-width="1"`;

      // Sticky Comment Note
      if (isNote) {
        const labelLines = wrap(n.label || "", Math.floor(s.w / 8), 4);
        let ty = y + 32;
        const textSvg = labelLines
          .map((l) => {
            const t = `<text x="${x + 14}" y="${ty}" font-family="Inter, system-ui, sans-serif" font-size="12" font-weight="500" fill="#451a03">${esc(l)}</text>`;
            ty += 16;
            return t;
          })
          .join("");
        return `<g><rect x="${x}" y="${y}" width="${s.w}" height="${s.h}" rx="12" fill="${fill}" stroke="#fbbf24" stroke-width="1.5"/><text x="${x + 14}" y="${y + 18}" font-family="Inter, system-ui, sans-serif" font-size="9" font-weight="700" letter-spacing="0.5" fill="#78350f">STICKY NOTE</text>${textSvg}</g>`;
      }

      // External label positioning
      const textPos = n.textPosition || "inside";
      if (textPos !== "inside") {
        const iconSize = shape === "decision" ? 54 : 38;
        const bg =
          shape === "decision"
            ? `<polygon points="${cx},${cy - iconSize / 2} ${cx + iconSize / 2},${cy} ${cx},${cy + iconSize / 2} ${cx - iconSize / 2},${cy}" fill="${fill}" ${actorRing}/>`
            : `<rect x="${cx - iconSize}" y="${cy - iconSize / 2}" width="${iconSize * 2}" height="${iconSize}" rx="${shape === "terminator" ? iconSize / 2 : 8}" fill="${fill}" ${actorRing}/>`;

        const labelLines = wrap(n.label || "", Math.floor(s.w / 8), 2);
        const detailLines = n.detail ? wrap(n.detail, Math.floor(s.w / 6), 2) : [];
        const labelSvg = labelLines
          .map((l, i) => `<text x="${cx}" y="${cy + iconSize / 2 + 16 + i * 14}" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="12.5" font-weight="700" fill="#f8fafc">${esc(l)}</text>`)
          .join("");
        const detailSvg = detailLines
          .map((l, i) => `<text x="${cx}" y="${cy + iconSize / 2 + 16 + labelLines.length * 14 + i * 12}" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="10.5" fill="#94a3b8">${esc(l)}</text>`)
          .join("");

        return `<g>${bg}${labelSvg}${detailSvg}</g>`;
      }

      // Diamond (decision) and stadium (terminator)
      if (shape === "decision" || shape === "terminator") {
        const bg =
          shape === "decision"
            ? `<polygon points="${cx},${y} ${x + s.w},${cy} ${cx},${y + s.h} ${x},${cy}" fill="${fill}" ${actorRing}/>`
            : `<rect x="${x}" y="${y}" width="${s.w}" height="${s.h}" rx="${s.h / 2}" fill="${fill}" ${actorRing}/>`;
        const labelLines = wrap(n.label || "", Math.floor(s.w / (shape === "decision" ? 11 : 8)), 3);
        const detailLines =
          shape === "terminator" && n.detail ? wrap(n.detail, Math.floor(s.w / 6), 1) : [];
        const lh = 16;
        const blockH = labelLines.length * lh + detailLines.length * 13 + 12;
        let ty = cy - blockH / 2 + 16;
        const kicker = `<text x="${cx}" y="${ty - 12}" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="8.5" font-weight="800" letter-spacing="0.6" fill="#ffffffaa">${esc(
          TYPE_LABEL[n.type] || ""
        )}</text>`;
        const labelSvg = labelLines
          .map((l) => {
            const t = `<text x="${cx}" y="${ty}" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="12.5" font-weight="700" fill="#ffffff">${esc(l)}</text>`;
            ty += lh;
            return t;
          })
          .join("");
        const detailSvg = detailLines
          .map((l) => {
            const t = `<text x="${cx}" y="${ty}" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="10" fill="#ffffffcc">${esc(l)}</text>`;
            ty += 13;
            return t;
          })
          .join("");
        return `<g>${bg}${kicker}${labelSvg}${detailSvg}</g>`;
      }

      // Process / sub-process: rectangle
      const labelLines = wrap(n.label || "", Math.floor(s.w / 8), 2);
      const detailLines = n.detail ? wrap(n.detail, Math.floor(s.w / 6), 2) : [];
      const pad = shape === "subprocess" ? 22 : 16;
      const bars =
        shape === "subprocess"
          ? `<line x1="${x + 7}" y1="${y}" x2="${x + 7}" y2="${y + s.h}" stroke="#ffffff55" stroke-width="1.5"/><line x1="${x + s.w - 7}" y1="${y}" x2="${x + s.w - 7}" y2="${y + s.h}" stroke="#ffffff55" stroke-width="1.5"/>`
          : "";
      let ty = y + 36;
      const labelSvg = labelLines
        .map((l) => {
          const t = `<text x="${x + pad}" y="${ty}" font-family="Inter, system-ui, sans-serif" font-size="13" font-weight="700" fill="#ffffff">${esc(l)}</text>`;
          ty += 17;
          return t;
        })
        .join("");
      ty += 2;
      const detailSvg = detailLines
        .map((l) => {
          const t = `<text x="${x + pad}" y="${ty}" font-family="Inter, system-ui, sans-serif" font-size="11" fill="#cbd5e1">${esc(l)}</text>`;
          ty += 14;
          return t;
        })
        .join("");

      // Actor Pill in Top Right
      const actorSvg = actorStyle
        ? `<rect x="${x + s.w - 80}" y="${y + 8}" width="72" height="18" rx="4" fill="${actorStyle.ring}33" stroke="${actorStyle.ring}" stroke-width="1"/>` +
          `<text x="${x + s.w - 44}" y="${y + 20}" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="8.5" font-weight="700" fill="${actorStyle.ring}">${esc(
            actorStyle.label
          )}</text>`
        : "";

      return `<g><rect x="${x}" y="${y}" width="${s.w}" height="${s.h}" rx="12" fill="${fill}" ${actorRing}/>${bars}<text x="${x + pad}" y="${y + 19}" font-family="Inter, system-ui, sans-serif" font-size="9" font-weight="800" letter-spacing="0.6" fill="#ffffff99">${esc(
        TYPE_LABEL[n.type] || (n.type || "").toUpperCase()
      )}</text>${actorSvg}${labelSvg}${detailSvg}</g>`;
    })
    .join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${markers}</defs><rect width="${W}" height="${H}" fill="${bg}"/>${edges}${nodeSvg}</svg>`;
  return { svg, width: W, height: H };
}
