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

### Connection ids are assigned before the commit

`loadParsedJSON` runs imported connections through `backfillConnIds` **before**
committing, so the `doc.replace` carries the same ids the local copy holds. Without it
the importer fell back to `from__to` locally while each peer generated its own, and
dragging an endpoint afterwards duplicated the pathway on every peer instead of moving
it.

### Every import goes through `normalize()`

Both entry points — `deployFlowchartJSON` on the home page and `loadParsedJSON` on the
canvas — normalise **before the first save**, the same way a load from cache or cloud
does. `normalize()` is `migrateNodeFields` → `coerceNodeShape` → drop dangling and
self-referencing pathways → `backfillConnIds`.

Neither used to. The unmigrated document was what reached the database, and the
renderer then failed *silently* on anything off-schema:

- **An unknown `type` falls through every shape branch** and draws as a plain
  rectangle. `type: "end"` — present in three of the five live diagrams — meant the
  step where the process finishes looked like an ordinary step.
- **An unknown `actor` gets `undefined` from `ACTOR_STYLES`**, so the card loses its
  owner pill *and* its colour strip, and the "Who is involved" rail counts it under
  nobody. `actor: "thirdparty"` (the schema calls it `carrier`) hid six owners on the
  claims map alone; the rail read 6 where it should have read 12.

`coerceNodeShape` maps unambiguous synonyms only (`end`/`stop`/`done` → `ok`,
`thirdparty`/`3pl`/`courier` → `carrier`, and so on), drops an actor it cannot map
rather than keep one that renders as nothing, and repairs values that break the whole
diagram rather than one node: a `level` outside 1–3 (the node exists, is saved, and can
never be seen), a non-positive `size` (collapses the card and sends every pathway into
its centre), and a non-finite `x`/`y` (poisons `computeBounds`, so fit-to-view and
export break for *every* node).

Normalising is **not** a layout step, and there are tests to keep it that way: across
the five real documents it moves 0 nodes and preserves every waypoint and pinned port,
and it is idempotent.

### A layout the file already has is kept

Import calls `layoutLooksIntentional(nodes, connections, sizes)` and only auto-arranges
when it answers false. A layout counts as deliberate if **any** connection carries a
waypoint or a pinned port (nobody but a person makes those), or if the boxes sit in
distinct places without piling up (≤10% overlapping).

> **Trap.** Import used to arrange unconditionally. That is right for a file from
> another tool — those arrive stacked at the origin or sprawled — and destructive for a
> file exported from here. Measured on the 109-step return-claims map: re-layout moved
> **all 109 nodes, the furthest by 15,100px**, and deleted **8 hand-drawn routes and 36
> pinned ports**. The router itself was not the problem; measured on the same document
> it puts **0** pathways through a node box either way.

The heuristic is deliberately conservative — when unsure it answers false and arranges,
because arranging a good layout is annoying but undoable, whereas leaving a pile of
stacked nodes alone just looks broken. The same check guards the deploy-from-home-page
path, whose marker means "just deployed", not "needs rearranging".

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
