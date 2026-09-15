# The flowchart MCP

Nine tools over the app's own REST API, so Claude can read, check and edit the process
maps directly instead of exporting JSON and importing it back.

## Setup — the two variables

| Variable | What it is | Where it goes |
|---|---|---|
| `REVIBE_BASE_URL` | Where the app is running. `http://localhost:3000` for the dev server, or the Vercel URL. | `.mcp.json` |
| `REVIBE_API_KEY` | A password **you invent** — a long random string. The server only accepts writes from callers that send it. | `.env.local` **and** Vercel, identical in both |

Make a key:

```bash
openssl rand -hex 32
```

It is not issued by anyone. It is a shared secret: the same string in `.env.local` (what
the app checks against) and in the MCP's environment (what the MCP sends). If they differ,
writes come back 401 and reads keep working.

Leave `REVIBE_API_KEY` unset and the guard stands down entirely — nothing breaks, the write
routes are simply open, which is how they were before.

After editing `src/lib/flow-standards.ts`, rebuild the copy the MCP uses:

```bash
npm run mcp:build
```

## Giving it to the team

The app hosts the server at **`/api/mcp`**. A colleague adds one URL and is finished — no
clone, no Node, no install, and no way to be running a stale copy of the card standards,
because the validator deploys with the app.

```
https://<your-app>.vercel.app/api/mcp?key=<REVIBE_MCP_TOKEN>
```

They paste that wherever their client takes a remote MCP URL. That is the whole setup.

Three variables make it work, all in Vercel:

| Variable | What it does |
|---|---|
| `REVIBE_MCP_TOKEN` | Who may reach `/api/mcp`. This is the value in the URL you hand out. |
| `REVIBE_API_KEY` | What the tools present when they write. Set it or the write routes stay open. |
| `REVIBE_BASE_URL` | Optional. Unset, the route talks to whichever deployment served it, so previews test themselves. |

If `REVIBE_API_KEY` is set and `REVIBE_MCP_TOKEN` is not, the route refuses to serve at all
rather than expose an open endpoint that can write.

A token in a URL is visible in logs and browser history. It is a shared team credential, not
a per-person identity: rotating `REVIBE_MCP_TOKEN` is the entire revocation story, and it
cuts off everyone at once.

## Running it locally instead

Only needed to work on the server itself. `.mcp.json` is committed, so a checkout already
has the stdio version registered:

```bash
git clone <repo> && cd revibe-flowcharts-
npm install                 # also compiles the validator the MCP needs
cp .env.example .env.local  # then fill in REVIBE_API_KEY and REVIBE_BASE_URL
```

`npm install` runs `prepare`, which builds `mcp/flow-standards.js`. That file is generated
and gitignored, so without this step the server starts and immediately fails on a missing
import — worth knowing if anyone skips the install.

`.mcp.json` reads `REVIBE_API_KEY` from the environment rather than holding it, so the
secret is never committed. Each person needs it exported in their shell, or set in
`.env.local` and loaded by whatever they use to launch their editor.

**Point them at the deployed app, not localhost.** With `REVIBE_BASE_URL` set to the Vercel
URL, nobody needs to run `npm run dev` to use the tools, and everyone is looking at the same
flowcharts. Keep `http://localhost:3000` only for working on the server itself.

## The prompt

Paste this at the start of a session, or keep it in `CLAUDE.md` so it always applies.

---

You have an MCP server called **revibe-diagrams** connected to our process-mapping app. Use
it instead of asking me to export or import JSON.

**Start with `list_flowcharts`** to get the slugs. Every other tool takes one.

**Use `describe_flowchart` before `read_flowchart`.** A document is 150–190 cards; the
description gives you the stages, the decisions with their branches, and the count of
disconnected pieces, which is almost always what a question actually needs. Only read the
whole document when you are about to change it.

**Run `validate_flowchart` before you tell me a flow is fine.** It runs our card standards
over every card. `failed: 0` means it passes; `notes` are things for a person to judge, not
errors. It also reports `disconnectedPieces` — anything other than one piece means the flow
is in fragments — and `longBackwardPathways`, which are loops a reader gets lost in.

**Before any write, call `snapshot_flowchart`.** It is one call and it makes the change
reversible.

**Writes:**
- `patch_flowchart` for the title, description, colour or archived flag. It cannot touch
  cards, deliberately.
- `write_flowchart` replaces all cards and pathways. The server refuses a write that drops
  the document below 70% of its stored step count; if that fires, stop and tell me rather
  than re-sending with `force: true`.

### The rules a card follows

- **A stage card is titled with its internal stage and nothing else.** `In transit`, never
  `stage = In transit` and never `return_claim_stage = In transit`.
- **"Stage" means the external column.** `order_product_claims_new.stage` holds the
  customer-facing value and it is stored numbered: `2. In transit`, `19. Expert revision`.
  The internal value lives in `claim_return_details.return_claim_stage` and is unnumbered.
- **A shipment status is a field on the stage card, never a card of its own.** Three legs,
  three columns, all taking `Pending · Created · Shipped · Delivered · Failed`:

  | Leg | Column |
  |---|---|
  | customer → Revibe or the supplier | `pickup_shipment_status` |
  | supplier → lab | `naif_shipment_status` |
  | Revibe → customer | `return_shipment_status` |

- **A decision on a stored column is named by the column** — `information_complete ?`,
  `valid_claim ?`, `country_id ?`. A decision on someone's judgement is a sentence-case
  question — `Was the device collected?`
- **A step title never contains `=`.** If it would, the field belongs in `conditions` and
  the title says what happens.
- **Every card names an owner**: customer, revibe, seller, system, carrier or lab.
- **Timing goes in the SLA field**, not into the description.
- **Cards with the same title have the same type, owner and fields.**

### Check a value before you use it

Column and stage names come from the database, not from memory. If you are unsure whether a
value is real, say so rather than inventing one — several stages in the warranty and
wrong-device maps are proposals the OMS has never stored, and that distinction matters more
than the map looking complete.

---

## The tools

| Tool | Does |
|---|---|
| `list_flowcharts` | Gallery listing; `archived: true` for the archive |
| `read_flowchart` | Whole document — large |
| `describe_flowchart` | Stages, decisions, branches, disconnected pieces |
| `validate_flowchart` | Every standard, card by card |
| `write_flowchart` | Replace cards and pathways; shrink-guarded |
| `patch_flowchart` | Metadata only |
| `list_versions` / `read_version` | Snapshot history |
| `snapshot_flowchart` | Save the current state before a change |

## When it cannot connect

`Cannot reach http://localhost:3000` means the app is not running. Start it with
`npm run dev`, or point `REVIBE_BASE_URL` at the deployed app.
