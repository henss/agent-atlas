# Per-Repo Setup Guide

This guide describes how a project would adopt Agent Atlas once the CLI exists.

## Install

```sh
pnpm add -D @agent-atlas/cli @agent-atlas/schema
```

## Initialize

```sh
pnpm atlas init
```

Expected output:

```text
.agent-atlas/
  public/
    domains/
    workflows/
    components/
    resources/
    tests/
docs/agents/
AGENTS.md
```

## Author first entities

Start with:

1. one or more `domain` entities
2. important `workflow` entities
3. major `component` entities
4. key external `resource` and `document` entities
5. `test-scope` entities

## Validate

```sh
pnpm atlas validate
```

## Generate docs

```sh
pnpm atlas generate markdown
```

## Add to AGENTS.md

Root `AGENTS.md` should tell agents:

```md
Before broad search, use the atlas:

- Root view: `docs/agents/atlas.md`
- Resolve a file: `pnpm atlas resolve-path <path>`
- Generate task context: `pnpm atlas context-pack "<task>" --budget 4000`
```

## Add CI

```sh
pnpm atlas validate
pnpm atlas generate markdown
 git diff --exit-code docs/agents
```

Yes, the extra space before `git` in the previous block would be a mistake in a real script. Keep generated checks boring and exact.
