# Realtime — `src/hooks/useRealtimeDoc.ts`, `src/lib/ops.ts`

Live multi-user editing over Supabase Realtime. **Presence** for who is here,
**broadcast** for granular edits. Deliberately no cursors — the team decided shared
pointers were noise for this use case.

Realtime is the *fast* path, not the durable one. Durability is the debounced
autosave in [persistence.md](persistence.md). If the channel drops, editing keeps
working and saving keeps working; you just stop seeing other people.

## Identity

No auth. `lib/user.ts` keeps a name and an avatar colour in `localStorage`; first
visit prompts for the name. `Collaborator = { userId, name, color }`.

> Note the two distinct ids. `userId` is the **person** (stable across their tabs).
> `clientId` is the **tab** (`c_<random><timestamp>`, regenerated per mount) and is
> what echo suppression compares. That is intentional: the same person in two tabs
> must see their own edits cross over. Comparing `userId` instead would silently
> break that.

## Ops

Defined in `lib/types.ts`, applied by `applyOp` in `lib/ops.ts`:

| Op | Notes |
|---|---|
| `node.upsert` | insert or replace by id |
| `nodes.move` | batched positions — one op for a whole multi-node drag |
| `node.delete` | also drops connections touching the node |
| `conn.upsert` | keyed by `connId(c)` |
| `conn.waypoints` | route only, sent continuously during a drag |
| `conn.delete` | |
| `doc.replace` | whole document — import, AI, layout, version restore |

`applyOp` is a **pure reducer used identically for local and remote edits**. That
identity is what makes peers converge. Two rules follow:

1. Every new mutation needs an `Op`. Mutating `data` directly diverges the peers.
2. `applyOp` must stay pure and total — no I/O, no throwing, unknown op returns the
   document unchanged (an older peer will send ops a newer one has not seen, and
   vice versa).

Prefer a granular op over `doc.replace`. `doc.replace` clobbers whatever the other
person was doing.

## Conflict model

Last write wins, per op. There is no CRDT and no OT. Two people editing different
nodes is fine; two people editing the same field at the same moment means one of
them loses. Acceptable for a handful of teammates on a process map.

`conn.waypoints` exists precisely to narrow this: dragging a route sends only the
route, so a peer editing that connection's label at the same time keeps their edit.
When adding a high-frequency interaction, consider a similarly narrow op.

## Undo is global

Undo broadcasts a `doc.replace` of your previous document state — so it reverts your
collaborator's edits too. Known, accepted, documented here so nobody rediscovers it
as a "bug".

## Channel lifecycle

One channel per slug: `flowchart:<slug>`, `broadcast: { self: false }`. Status is
`connecting` / `live` / `offline`. Presence is tracked on subscribe and untracked on
cleanup. The `onRemoteOp` callback is held in a ref so a changing handler does not
force a resubscribe — keep it that way; resubscribing on every render drops presence.
