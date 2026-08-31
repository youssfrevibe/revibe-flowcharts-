# AI — `src/lib/ai-*.ts`, `src/app/api/ai/**`

Google Gemini generates whole flowcharts from a description and edits existing ones
from an instruction.

## Layout

| File | Role |
|---|---|
| `lib/ai-schema.ts` | prompts + the JSON contract, and parsing/validating the reply |
| `lib/ai-server.ts` | server-only: credentials, the Gemini call, JSON extraction |
| `lib/ai-edit.ts` | applies a validated edit plan to a document |
| `lib/ai-settings.ts` | client-side key/model storage |
| `app/api/ai/{generate,edit,verify}` | the three endpoints |

## Credentials

`resolveCreds` takes the user's own key from the request body if present, otherwise
`GEMINI_API_KEY`. Users can paste a key in the AI settings dialog; it lives in their
`localStorage` and is shown masked.

> **Trap.** The key must never reach the client bundle. Everything that touches it
> stays in `ai-server.ts` and the API routes. Do not import `ai-server.ts` from a
> component — it is server-only.

Default model `gemini-2.5-flash`, overridable per request or via `GEMINI_MODEL`.
`/api/ai/verify` checks a key without doing real work.

## Generate

Prompt → a full `{ nodes, connections }` document. Applied via `applyGenerated`,
which snapshots first and then goes through `measureThenLayout`, so the model never
has to produce sensible coordinates — it produces *structure*, and layout produces
geometry.

## Edit

The interesting one. The model does **not** return a document; it returns an
**operation plan** against the existing one:

```
addNode | updateNode | deleteNode | addConnection | updateConnection
| deleteConnection | setTitle
```

`applyAIEdits` turns that plan into real `Op`s and a new document.

Two things to know:

- **`updateNode` is a partial patch.** Omitted fields are left alone. This is what
  lets "set the SLA on the QC steps to 24h" not wipe every other field. Keep it
  partial; a full-replace semantics would be quietly destructive.
- **Temporary ids are remapped.** The model invents ids for new nodes; `applyAIEdits`
  keeps a `realId` map and resolves references, so a plan can add a node and connect
  to it in the same batch. Any new op type that references a node id must call
  `resolve(id)`.

New nodes are parked on a spare row below the diagram. That placement is throwaway —
auto-layout runs afterwards and overrides it, but only when nodes were **added or
deleted**. A pure field edit leaves hand-placed positions alone, deliberately.

## Parsing model output

`extractJson` pulls JSON out of a reply that may be wrapped in prose or fences.
Everything is validated against the expected shape before it reaches the document,
and unknown ops are dropped rather than throwing.

> **Trap.** Model output is untrusted input. It arrives with invented node ids,
> missing fields and occasional prose. Validate before applying — never spread a
> model object straight into a `FlowNode`.

## Adding a field to the schema

Four places, all of them:

1. `FlowNode` / `FlowConnection` in `lib/types.ts`
2. the enum lists in `lib/ai-server.ts` (if it is an enum)
3. the prompt's field documentation in `lib/ai-schema.ts`
4. the validator in `lib/ai-schema.ts`

Miss the prompt and the model never emits it; miss the validator and it gets
stripped.
