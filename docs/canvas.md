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

### `sizes` — node dimensions, frozen over measured
Two layers. `measured` is the raw `Map<nodeId, {w,h}>` filled by a `ResizeObserver` +
`MutationObserver` over `[data-node-id]` elements — nothing but that observer writes it.
`sizes` is `effectiveSizes(nodes, measured)`: the same map with each node's stored
`size` laid over it, and *that* is what every consumer reads. `sizesRef` mirrors the
merged map.

An editor session captures `size` for any node missing one, once `docSettled` is true
and no arrange is running. Capture only ever fills gaps, so peers converge on whichever
editor got there first instead of overwriting each other with their own measurements.

> **Why.** Measuring per-chrome means one document routes differently for different
> readers: a viewer rendering simpler cards measures smaller boxes and re-collides the
> pathways an editor had hand-cleared. Frozen geometry is what makes them agree.

> **Trap.** A node that has *not* been captured yet still has no entry until its card
> mounts, and every consumer still falls back to `210×84`. Culling, virtualisation and
> lazy rendering therefore remain dangerous for uncaptured nodes.

### Editor and reader mode

`mode` is `"edit" | "view"`, and it does two things: swaps the chrome — `LayersPanel` →
`LevelSidebar`, `InspectorPanel` → `NodeDetailPanel`, dense cards → sparse ones — and
locks the document.

The lock works by **shadowing the prop**. Inside the component, `readOnly` is
`readOnlyProp || mode === "view"`, so every guard already written against `readOnly`
(`commit`, `setTransient`, undo, redo, nudge, reset, restore) covers reader mode without
being rewritten. A `?view=1` link pins the mode and disables the toggle.

Reader mode does **not** change card density. It once forced `standard`, which made the
Detailed/Compact toggle silently do nothing for a reader, and left detailed content out
of the view whose whole job is explaining the process. Density is the reader's choice,
same as the editor's.

> **Trap.** Density must never change *geometry*. A card renders no smaller than its
> frozen `size` in either mode at either density (`minWidth`/`minHeight` on the card,
> exact width/height for the decision diamond), because the pathways were routed against
> that box and would otherwise meet empty space beside it. Verified by diffing every card
> box and every route `d` across all four combinations of mode × density — 109 boxes and
> 123 routes, zero differences.

Capture is **grow-only**. A card measuring smaller than its stored box is nearly always a
density change, and shrinking would move every pathway that meets it; a card measuring
larger is the one case where the stored box is genuinely wrong — real content that no
longer fits — so routing has to follow. Capture is also blocked entirely in reader mode,
so a reader can never write geometry into the document.

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

## Pathway emphasis and the guided tour

Selecting a step in reader mode fades every pathway that does not touch it
(`emphasisNodeId` on `Connections`, `dimmed` on each `Edge`). The reader gets
"where does flow arrive from, where does it go" without tracing lines by eye.

> **Why opacity only.** It would be easy to thicken the surviving pathways or nudge
> them clear. Both make the lines appear to *move* when a reader clicks a step, and
> the whole promise of this diagram is that they do not. Emphasis never touches
> geometry — verified by diffing every route `d` before and after selection.

The guided tour (`GuidedTour`) walks that same selection. It draws nothing on the
canvas of its own: it sets the index, and the existing select + `focusNode` produce
the panel, the emphasis and the pan. One behaviour to keep correct instead of two.

`tourOrder` in `lib/levels.ts` builds the walk — entry points first (an explicit
`start` node, else anything with no incoming edge), then depth-first in stored
connection order so two readers are walked through identically. Unreachable steps
are appended rather than dropped; an orphan is something a reader should see, and
hiding it would make the step count lie.

> **Trap.** The tour only runs in reader mode, and leaving that mode ends it. A tour
> running under the editor chrome has no bar to drive it and would keep stealing the
> selection out from under whoever is editing.

## Card and pathway colour

Cards follow the theme: light surfaces in light mode, dark washes in dark mode. Both
`DEFAULT_TYPE_STYLES` and the 14 `NODE_COLOR_PRESETS` used to be `bg-*-800/90` with
white text in *both* themes, which is why a coloured card stayed a dark slab on a
white page. Each keeps a tint so the type is still readable at a glance.

> **Trap.** The decision shape is an SVG `<polygon fill="…">`, and an attribute cannot
> carry a `dark:` variant. It reads `themeFill` from `getNodeStyle` — a CSS variable
> (`--node-fill-*`, `--node-preset-*`) that globals.css redefines per theme. The hex
> `fill` on the same return value is for the SVG **exporter**, which renders outside
> the document on its own dark background and has no theme to read. Do not collapse
> the two.

Pathways are one colour for every branch type (`--flow-edge`). They were green for
yes, red for no and amber for the third branch, which read as a status map — a red
line looked like something was wrong rather than "this is the no path" — and
duplicated what the branch label already says. Selection and hover are Revibe purple,
now the only colour on the canvas that carries meaning.

## Why the node cards take their node back

`FlowNodeCard` is `React.memo`'d, and memo compares props by identity. Every card
callback therefore takes the node as an **argument** rather than the parent closing
over it — `onMouseDown(e, node)`, not `onMouseDown={(e) => handler(e, node)}`.

The parent's versions are deliberately routed through `cardFns`, a ref reassigned
during render (the same idiom as `handlersRef` and `keyRef`), so the functions handed
to the cards never change identity even though the closures inside them are fresh.

> **Trap.** Passing an inline arrow to any card prop silently costs a full re-render
> of every card on screen, on every frame of a drag. It looks harmless and it type
> checks. Measured on the 109-node return-claims document: 436 card renders across
> 4 drag frames before (exactly 4 × 109), 24 after. Several of those handlers are
> plain functions rather than `useCallback`, so passing them straight through would
> defeat memo just as thoroughly — go through `cardFns`.
