# Codebase documentation

Written for whoever — person or agent — has to change this code without having
read all 14,000 lines of it first.

These files deliberately do **not** restate what the code already says. A function
signature is in the code, and a doc that repeats it is just a second thing to keep
correct. What is written here is the part the code cannot tell you: how the pieces
fit together, which invariants are load-bearing, and which traps have already cost
someone an afternoon.

## Where to start

| If you are touching… | Read |
|---|---|
| anything at all, first time | [ARCHITECTURE.md](ARCHITECTURE.md) |
| the editor, interactions, keyboard, selection | [canvas.md](canvas.md) |
| node positions, auto-arrange, overlap | [layout.md](layout.md) |
| the lines between nodes, ports, waypoints | [routing.md](routing.md) |
| saving, loading, caching, versions, the DB | [persistence.md](persistence.md) |
| multi-user editing | [realtime.md](realtime.md) |
| AI generate / edit / verify | [ai.md](ai.md) |
| JSON import, PNG/SVG export | [import-export.md](import-export.md) |

## Keeping these in sync

Change behaviour in a subsystem → update its doc **in the same commit**. That rule
is repeated in `AGENTS.md` so agents pick it up automatically.

The bar for adding something here: *would someone reading the code have guessed
wrong?* If yes, write it down. If the code already makes it obvious, leave it out.
