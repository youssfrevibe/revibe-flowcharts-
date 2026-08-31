# Routing — `src/lib/routing.ts`

Everything geometric about a connection: which sides it leaves and enters, the
orthogonal path it takes, how back edges nest into return lanes, how manual
waypoints override the automatic route, and where the label sits.

Pure and React-free **on purpose**. `Connections.tsx` (screen) and `export-svg.ts`
(PNG/SVG) share this one implementation. They used to have separate ones — the
export drew loose beziers while the screen drew orthogonal routes — so what you saw
was never what you exported. Do not reintroduce a second router.

Purity also makes it memoisable, which matters: routing runs for every edge on every
drag frame.

## Entry point

`computeRoutes(nodes, connections, sizes, { fast }) → RoutedEdge[]`

`fast: true` is passed while the user is actively interacting. It skips the
expensive fallbacks (A*, alternate-port search) to keep drag frames cheap. The
canvas re-runs it at full quality when interaction ends — if a pathway looks wrong
mid-drag and right afterwards, that is this, working as intended.

A `RoutedEdge` carries the point list, the rounded SVG path, the label box and the
handles the UI needs. `RoutedEdge[]` is the entire contract with the renderer.

## Strategy ladder

Per edge, first success wins:

1. **Manual** — `waypoints` present → `routeThroughWaypoints`, router steps aside.
2. **Direct** — `route()`, an orthogonal path with a stub off each port.
3. **Lane** — a 3-bend route threading the long run through a clear lane between
   node rows/columns, scanning outward from the midpoint.
4. **Alternate ports** — `tryAltPorts` retries every side combination and keeps the
   shortest clear one. **Sides pinned by the author are held fixed** — silently
   moving a pathway to a node's other side was itself a source of "why did my arrow
   jump?".
5. **A\*** — `routeAStar` on a coarse grid, last resort.
6. **Loops** — backward edges go around: `routeLoopUnder` (LR flows) or
   `routeLoopSide` (TB flows). A lane planner nests same-cluster loops so they do
   not cross; a blocked lane steps down one at a time rather than punching through.

> **Trap.** Sending every back edge "under" regardless of flow direction is wrong.
> In a top-to-bottom flow the back edges run *upward*, and forcing both ends onto
> the bottom port drove the pathway down out of the source, back up past it, and
> into the underside of a node above. That is why `routeLoopSide` exists.

## Tunables

`STUB` 18 · `CORNER` 12 · `CHANNEL_STEP` 16 · `PAD` 12 · `LANE_GAP` 44 ·
`LANE_STEP` 26 · `SPLIT` 3.5

These interact. `PAD` below `CORNER` lets rounded corners clip node edges; `SPLIT`
too large makes parallel pathways look unrelated. Change one at a time and look at a
dense diagram.

## Waypoints

World-space points a pathway is dragged through, in order — the mechanism for
pulling two overlapping pathways onto separate lanes by hand.

> **Trap.** Because they are absolute, they are invalidated by anything that moves
> nodes. "Reset route" and auto-layout both clear them. Any new bulk reposition must
> clear them too, or pathways will be dragged across the fresh arrangement.

`conn.waypoints` is a dedicated `Op` sent continuously while dragging: it is small,
and it touches only the route, so a peer editing the same connection's label or
colour at the same time does not lose their edit.

`routeSegments`, `routeHandles` and `waypointsAfterSegmentDrag` back the drag UI.

## Hit testing

Each pathway renders a transparent `stroke-width: 20` path under the visible one, so
clicking near a 2px line works. If you restyle connections, keep the hit path.
