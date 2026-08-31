# Layout — `src/lib/graph.ts`

Decides where nodes go. Pure, React-free, and shared by the canvas and the exporter.

## `autoLayout(nodes, connections, sizes, opts) → FlowNode[]`

A Sugiyama-style layered layout, the same family draw.io uses. Five stages:

1. **Break cycles.** DFS finds back edges; they are removed from the layering graph.
2. **Layer.** Each node's layer is its longest path from a source.
3. **Virtualise.** Edges spanning more than one layer get chains of dummy nodes
   through the intermediate layers. Dummies straighten long edges and reserve
   routing lanes so those edges do not cut through unrelated nodes.
4. **Order.** Barycentre sweeps within each layer to reduce crossings.
5. **Place.** Layers along the primary axis; within a layer, a
   pool-adjacent-violators isotonic fit positions nodes along the secondary axis.

`opts` comes from `lib/layout-prefs.ts` (per-slug, `localStorage`). Defaults:
`LR`, `primaryGap: 190`, `secondaryGap: 90`, `margin: 28`. `note` nodes get an extra
56px of clearance so pathways do not get squeezed against them.

### Cycle breaking is load-bearing

> **Trap — this caused the worst layout bug in the project's history.** Longest-path
> layering has **no fixed point on a cycle**: every relaxation pass pushes the loop's
> members one layer further along. A real process map is full of rework loops
> ("under revision" going back for another check), and in one 123-node claim flow
> **three** back edges were enough to push nodes out to **layer 393**, producing
> sparse fragmented layers (`0,1,2,3 … 246…261 … 375…393`) and destroying the
> left-to-right spine entirely. It read as "scattered and not left to right".
>
> Bounding the *number* of passes does not fix this — each pass still pushes. The
> cycle must actually be broken. Back edges are dropped from the layering graph
> only; they still render as pathways, they just stop dictating column order.
>
> After the fix, that same flow went from 30 backward-pointing edges to 3 (the real
> loops), and from 39 sparse layers spanning 0–393 to 63 contiguous ones.

If you change the layering, verify on a **cyclic** graph. An acyclic test will pass
either way.

### Measured sizes are required

`autoLayout` reads `sizes` for every footprint. Unmeasured nodes fall back to
`DEFAULT_SIZE` (`210×84`), which for this codebase's cards is usually far too small,
so the result overlaps. Never call `autoLayout` with a `sizes` map that predates the
nodes being mounted — go through `measureThenLayout` (see [canvas.md](canvas.md)).

### Waypoints must be cleared

`connection.waypoints` are **absolute world coordinates**. After a layout every node
has moved, so surviving waypoints drag pathways back across the new arrangement.
`runAutoLayout` and `measureThenLayout` both strip `fromPort` / `toPort` /
`waypoints`. Any new caller must too.

## `resolveOverlaps(nodes, sizes, gap = 40)`

Nudges only the nodes that actually collide, preserving the existing arrangement.
This is the gentle alternative to a full re-layout — use it when the author has
hand-placed things and only wants the collisions fixed.

## Smaller helpers

`sizeOf`, `nodeCenter`, `portPos`, `bestPorts` (most natural port pair between two
nodes), `computeBounds` (used by fit-to-view and export).

## Verifying a layout change

Numbers beat eyeballing, especially since a screenshot of a 33,000px-wide diagram
tells you almost nothing. Useful metrics, computed from the DOM after an arrange:

- **backward edges** — count of `to.x < from.x`. Should equal the number of genuine
  loops in the source, nothing more.
- **overlaps** — pairwise rect intersections using measured sizes. Should be 0.
- **layer bands** — group nodes by x; should be contiguous, a handful per band.
- **height** — a bad layout is tall and square; a good LR layout is a wide ribbon.
