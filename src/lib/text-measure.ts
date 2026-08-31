/**
 * Text width estimation for SVG labels.
 *
 * Connection labels used to size their background chip with `label.length * 3.3`, which
 * over-shoots for narrow glyphs ("iiii") and badly under-shoots for wide ones ("WWWW") or
 * any non-Latin script — the chip either floated away from the text or clipped it.
 *
 * The obvious fix, measuring through a canvas 2D context, can't be used here: the diagram is
 * server-rendered, there is no canvas on the server, and any fallback estimate would disagree
 * with the client's measurement and blow up hydration. So this is a per-character advance
 * table for Inter instead — the same answer on both sides, and close enough that a chip fits
 * its text at every label length we render.
 */

/** Advance widths in 1/1000 em, sampled from Inter Bold. */
const ADVANCE: Record<string, number> = {
  " ": 260, "!": 300, '"': 400, "#": 640, $: 600, "%": 800, "&": 680, "'": 220,
  "(": 340, ")": 340, "*": 480, "+": 600, ",": 280, "-": 360, ".": 280, "/": 420,
  ":": 280, ";": 280, "<": 600, "=": 600, ">": 600, "?": 520, "@": 900,
  A: 680, B: 660, C: 700, D: 720, E: 600, F: 580, G: 740, H: 740, I: 300, J: 520,
  K: 660, L: 570, M: 900, N: 750, O: 780, P: 640, Q: 780, R: 660, S: 640, T: 620,
  U: 730, V: 680, W: 980, X: 660, Y: 640, Z: 620,
  "[": 340, "\\": 420, "]": 340, "^": 600, _: 500, "`": 400,
  a: 580, b: 610, c: 560, d: 610, e: 580, f: 380, g: 610, h: 600, i: 280, j: 280,
  k: 570, l: 280, m: 900, n: 600, o: 610, p: 610, q: 610, r: 400, s: 540, t: 400,
  u: 600, v: 550, w: 830, x: 550, y: 550, z: 520,
  "{": 380, "|": 280, "}": 380, "~": 600,
};

const DIGIT = 620;
const DEFAULT = 640; // accented Latin, punctuation we haven't tabulated
const WIDE = 1000; // CJK and other full-width scripts

/** Font sizes the label chips are drawn at, kept here so callers can't drift from the SVG. */
export const LABEL_FONT = 10;
export const LABEL_FONT_BOLD = 11;

const cache = new Map<string, number>();

/** Approximate rendered width in px of `text` at `fontSize`, in the label font. */
export function measureText(text: string, fontSize: number = LABEL_FONT): number {
  if (!text) return 0;
  const key = `${fontSize}|${text}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;

  let units = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (ch >= "0" && ch <= "9") units += DIGIT;
    else if (ADVANCE[ch] !== undefined) units += ADVANCE[ch];
    else if (code > 0x2e80) units += WIDE; // CJK, Hangul, and friends are ~1em wide
    else units += DEFAULT;
  }

  const w = (units / 1000) * fontSize;
  if (cache.size > 4000) cache.clear();
  cache.set(key, w);
  return w;
}
