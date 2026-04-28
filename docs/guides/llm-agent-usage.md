# LLM Agent Usage Guide

This guide describes how coding agents should use an atlas-enabled repository.

## Before searching broadly

1. Read root `AGENTS.md`.
2. Open `docs/agents/atlas.md` if present.
3. Use `atlas context-pack` when the task is broad.
4. Use `atlas resolve-path` when starting from a source file.

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

## Security

Respect profile boundaries:

- public profile: safe for open-source contributors
- private/company profile: may include private resource aliases

Never ask the user to paste secrets into atlas files.
