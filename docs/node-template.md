# The node template — what to write so the reader panel fills in

Every field here is optional. A node with only `id`, `type`, `x`, `y` and `label` is
valid; each extra field lights up one more part of the reader's detail panel. This page
exists because most of that panel had no data to show: across all four live diagrams,
**not one node has a `facts` block**, so "The facts", the mover bar and the sample table
have never rendered for anybody.

## The panel, and what feeds each part

| Panel section | Comes from |
|---|---|
| Actor pill (top left) | `actor` |
| Title | `label` |
| Subtitle under the title | `type`, as a plain word ("Step", "Decision", "Outcome") |
| **What happens** | `detail` |
| **The facts** | `facts.where`, `internalStage`, `externalStage`, `sla`, `facts.volume`, `facts.dataRef` |
| **Who actually moves this stage** | `facts.movers` |
| **Go to** | `facts.links` — falls back to `tools` when absent |
| **What this collapses** | `children` (levels 1 and 2 only) |
| **Where the flow goes** | the connections, not the node |
| **Where you see it** | `facts.preview` |

A section with no data is not rendered, so a sparse node reads as a short clean panel
rather than a page of empty headings.

## A fully-populated node

```jsonc
{
  "id": "step_collect_device",
  "type": "step",              // start | step | decision | sub | ok | fail | note
  "x": 1200,
  "y": 840,
  "label": "We collect the device",
  "detail": "An airway bill is generated and a courier picks the device up from the customer.",

  "actor": "carrier",          // revibe | seller | system | carrier
  "sla": "1 day",
  "level": 3,                  // 1 the shape · 2 branches · 3 every step

  // The two OMS columns, shown verbatim so a card maps onto the database without guessing.
  "internalStage": "Pending LAB collection",
  "externalStage": "Under QC",

  "facts": {
    "where": "New OMS · QuiQup · Supplier portal",

    // `note` becomes part of the row label: "Volume 2026".
    "volume": { "value": 5587, "note": "2026" },

    // Observed counts, not who is nominally responsible. Rendered as a 100% bar —
    // the gap between the two is usually the whole point.
    "movers": [
      { "actor": "carrier", "count": 4881 },
      { "actor": "revibe",  "count": 706 }
    ],

    // The column a reader can look this stage up by.
    "dataRef": "order_product_claims_new.stage",

    // The "Go to" section. `url` is optional — naming a destination is useful even
    // with no link, and a row without one renders as a label rather than a dead link.
    "links": [
      { "label": "Claims Operations dashboard", "url": "https://…", "kind": "dashboard" },
      { "label": "New OMS",                                          "kind": "tool" },
      { "label": "Returns runbook",             "url": "https://…", "kind": "doc" }
    ],

    // A few real rows from the screen this stage is worked on, so a reader recognises it.
    "preview": {
      "caption": "order_product_claims_new · stage = Pending LAB collection",
      "columns": ["Claim", "Raised", "Market"],
      "rows": [
        ["CLM-10241", "2026-02-11", "AE"],
        ["CLM-10388", "2026-02-12", "SA"]
      ]
    }
  },

  // Levels 1 and 2 only: the next-level-down steps this one summarises.
  "children": ["step_awb_created", "step_courier_assigned", "step_picked_up"]
}
```

`kind` on a link picks the glyph: `dashboard` 📊, `tool` 🔧, `doc` 📄, `query` 🔎,
`link` ↗ (the default).

## Connections

```jsonc
{
  "id": "c_collect_to_lab",     // supply one; otherwise `from__to` is assigned on load
  "from": "step_collect_device",
  "to": "step_lab_intake",
  "label": "collected",
  "type": "",                   // "" | cyes (yes) | cno (no) | camber (conditional)
  "level": 3,                   // must match BOTH endpoints or it never draws
  "bold": false
}
```

Leave `fromPort`, `toPort` and `waypoints` out unless you are reproducing a route someone
drew by hand. Their presence is what tells the importer the layout was deliberate and
must not be auto-arranged — see [import-export.md](import-export.md).

## What the importer will quietly correct

`normalize()` runs on every import and every load, so you do not have to be perfect:

- `type` synonyms map onto the schema — `end`/`stop`/`done` → `ok`, `error`/`failure` →
  `fail`, `condition`/`branch`/`gateway` → `decision`, and so on. An unrecognised type
  becomes `step`.
- `actor` synonyms likewise — `thirdparty`/`3pl`/`courier` → `carrier`,
  `supplier`/`vendor` → `seller`, `automated`/`bot` → `system`. An unrecognisable actor
  is dropped rather than left to render as no owner at all.
- Legacy `stage` + `stageKind`, `newOmsStage`, and the `return_internal_stage` /
  `return_external_stage` aliases fold into `internalStage` / `externalStage`.
- A `level` outside 1–3, a non-positive `size`, and non-finite `x`/`y` are repaired.
- Connections to a node that is not in the file, and self-loops, are dropped.

Two things it cannot guess, so get these right:

- **`id` must be unique and stable.** Connections reference it, `children` references it,
  and realtime edits are keyed on it.
- **`level` on a connection must match both endpoints.** A level-3 edge between two
  level-1 nodes is stored, costs nothing, and is never drawn.
