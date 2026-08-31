# Import & export

## Importing

Three entry points, two code paths:

| Entry | Where | Path |
|---|---|---|
| **Import JSON** (gallery header) | `app/page.tsx` | `deployFlowchartJSON` |
| **Paste JSON** (gallery header) | `app/page.tsx` | `deployFlowchartJSON` |
| **Drop a file onto the canvas** | `FlowCanvas.tsx` | `loadParsedJSON` |

The first two create a **new** diagram and navigate to it. The third **replaces**
the open diagram (after a version snapshot).

### `deployFlowchartJSON(raw, fallbackTitle)`

Validates, creates, saves, marks for arrange, navigates. Rejections:

- unparseable JSON
- missing or empty `nodes`
- a node without a string `id`
- duplicate node ids

Connections referencing absent nodes are **dropped rather than rejected** — they
would otherwise render as lines into empty space. If `connections` is missing
entirely and there is more than one node, a linear chain is synthesised in
reading order so the import is at least navigable.

### Coordinates are not trusted

Source coordinates are saved as-is and **re-arranged on first open**, not at import
time. Auto-layout needs measured card sizes, which only exist on the canvas. The
importer writes the new slug to `localStorage` under `ARRANGE_ON_OPEN_KEY`; the
canvas consumes it once `docSettled` is true and runs `measureThenLayout`.

> **Trap.** Do not "fix" this by arranging at import time. There are no measurements
> there and you will get the 210×84-fallback overlap bug. Do not key the consumption
> off `loaded` either — the cloud fetch will overwrite the arrange. See
> [canvas.md](canvas.md) and [persistence.md](persistence.md).

### What real-world JSON looks like

Exported Revibe process JSON typically has coordinates sprawling over 20,000px,
`type: ""` on most connections (valid — it is the default `ConnType`), `waypoints`
and port pins from hand-editing, snake_case stage aliases, and rework loops that
make the graph cyclic. All of that is handled: `normalize()` migrates the fields
(see [persistence.md](persistence.md)), `measureThenLayout` strips the stale
waypoints, and `autoLayout` breaks the cycles (see [layout.md](layout.md)).

## Exporting

`lib/export-svg.ts` → `buildDiagramSVG(nodes, connections, sizes)` produces
`{ svg, width, height }`.

It uses the **same** `computeRoutes` as the screen. That is the whole point of
keeping `routing.ts` React-free — the two used to diverge and the export never
matched what you saw.

From it the canvas derives:

- **SVG** — the string, downloaded directly
- **PNG** — rasterised through an `<img>` + `<canvas>` at 2× scale
- **Clipboard PNG** — same, written via `ClipboardItem` (`Ctrl+Shift+C`)
- **JSON** — the raw `FlowData`, the round-trip format for the importers above

Text width comes from `lib/text-measure.ts` rather than the DOM, so the exporter
stays pure and usable without a live canvas.

> **Trap.** Export reads `sizes`. A node that was never mounted exports at the
> `210×84` fallback and its pathways attach in the wrong place. Culling is disabled
> below 150 nodes and while arranging partly to protect this; if you export a very
> large diagram programmatically, make sure everything has been measured first.
