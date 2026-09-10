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

### Reading is the default

`mode` starts at **"view"** for everyone. Most visits to a process map are reads, and
opening straight into the editor both buried the process under tool chrome and left the
document editable by anyone who followed a link. Editing is one click on the Edit
toggle; `?view=1` still pins the reader and locks that toggle.

Two things follow from this and must stay true:

- **The name prompt belongs to editing, not arriving.** The identity modal now fires
  when `mode` becomes "edit" without a stored user — never on mount. Asking a reader to
  identify themselves for collaboration they will never do was the first thing anyone
  saw once reading became the default.
- **Whoever changes the level owns the camera.** A level switch re-frames (see
  [The opening frame](#the-opening-frame)), but search results and reader drill-down
  switch level *in order to* land on a specific step. They set `levelFrameSkipRef`, or
  the re-frame fires 180ms later and throws the destination away — which it did.

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

Both are set from the **cache-paint layout effect** and the cloud effect, never from a
`useState` initialiser.

> **Trap.** Seeding `data` or `loaded` by reading `localStorage` in a `useState`
> initialiser is a hydration mismatch: the server has no cache, the client does, so the
> two first renders disagree and React throws away the server DOM and re-renders the whole
> tree on the client. It is slower than the instant paint it was trying to buy, and it also
> made the root layout's inline theme script trip React's script-tag warning — a symptom
> that sent a previous debugging session chasing the wrong file. Read the cache in a
> **layout effect**: after hydration, still before paint.

> **Trap.** `loaded` flips as soon as the `localStorage` cache paints, which is
> *before* the cloud copy replaces it. Anything that rewrites the document on open
> must key off `docSettled`, or the cloud response silently undoes the rewrite. This
> is exactly how auto-arrange-on-import appeared to do nothing.

## Search spans every level

The command palette receives `data.nodes`, not `view.nodes`, and each step is labelled
with the level it lives on. Selecting one goes through `goToNode`, which switches level
first when the target is elsewhere and selects **after** the switch.

> **Trap.** It used to receive the current level only, so searching from "The shape"
> could not find any of the 100+ steps on "Every step" — it returned nothing, which
> reads as "no such step" rather than "it is on another level".

Find & Replace is *deliberately* still scoped to the current level: replace rewrites
text, and rewriting text on levels nobody can review is the failure that scoping fixed.
Finding is safe across levels; replacing is not.

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

## Actors, icons and the dark theme

Six roles — customer, revibe, seller, system (Automation), carrier (Courier), lab. Each
entry in `ACTOR_STYLES` owns one hue, and `actorVars(style)` spreads it as CSS custom
properties so the `.actor-chip` (plate) and `.actor-ink` (no plate) classes in
globals.css resolve the light or dark pair themselves.

> **Trap.** An inline style cannot carry a `.dark` selector, so a component that passes
> a resolved colour hard-codes one theme. The cards did exactly that — `pillDark` as the
> background with `accent` as the text — so an actor pill on a light card was a dark wash
> under a pale label. Always go through `actorVars` + the class.

Icons are SVG — `components/ActorIcon.tsx` for roles, `components/Icon.tsx` for UI
glyphs. Emoji render differently on every platform, cannot take the actor's colour, sit
off the text baseline, and are announced by their Unicode name rather than by what the
control does. Purely geometric glyphs (`✓ ✕ ◆ → ⌘`) are not emoji and stay as text: they
are single-colour, consistent across platforms, and already take `currentColor`.

`MenuItem`'s `icon` prop is typed `IconName`, not `string`. That is deliberate — when the
type went in, the compiler immediately found five more emoji menu items nobody had
noticed.

**The closed vocabularies have one definition each.** `NODE_TYPE_IDS` and `ACTOR_IDS` in
`lib/types.ts` are arrays, and `NodeType` / `Actor` are derived from them.

> **Trap.** There used to be four copies of the actor list — the type, the palette, the
> AI schema's validator and the importer's allow-list — and adding the two new roles
> updated three. The fourth, `ACTORS` in `ai-server.ts`, is what `sanitizeNodePatch`
> validates against, so every AI-generated flowchart silently had the new actors stripped
> back out. Derive, never restate.

**Dark mode is neutral; colour is reserved for accents.** Card surfaces, the reader
chrome and the row washes are greys — a decision card used to be `#221046`, a violet
block the size of the whole shape, so a hundred of them drowned out the actor accents
that are the only thing on the canvas encoding meaning. The silhouette and the label
already say what type a node is.

> **Trap.** Card internals must use `--ui-*` tokens, never `white/…` or `black/…` alphas.
> The card became light-in-light-mode long after it was written, so those alphas were all
> tuned for a dark surface: the tool chips were `bg-white/15 border-white/25` (invisible
> on white) and the procedure block `bg-black/25` (a dark slab across the middle of a
> white card).

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

## Reader chrome

`mode === "view"` puts `data-chrome="reader"` on the shell, and the reader palette is a
**token override** under that selector rather than a second set of components — every
rail, panel and card already reads `--ui-*`, so one block retints all of them and the
editor is untouched.

The palette is adapted from the Revibe Process Atlas prototype. Its actual lesson is the
neutrals: the greys are violet-tinted rather than pure, so a purple accent sits in the
same family as the surface instead of on top of it. That is why its canvas reads calm
and a slate-grey one does not.

Each card carries `--c`, the owning actor's colour, set on the wrapper. The accent strip,
the hover border and the selection ring all resolve from it, so a card cannot disagree
with itself about who owns the step.

Both rails are forced open when a reader *enters* view mode — the left rail is how you
choose what to look at and the right panel is where all the card detail went, so landing
with both collapsed shows a bare canvas and no way in. Collapsing them afterwards is
respected.

> **Trap.** Reader hover effects animate `transform` and `box-shadow` only. Both are
> compositor-only and neither affects layout, so the frozen geometry the pathways were
> routed against cannot move. Anything that changes padding, border width or font size
> under `[data-chrome="reader"]` would break that — verified by diffing all 109 boxes
> and 123 routes across the mode switch.

## Three rules the level model depends on

**1. Anything acting on "all nodes" goes through `currentScope()`.** Levels share one
world coordinate space — `applyLevelPlan` parks new tiers near the origin and auto-layout
runs from there — so summary cards sit *underneath* the detailed map rather than beside
it. An unscoped read therefore silently touches nodes that are not on screen.

> **Trap.** The marquee was the one site that missed this, and it was invisible: the
> inspector counts `view.nodes` so it said "5 selected", while `selRef` held eight ids and
> `deleteSelection` reads `selRef`. Delete removed three summary cards the user was never
> shown. Keyboard navigation (Tab / Home / End) and Find & Replace had milder versions —
> panning to blank canvas, and rewriting text on levels nobody could review.

**2. Every local producer that removes a node must strip it from `children`.** `applyOp`
does this for `node.delete`, so a peer applying the broadcast op gets a clean document —
but a local producer that only filters `nodes` does not, and `dataRef.current` is what
`saveToCloud` persists. The deleter's dangling id is the one that survives.

Use `stripChildRefs` when deleting and `remapChildren` when copying. Copy paths spread
the source node, so duplicate, paste and alt-drag all cloned `children` verbatim and left
two summary cards claiming the same steps; `parentOf` then resolved drill-up to whichever
came first in array order.

**3. Every path that creates a node or connection stamps `level: levelRef.current`.**
`addNode`, `handleQuickAdd`, `chainSelectedNodes`, `autoConnectAllNodes` and the
alt-drag connect all do. `paste` did not: it spread the clipboard, which carries the
level the nodes were *copied from*, so pasting into a different level saved and
broadcast nodes that were invisible here — and then selected them, so the next Delete
removed cards nobody could see. Connections are level-filtered too, so stamping only the
nodes pastes cards with no arrows.

> **Trap.** Selection does not survive a level change — it is cleared, because ids from a
> level you left would let Delete or an arrow key act on nodes you cannot see. The same
> effect ends any running guided tour, since its index refers to that level's step list.
> Anything that switches level *and* selects (drill-down) must select **after** the
> switch, or the reset wipes it.

> **Trap.** Anything resolving `children` needs the **whole document**, not the level
> view: a level-1 node's children are level-2 nodes, which `atLevel` has by definition
> filtered out. `NodeDetailPanel` took only the view, so `childrenOf` always returned
> nothing and "What this collapses" — the entire reader drill-down — never rendered on
> any node. It now takes `doc` alongside `data` for exactly this.

## The opening frame

A diagram does not open on fit-to-view. `frameForReading` fits **only when the result
would be readable**; otherwise it holds `READABLE_ZOOM` and centres on the start of the
process. Explicit Fit (Shift+1, the toolbar button) still does true fit.

`READABLE_ZOOM` is derived, not taste: a card title is 13.5px and text below roughly
11px stops being comfortably readable, so `13.5 × z ≥ 11` gives `z ≥ 0.81`.

**Never frame against an unmeasured canvas.** `computeFit` and `frameForReading` both
go through `whenCanvasSized`, which waits for a viewport rectangle with actual area and
retries across frames; `pendingFrameRef` re-runs the frame if the canvas only gains a
size later (a background tab, a collapsed pane).

> **Trap.** `getBoundingClientRect()` on a not-yet-laid-out flex child returns 0×0, and
> nothing checked. The damage looked like two unrelated bugs: `computeFit` divided by
> zero, went negative and clamped to its `0.05` floor — the 5% opening — while
> `frameForReading` centred on `0 / 2` and parked the first step in the top-left corner,
> half of it behind the rail. Measured on the return-claims map: `start_claim` landed at
> exactly (canvasLeft − w/2, canvasTop − h/2), which is the signature of a zero rect.

**Changing level re-frames.** The levels share one coordinate space — that is what keeps
a pathway where the editor put it — but they occupy different regions of it, so leaving
the camera alone showed a blank canvas. Measured: clicking "The shape" on the
return-claims map left all seven steps off screen, and an explicit Fit then gave **23%**,
because those seven steps are spread across the full width of the 109-step layout. It
re-frames through `frameForReading`, deferred a beat so the incoming level's cards have
mounted and been measured.

> **Why.** Fit-to-view is the wrong goal for a large map. Measured on the 109-node
> return-claims document, fit chose **0.05** — cards rendered **12×8px**, titles at
> **0.7px**, and the first step of the process was off screen entirely. Technically the
> whole diagram, legibly none of it. After: 82%, start card 151×73px, title 11.1px.

Both rails also open on a **first** visit (no stored `flow_panels`), because the left
rail is the only thing on screen that says what is in the diagram.

> **Trap.** `panelsLoaded` is state, not a ref. As a ref it flipped inside the load
> effect, so the persist effect ran in the same commit, snapshotted the pre-update
> values and wrote `left:false` over the first-visit default — then React's development
> double-invoke read that back and the default silently lost. Any "load prefs, then
> persist them" pair has this shape; gate the writer on state so it cannot run before
> the loaded values are applied.
