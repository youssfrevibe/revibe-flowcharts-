<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Working in this repo

## Read the docs before changing a subsystem

`docs/` explains how this codebase fits together and — more usefully — which
invariants are load-bearing and which traps have already cost someone real time.
Start at [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), then read the file for the
subsystem you are touching:

| Subsystem | Doc |
|---|---|
| editor, interactions, selection, keyboard | `docs/canvas.md` |
| node placement, auto-arrange | `docs/layout.md` |
| connection geometry, ports, waypoints | `docs/routing.md` |
| saving, loading, caching, versions, DB | `docs/persistence.md` |
| multi-user sync | `docs/realtime.md` |
| Gemini generate / edit | `docs/ai.md` |
| JSON import, PNG/SVG export | `docs/import-export.md` |

Reading the relevant doc first is cheaper than rediscovering the trap.

## Keep them in sync

**If you change how a subsystem behaves, update its doc in the same commit.** A doc
that lies is worse than no doc.

Write down anything a reader of the code would have guessed wrong about — an
invariant, an ordering constraint, a bug that looked like something else. Do not
write down what the code already says; signatures and types do not belong here,
because they are a second thing to keep correct and they go stale first.

## Three things that will bite you

1. **`sizes` is measured from the DOM**, not computed. Layout, routing, fit-to-view
   and export all read it and all silently fall back to `210×84`. Anything that
   unmounts node cards breaks all four.
2. **`loaded` means "the cache painted"**, not "the document is here". Work that
   rewrites the document on open must wait for `docSettled`.
3. **Selection lives in a Zustand store *and* in refs.** Always write it through
   `select()` / `selectConn()`; writing the store alone desyncs the event handlers
   and deletes the wrong thing.

## Before you say it works

`npx tsc --noEmit` and `npx next build` both have to pass. For anything visual,
verify in the browser — and prefer measuring the result (counts, bounding boxes,
overlaps) over eyeballing a screenshot. A 33,000px-wide diagram looks like a smudge
either way.
