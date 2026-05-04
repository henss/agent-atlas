# Usage Evidence

Usage evidence is local, downstream-owned data for measuring whether Agent Atlas helps agents orient faster.

There is no hosted telemetry, phone-home behavior, or central collection in the open-source project.

## Receipt Format

`atlas usage-note` writes YAML receipts under `.agent-atlas/usage/` by default:

```yaml
version: 1
recorded_at: "2026-04-28T12:00:00.000Z"
task: change CLI path handling
command: context-pack
profile: public
selected_entities:
  - component:cli-package
selected_files:
  - packages/cli/src/index.ts
selected_tests:
  - pnpm -r test
broad_search_fallback: false
missing_cards:
  - document downstream script behavior
misleading_cards: []
outcome: completed
```

Receipts should capture what was actually useful in a session, not everything the agent looked at.
The `.agent-atlas/usage/` directory is local evidence storage, not entity metadata; atlas validation and graph loading ignore receipt YAML files there.

## Evaluation

`atlas evaluate` loads local receipts, regenerates deterministic context packs for each recorded task, then compares expected receipt items with selected pack output.

Metrics:

- entity recall: expected entities that appeared in the pack
- file recall: expected files that appeared in recommended reads
- test recall: expected test commands that appeared in verification
- broad-search fallback count
- missing-card mention count
- misleading-card mention count

Null recall means the receipt did not record expected items for that category.

Evaluation output includes run metadata for downstream control planes:

- `evaluationVersion`: optional caller-supplied cut-over or experiment key
- `generatedAt`: evaluation timestamp
- `atlasPackageVersion`: Agent Atlas package version used for the evaluation
- `receiptVersion`: receipt schema version being read, currently `1`

Use `--evaluation-version <id>` to keep before/after evaluations separate, and `--out <file>` to write the JSON result while still printing normal CLI output.

## Success Signals

Atlas adoption should improve when:

- broad-search fallbacks decrease
- irrelevant reads decrease in session notes
- first-pass test selection improves
- agents repeat less orientation work across similar tasks
- missing or misleading card notes lead to small metadata fixes

## Boundaries

Usage evidence may contain private task descriptions, file paths, test commands, or internal observations. Keep it in the downstream repo or control plane that owns the context.

Do not publish private receipts in public examples.
