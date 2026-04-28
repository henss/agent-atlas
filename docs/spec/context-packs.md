# Context Packs

A context pack is a generated, task-specific bundle of context for an agent.

It should answer:

- what entities are relevant
- what files/docs/resources should be inspected
- what external data may need to be fetched
- what tests or checks verify the work
- what risks or constraints apply

## Command shape

```sh
atlas context-pack "change weekly planning to avoid evening blocks" --budget 4000
```

Supported flags:

- `--path <root>`: load atlas files from a repository root.
- `--budget <tokens>`: set the approximate output budget.
- `--profile public|private|company`: choose visibility filtering.
- `--deterministic`: request deterministic selection. Current output is deterministic by default.
- `--json`: emit machine-readable output.

## Output shape

Markdown by default:

```md
# Context pack

Task: change weekly planning to avoid evening blocks
Budget: 4000 tokens

## Likely relevant entities

- `workflow:plan-week`
- `component:weekly-planner`
- `component:calendar-adapter`
- `document:weekly-planning-system`

## Read first

1. `docs/agents/workflows/plan-week.md`
2. `packages/planning/src/weeklyPlanner.ts`
3. `packages/calendar/src/writePlanBlocks.ts`

## External context

- Fetch `document:weekly-planning-system` through the configured document MCP server if the change affects planning rules.
- Fetch live calendar data only if reproducing current behavior.

## Verification

Run:

```sh
pnpm --filter @example/planning test
pnpm --filter @example/calendar test
```

## Risks

- Calendar-writing code may affect live data when run with production credentials.
```

## Selection algorithm draft

Initial implementation can be simple:

1. Extract terms from task.
2. Match terms against entity IDs, kinds, titles, aliases, summaries, tags, and code paths.
3. Resolve any paths mentioned in the task through `code.paths` and `code.entrypoints`.
4. Add graph neighborhood for matched entities.
5. Add related docs, tests, and verification scopes.
6. Rank items by direct match, path ownership, relation type, and deterministic tie-breakers.
7. Fit within budget using one-line entity summaries and references instead of copied content.

Future versions may use embeddings or external retrieval, but deterministic graph traversal should remain the primary path.

## Budget behavior

The budget is an approximate token budget, not a promise of exact tokenizer behavior.

The current implementation estimates tokens from character counts so output remains dependency-free and deterministic.

Use priorities:

1. Entity IDs and one-line summaries.
2. Recommended reads.
3. Critical relations.
4. Verification commands.
5. Risk notes.
6. Longer summaries only if budget remains.

## What not to include

- Entire source files.
- Entire external documents.
- Secrets.
- Live operational data unless explicitly requested and safe.
- Long generated explanations without provenance.
