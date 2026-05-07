# LLM Agent Usage Guide

This guide describes how coding agents should use an atlas-enabled repository.

## Before searching broadly

1. Read root `AGENTS.md`.
2. Open `docs/agents/atlas.md` if present.
3. Use `atlas context-pack` when the task is broad.
4. Use `atlas resolve-path` when starting from a source file.

## Task authority

Atlas is navigation evidence, not task authority. When an agent is launched with
a bounded task packet, that active packet remains the execution contract even if
an archival ledger or registry has no recorded contract artifact for the work.

If a local contract ledger is missing or stale, do not infer new product scope
from that absence. Continue from the active packet when it is available, use
Atlas only to route repo-local context, and record the missing archival evidence
in the downstream-owned outcome or receipt.

## Top-down workflow

For broad tasks:

```sh
atlas context-pack "add support for publishing campaign videos" --budget 4000
```

Then inspect recommended entity cards and source files.

## Bottom-up workflow

For file-specific tasks:

```sh
atlas resolve-path packages/video-generator/src/render.ts
```

Then inspect owning component, workflows, docs, resources, and tests.

## Avoid wasting context

Do not load every file under a broad directory until the atlas suggests the likely component/workflow.

Do not read external documents unless the atlas says they are relevant.

Do not fetch live resources unless the task depends on current state.

## Verification

Use `test-scope` entities and generated verification guidance before inventing test commands.

## Atlas maintenance

If the repo has `agent-atlas.maintenance.yaml`, follow it before finishing work:

```sh
atlas maintain fix --path .
atlas maintain check --path .
```

In `agent-maintained` mode, update missing or stale `.agent-atlas/**` cards when you notice them and regenerate generated docs through `atlas maintain fix`. In `review-only` mode, record gaps or create proposals instead of applying metadata changes.

## Security

Respect profile boundaries:

- public profile: safe for open-source contributors
- private/company profile: may include private resource aliases

Never ask the user to paste secrets into atlas files.
