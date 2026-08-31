# Canvas — `src/components/FlowCanvas.tsx`

The editor. Around 2,900 lines, and it owns the document, the viewport, the
selection, every interaction and every dialog. It is large on purpose: the pieces
share so much per-frame state that splitting it has historically meant threading
twenty props through four layers.

Navigate it by its section banners (`/* ---- keyboard ---- */` etc.):

| Section | What lives there |
|---|---|
| identity | who you are (name prompt, avatar colour) |
| realtime sync | peer channel wiring, `applyRemote` |
| history | undo/redo stack, `commit`, `scheduleSave`, `select` |
| cloud load | fetch, cache-first paint, `docSettled` |
| measurement | the `ResizeObserver` that fills `sizes` |
| mutations | every document-changing operation |
| pathway routes | memoised `computeRoutes` |
| window mouse events | drag, marquee, pathway-drawing |
| keyboard | all shortcuts |
| canvas handlers | pointer entry points |
| context menus | right-click menus |
| export | PNG / SVG / JSON, clipboard |
| render | the JSX |

## State model

### Document
`data` (React state) and `dataRef.current` (synchronous mirror). Written together
by `commit` / `setTransient`. **Event handlers must read the ref.**

### Selection — read this before touching it
Selection lives in a Zustand store (`lib/store.ts`) **and** in refs:

```
selectedIds  ← store, drives rendering
selRef       ← ref,   read by event handlers
selectedConn ← store
selectedConnRef ← ref
```

Both halves must be written together. `select(ids)` and `selectConn(id)` do that,
and are also the only place the "selecting a node clears the connection selection"
rule lives.

> **Trap.** Writing the store directly without the ref is silent and destructive.
> A previous change wired a connection click to the raw store setter; the highlight
> moved but `selectedConnRef` stayed `null`, so pressing Delete deleted the
> *previously selected nodes* instead of the connection. **Always go through
> `select` / `selectConn`.**

> **Trap.** The store is a module-level singleton and nothing clears it on slug
> change. Navigating between diagrams reuses this component, so the selected ids from
> the previous diagram survive — they simply match no node and appear as an empty
> selection. Harmless today; it would stop being harmless the moment ids collide
> across diagrams.

### Viewport
`pan` / `zoom` in state, mirrored in `viewRef` for handlers. `viewport` holds the
canvas element's `getBoundingClientRect()`. World ↔ screen is
`screen = world * zoom + pan`, with `pan` relative to the **canvas element**, not
the window.

### `sizes` — measured node dimensions
`Map<nodeId, {w,h}>`, filled by a `ResizeObserver` + `MutationObserver` over
`[data-node-id]` elements, mirrored synchronously in `sizesRef`.

> **Trap.** This map is the input to layout, routing, fit-to-view and export. A node
> that has never been mounted has no entry and every consumer silently falls back to
> `210×84`. Most cards here are much larger than that. Anything that unmounts cards
> — culling, virtualisation, lazy rendering — breaks all four at once.

### Load flags
- `loaded` — something is painted (may be the stale cache).
- `docSettled` — the cloud fetch for **this slug** has landed.

> **Trap.** `loaded` flips as soon as the `localStorage` cache paints, which is
> *before* the cloud copy replaces it. Anything that rewrites the document on open
> must key off `docSettled`, or the cloud response silently undoes the rewrite. This
> is exactly how auto-arrange-on-import appeared to do nothing.

## Viewport culling

Off below `CULL_THRESHOLD` (150 nodes), and off entirely while `arranging` is true.
When on, it keeps nodes within `CULL_MARGIN` (800 screen px) of the canvas rect,
measured against each node's **real** size from `sizes`.

Every one of those conditions exists because of the measurement trap above. Do not
lower the threshold or drop the `arranging` guard without solving measurement
first.

## Bulk document replacement

Import, pasted JSON, AI generate and AI edit all replace the whole document, and all
must go through **`measureThenLayout(ids)`**. It:

1. sets `arranging` (disabling culling so every card mounts),
2. waits frame-by-frame until every id appears in `sizesRef` (4s ceiling),
3. strips `fromPort` / `toPort` / `waypoints` — they are absolute world coordinates
   and would drag pathways across the new arrangement,
4. runs `autoLayout` and commits,
5. fits the view.

> **Trap.** The old code did this on a `setTimeout` against a stale `sizes` closure.
> With most cards larger than the fallback, it arranged small boxes and then painted
> large ones — the "scattered import" bug. Never lay out on a timer; wait for the
> measurements.

Diagrams deployed from the gallery are arranged on first open instead: the importer
writes the slug to `localStorage` under `ARRANGE_ON_OPEN_KEY` and the canvas
consumes it once `docSettled` is true.

## Keyboard

The handler lives in a ref (`keyRef.current`) so it always sees fresh state without
re-binding. Two guards run before anything else:

1. **typing** — target is `INPUT` / `TEXTAREA` / `SELECT` / `contentEditable` → only
   Escape (blur) gets through.
2. **`modalOpenRef`** — a dialog is open → only Escape gets through.

Add any new dialog to the `modalOpen` expression, or its backdrop will let canvas
shortcuts fire underneath it. (`c` once scattered comment nodes behind an open
dialog for exactly this reason.)

Selected shortcuts: `Ctrl+F` find, `Ctrl+H` replace, `I` insights, `Ctrl+L`
auto-arrange, `Ctrl+K` command palette, `Ctrl+Shift+C` copy diagram as PNG,
`Shift+1` fit, `Tab` cycle nodes spatially, `Y`/`N` follow a decision branch.

> **Trap.** `Tab` is only intercepted when the event target is the canvas or
> `document.body`. Do not widen that — a toolbar button is not `typing`, so a
> blanket `Tab` handler traps keyboard users inside the canvas.

## Undo/redo

`histRef = { past: FlowData[], future: FlowData[] }`, capped at 80 entries. `commit`
pushes; `setTransient` does not. Undo restores whole documents and broadcasts a
`doc.replace`, so **undo is global, not per-user** — undoing reverts your
collaborator's edits too. Known and accepted.

## Sibling components

`FlowNodeCard` (must keep `data-node-id` — measurement depends on it), `Connections`
(renders `RoutedEdge[]`; hit areas are transparent `stroke-width:20` paths),
`InspectorPanel`, `Toolbar`, `TopBar`, `LayersPanel`, `Minimap`, `CommandPalette`,
`FindReplaceBar`, `DiagramStats`, `VersionHistory`, `EditModal`, `ContextMenu`.
