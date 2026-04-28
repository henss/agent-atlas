# Local CLI Consumption

Agent Atlas is not published as a package yet. Portfolio and company adopters should use a sibling local checkout until package publishing is deliberately enabled.

## Build the CLI

From the `agent-atlas` checkout:

```sh
pnpm build
```

## Run against another repo

From the target repo, call the built CLI from the sibling checkout:

```sh
node ../agent-atlas/packages/cli/dist/index.js validate .
node ../agent-atlas/packages/cli/dist/index.js boundary-check --path . --profile public
node ../agent-atlas/packages/cli/dist/index.js doctor --path .
node ../agent-atlas/packages/cli/dist/index.js resolve-path packages/core/src/example.ts --path .
node ../agent-atlas/packages/cli/dist/index.js show component:example --path .
node ../agent-atlas/packages/cli/dist/index.js neighbors component:example --path . --depth 2
node ../agent-atlas/packages/cli/dist/index.js generate markdown --path . --output docs/agents --profile private
node ../agent-atlas/packages/cli/dist/index.js context-pack "change packages/core/src/example.ts" --path . --budget 4000 --profile private
node ../agent-atlas/packages/cli/dist/index.js usage-note "change packages/core/src/example.ts" --path . --command context-pack --entity component:example --file packages/core/src/example.ts
node ../agent-atlas/packages/cli/dist/index.js evaluate --path .
node ../agent-atlas/packages/cli/dist/index.js migrate --path . --to 1
node ../agent-atlas/packages/cli/dist/index.js benchmark --path . --iterations 3
node ../agent-atlas/packages/cli/dist/index.js global validate --path .
node ../agent-atlas/packages/cli/dist/index.js global context-pack "change onboarding workflow" --path . --budget 8000 --profile private
node ../agent-atlas/packages/mcp-server/dist/stdio.js --path . --profile private
```

Repos may wrap these commands in local package scripts while Agent Atlas remains unpublished.

All atlas-loading commands accept one positional root path or `--path <root>`. Do not pass both. Prefer explicit `--path <root>` in scripts because it stays readable when commands also include free-form task text or additional flags.

## Compatibility contract

Use one built Agent Atlas sibling checkout as the unit of compatibility:

- Workspace package version: `0.13.0`.
- Entity schema version: `schema_version: 1`.
- Usage receipt version: `version: 1`.
- Registry config version: `version: 1`.
- CLI, generated Markdown, registry commands, schema validation, and MCP server should come from the same checkout.
- Run `node ../agent-atlas/packages/cli/dist/index.js doctor --path .` when wiring a repo into scripts or CI.
- Package publishing remains out of scope until a separate distribution decision.

## Consumer rollout checklist

- Run `validate` before committing atlas files.
- Run `boundary-check --profile public` before publishing generated agent docs or public examples.
- Run `doctor --path .` when a downstream script, MCP config, or CI job fails unexpectedly.
- Run `generate markdown` when a repo publishes `docs/agents/*`.
- Use `context-pack` for broad or multi-seam tasks.
- Use `usage-note` after representative tasks during adoption pilots.
- Use `evaluate` to compare receipts against deterministic context-pack output.
- Use the read-only MCP server when the agent host can consume MCP.
- Run `migrate . --to 1` before schema-version cleanup; add `--write` only in an explicit migration task.
- Use `global validate` and `global context-pack` from a central registry when a task spans repositories.
- Keep generated Markdown and context packs downstream-only until a repo has stable atlas files and a known CLI path.
- Do not copy `templates/repo/AGENTS.md` verbatim into target repos unless its referenced surfaces exist in that repo.

## Script templates

Use the scripts in `templates/scripts/` as copy-paste starters:

- `public-repo.sh`
- `private-repo.sh`
- `company-repo.sh`
- `central-registry-repo.sh`

They intentionally call the built sibling checkout directly and keep npm publishing out of scope.
