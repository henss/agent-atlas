# Per-Repo Setup Guide

This guide describes the current adoption paths for Agent Atlas.

Private and company repos should use the sibling-checkout path when they need the latest development version. Public repos that need self-contained scripts may use exact pinned preview CLI packages such as `@agent-atlas/cli@0.17.0`.

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

## Public repo npm path

Public repos that need self-contained scripts should pin the preview CLI package:

```json
{
  "scripts": {
    "atlas": "pnpm dlx @agent-atlas/cli@0.17.0",
    "atlas:doctor": "pnpm dlx @agent-atlas/cli@0.17.0 doctor --path . --profile public",
    "atlas:validate": "pnpm dlx @agent-atlas/cli@0.17.0 validate . --profile public",
    "atlas:boundary-check": "pnpm dlx @agent-atlas/cli@0.17.0 boundary-check . --profile public",
    "atlas:docs:check": "pnpm dlx @agent-atlas/cli@0.17.0 generate markdown . --output docs/agents --profile public --check",
    "atlas:context-pack": "pnpm dlx @agent-atlas/cli@0.17.0 context-pack --path . --profile public",
    "atlas:resolve-path": "pnpm dlx @agent-atlas/cli@0.17.0 resolve-path --path . --profile public"
  }
}
```

Use `templates/scripts/public-repo-npm.sh` as the shell-script equivalent. Keep the version exact while the package is published under the `preview` dist-tag.

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
- Public repo npm check: `pnpm dlx @agent-atlas/cli@0.17.0 doctor --path . --profile public`
- Check setup: `node ../agent-atlas/packages/cli/dist/index.js doctor --path .`
- Resolve a file: `node ../agent-atlas/packages/cli/dist/index.js resolve-path <path> --path .`
- Suggest a card: `node ../agent-atlas/packages/cli/dist/index.js suggest-card --path <path> --root .`
- Check stale atlas references: `node ../agent-atlas/packages/cli/dist/index.js diff --path .`
- Generate task context: `node ../agent-atlas/packages/cli/dist/index.js context-pack "<task>" --path . --budget 4000`
- Record adoption evidence: `node ../agent-atlas/packages/cli/dist/index.js usage-note "<task>" --path . --command context-pack`
- Smoke-test MCP: `node ../agent-atlas/packages/cli/dist/index.js mcp smoke-test --path . --profile public --resolve-path <path>`
```

## Add CI

Use the template in `docs/ci/github-actions-agent-atlas.yml` as a starting point.

For public repos using the npm preview package, run:

```sh
pnpm dlx @agent-atlas/cli@0.17.0 validate . --profile public
pnpm dlx @agent-atlas/cli@0.17.0 boundary-check . --profile public
pnpm dlx @agent-atlas/cli@0.17.0 generate markdown . --output docs/agents --profile public --check
```

For local-checkout consumers, adapt the checkout path or build Agent Atlas as a sibling repo before running:

```sh
node ../agent-atlas/packages/cli/dist/index.js validate .
node ../agent-atlas/packages/cli/dist/index.js boundary-check --path . --profile public
node ../agent-atlas/packages/cli/dist/index.js doctor --path .
node ../agent-atlas/packages/cli/dist/index.js generate markdown --path . --output docs/agents --profile public --check
node ../agent-atlas/packages/cli/dist/index.js diff --path .
```

## Script templates

Copy-paste script starters live under `templates/scripts/`:

- `public-repo-npm.sh`: self-contained public-repo validation through pinned `@agent-atlas/cli`
- `public-repo.sh`: sibling-checkout public validation and generated docs check
- `private-repo.sh`: private profile validation, generated docs, and context-pack smoke test
- `company-repo.sh`: company profile validation, benchmark, MCP smoke test, and MCP stdio pointer
- `central-registry-repo.sh`: global registry validation, manifest output, generated Markdown checks, listing, and context-pack smoke test

Sibling-checkout templates use `ATLAS_CHECKOUT=../agent-atlas` by default and can be adapted to the downstream repo layout. The npm public template uses `ATLAS_CLI_VERSION=0.17.0` by default and should stay exact-pinned in committed public-repo scripts.

Use `docs/guides/rollout-evidence.md` when deciding whether a repo should move from guidance-only to pilot or active Atlas adoption.
