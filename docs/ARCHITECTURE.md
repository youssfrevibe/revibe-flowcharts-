# Architecture

A collaborative flowchart editor for Revibe's operational process maps. Next.js 16
(App Router, Turbopack) + React 19 on the front, Supabase (Postgres + Realtime) on
the back, deployed on Vercel from `master`.

There is **no authentication**. Anyone with the URL can edit; identity is a name the
person types once, kept in `localStorage`. `?view=1` on a diagram URL makes it
read-only. Treat every diagram as world-editable-by-link.

## The shape of the thing

```
  src/app/page.tsx                 gallery: list, create, import, paste-deploy
  src/app/diagram/[slug]/page.tsx  thin wrapper: resolves metadata, reads ?view=1
        │
        ▼
  src/components/FlowCanvas.tsx    the editor. ~2900 lines. owns all document state
        │
        ├── lib/graph.ts      where nodes go        (layout)
        ├── lib/routing.ts    where lines go        (geometry)
        ├── lib/ops.ts        how a change is expressed (the Op reducer)
        ├── lib/diagram-store.ts  cache + cloud read/write
        └── hooks/useRealtimeDoc.ts  peer sync
        │
        ▼
  src/app/api/…               server routes, service-role Supabase access
        ▼
  Supabase: flowcharts, flowchart_versions
```

## The document

One document is `FlowData = { nodes, connections }` (`lib/types.ts`). Flat arrays —
no tree, no nesting. A connection references nodes by id. That is the whole model.

**Detail levels are a filter over that one document, not three documents.** Every node
and connection carries a `level` (1 "the shape", 2 "branches", 3 "every step", default
3), and a node on levels 1–2 names the steps it collapses in `children`. `lib/levels.ts`
holds the whole of it: `atLevel` returns the subgraph on screen, `populatedLevels` says
which levels the file actually has, `mergeNodes` / `mergeConnections` splice a level's
edits back into the whole.

Keeping levels as a *field* is what leaves `applyOp` untouched — realtime convergence,
undo and persistence all work on levels without knowing they exist. It also means a
legacy document reads as level 3 and renders exactly as it always did.

> **Trap.** Anything acting on "all nodes" — arrange, fix-overlaps, fit, select-all,
> auto-connect, image export — must scope to the current level *and merge back*. Layout
> commits through `doc.replace`, which swaps the entire document, so committing a single
> level's laid-out array would delete every node on the other two.

Every mutation is expressed as an **`Op`** and applied by the pure reducer
`applyOp` in `lib/ops.ts`. Local edits and remote edits go through the same
function, which is what makes two browsers converge. If you add a way to change the
document, add an `Op` for it — do not mutate `data` directly, or the other person's
screen silently diverges from yours.

`doc.replace` is the blunt instrument: it swaps the entire document. Import, AI
generation, auto-arrange and version restore all use it.

## How a change flows

```
  user gesture
      → commit(producer, ops)          FlowCanvas
          ├─ record(prev)              push onto the undo stack
          ├─ dataRef.current = next    synchronous, for event handlers
          ├─ setData(next)             async, for rendering
          ├─ scheduleSave()            650ms debounce → Supabase
          └─ bc(ops)                   broadcast to peers
```

`commit` is the only sanctioned write path. It returns early when `readOnly`, which
is how view-only mode is enforced — at the source, not per-handler.

`setTransient` is the exception: it updates the document *without* history, save or
broadcast. Used for in-flight drag frames, so a drag produces one undo entry rather
than sixty.

## Three ideas worth internalising

**1. State lives in two places on purpose.** `dataRef.current` (synchronous) and
`data` (React state). Event handlers read the ref because React has not re-rendered
yet when a `mousemove` fires. Both are written together in `commit`. Reading `data`
inside an event handler gives you a stale document; that is not a bug in React.

**2. Node geometry is measured once, then frozen.** Cards size themselves to their
content, so a `ResizeObserver` measures the DOM into a `Map<id, Size>`. The editor
captures that into each node's `size`, and from then on the stored value wins:
`effectiveSizes` overlays it before layout, routing, fit-to-view or export ever see
the map. That is what lets a viewer render simpler cards without re-routing the
diagram, and what stops two machines with different font metrics from disagreeing.
A node that has not been captured yet still depends on being mounted and still falls
back to `210×84` — see [canvas.md](canvas.md) and [layout.md](layout.md).

**3. Cache paints before cloud loads.** `localStorage` gives an instant first paint,
then the cloud copy arrives and replaces it. So `loaded` means "something is on
screen", not "the real document is here". Work that rewrites the document on open
must wait for `docSettled`. See [persistence.md](persistence.md).

## Running it

```bash
npm run dev
```

Environment (`.env.local`):

| Variable | Needed for |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | everything |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser reads, realtime |
| `SUPABASE_SERVICE_ROLE_KEY` | server API routes |
| `GEMINI_API_KEY` | AI features (users may also supply their own key in the UI) |
| `GEMINI_MODEL` | optional model override |

`supabase-migration.sql` adds soft-delete and version history. Until it is run those
two features stay dormant rather than erroring — the API routes detect the missing
column and fall back.

## Conventions

- `"use client"` on anything touching the canvas, `localStorage` or Supabase Realtime.
- Server-only secrets never leave `src/app/api/**`.
- Geometry helpers stay pure and React-free so the canvas and the exporter share one
  implementation. They used to differ, and what you saw was not what you exported.
- Comments explain *why*. The codebase is consistent about this; match it.
