# Per-Repo Setup Guide

This guide describes the current local-checkout adoption path for Agent Atlas.

Agent Atlas is not published as an npm package yet. Keep package publishing out of scope until a separate distribution decision is made.

## Prepare the Agent Atlas checkout

From the `agent-atlas` repository:

```sh
pnpm install
pnpm -r build
```

## Add atlas files to the target repo

Create a small repo-local atlas:

```text
.agent-atlas/
  public/
    domains/
    workflows/
    components/
    resources/
    documents/
    tests/
docs/agents/
```

Start with:

1. one or more `domain` entities
2. important `workflow` entities
3. major `component` entities with `code.paths`
4. key external `resource` and `document` entities
5. `test-scope` entities with verification commands

## Run the CLI from a sibling checkout

From the target repo:

```sh
node ../agent-atlas/packages/cli/dist/index.js validate .
node ../agent-atlas/packages/cli/dist/index.js boundary-check --path . --profile public
node ../agent-atlas/packages/cli/dist/index.js doctor --path .
node ../agent-atlas/packages/cli/dist/index.js resolve-path packages/core/src/example.ts --path .
node ../agent-atlas/packages/cli/dist/index.js context-pack "change packages/core/src/example.ts" --path . --budget 4000
node ../agent-atlas/packages/cli/dist/index.js suggest-card --path packages/core/src/example.ts --root .
node ../agent-atlas/packages/cli/dist/index.js diff --path .
node ../agent-atlas/packages/cli/dist/index.js usage-note "change packages/core/src/example.ts" --path . --command context-pack --entity component:example --file packages/core/src/example.ts
node ../agent-atlas/packages/cli/dist/index.js evaluate --path .
node ../agent-atlas/packages/cli/dist/index.js generate markdown --path . --output docs/agents --profile private
```

All atlas-loading commands accept one positional root path or `--path <root>`. Do not pass both. Prefer `--path <root>` in scripts so the target repo is obvious.

## Add to AGENTS.md

Root `AGENTS.md` should tell agents:

```md
Before broad search, use the atlas:

- Root view: `docs/agents/atlas.md`
- Check setup: `node ../agent-atlas/packages/cli/dist/index.js doctor --path .`
- Resolve a file: `node ../agent-atlas/packages/cli/dist/index.js resolve-path <path> --path .`
- Suggest a card: `node ../agent-atlas/packages/cli/dist/index.js suggest-card --path <path> --root .`
- Check stale atlas references: `node ../agent-atlas/packages/cli/dist/index.js diff --path .`
- Generate task context: `node ../agent-atlas/packages/cli/dist/index.js context-pack "<task>" --path . --budget 4000`
- Record adoption evidence: `node ../agent-atlas/packages/cli/dist/index.js usage-note "<task>" --path . --command context-pack`
```

## Add CI

Use the template in `docs/ci/github-actions-agent-atlas.yml` as a starting point. For local-checkout consumers, adapt the checkout path or build Agent Atlas as a sibling repo before running:

```sh
node ../agent-atlas/packages/cli/dist/index.js validate .
node ../agent-atlas/packages/cli/dist/index.js boundary-check --path . --profile public
node ../agent-atlas/packages/cli/dist/index.js doctor --path .
node ../agent-atlas/packages/cli/dist/index.js generate markdown --path . --output docs/agents --profile public --check
node ../agent-atlas/packages/cli/dist/index.js diff --path .
```

## Script templates

Copy-paste script starters live under `templates/scripts/`:

- `public-repo.sh`: public validation and generated docs check
- `private-repo.sh`: private profile validation, generated docs, and context-pack smoke test
- `company-repo.sh`: company profile validation, benchmark, and MCP stdio pointer
- `central-registry-repo.sh`: global registry validation, manifest output, generated Markdown checks, listing, and context-pack smoke test

Each template uses `ATLAS_CHECKOUT=../agent-atlas` by default and can be adapted to the downstream repo layout.

Use `docs/guides/rollout-evidence.md` when deciding whether a repo should move from guidance-only to pilot or active Atlas adoption.
