# Rollout Evidence Guide

Use rollout evidence to decide when a repo is ready for broader Agent Atlas adoption.

## Stages

### Guidance-only

The repo has authoring guidance, but agents are not expected to rely on Atlas.

Recommended checks:

```sh
node ../agent-atlas/packages/cli/dist/index.js doctor --path .
node ../agent-atlas/packages/cli/dist/index.js validate .
node ../agent-atlas/packages/cli/dist/index.js boundary-check --path . --profile public
```

Exit criteria:

- atlas files validate
- generated docs are current if committed
- obvious missing domains, workflows, and components are filled in

### Pilot

Agents use Atlas on selected tasks and record receipts.

Recommended loop:

```sh
node ../agent-atlas/packages/cli/dist/index.js context-pack "change packages/example/src/index.ts" --path . --budget 4000
node ../agent-atlas/packages/cli/dist/index.js usage-note "change packages/example/src/index.ts" --path . --command context-pack --entity component:example --file packages/example/src/index.ts --test "pnpm test"
node ../agent-atlas/packages/cli/dist/index.js evaluate --path .
```

Exit criteria:

- broad-search fallback is uncommon
- entity, file, and test recall are useful for representative tasks
- missing or misleading card notes are triaged into atlas updates
- contributors can run the local commands without special setup

### Active

Atlas is part of normal agent and CI workflows.

Recommended checks:

```sh
node ../agent-atlas/packages/cli/dist/index.js validate .
node ../agent-atlas/packages/cli/dist/index.js boundary-check --path . --profile public
node ../agent-atlas/packages/cli/dist/index.js evaluate --path . --json
```

Exit criteria:

- usage evidence shows stable or improving recall
- repeated orientation work has decreased
- context packs select the expected verification commands for common work
- local ownership is clear for atlas maintenance

## Metrics

Track these locally:

- percentage of sessions requiring broad-search fallback
- average entity recall
- average file recall
- average test recall
- count of missing-card notes
- count of misleading-card notes

Treat these as practical signals, not leaderboard scores. A small number of honest receipts is more useful than a large pile of vague ones.

## Privacy

Keep receipts in the repo or control plane that owns the work. They may include private task labels, paths, commands, or observations.

Do not add hosted telemetry or publish private usage evidence.
