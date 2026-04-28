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
node ../agent-atlas/packages/cli/dist/index.js resolve-path packages/core/src/example.ts .
node ../agent-atlas/packages/cli/dist/index.js show component:example .
node ../agent-atlas/packages/cli/dist/index.js neighbors component:example . --depth 2
node ../agent-atlas/packages/cli/dist/index.js generate markdown . --output docs/agents --profile private
node ../agent-atlas/packages/cli/dist/index.js context-pack "change packages/core/src/example.ts" . --budget 4000 --profile private
node ../agent-atlas/packages/cli/dist/index.js migrate . --to 1
node ../agent-atlas/packages/cli/dist/index.js global validate .
node ../agent-atlas/packages/cli/dist/index.js global context-pack "change onboarding workflow" . --budget 8000 --profile private
node ../agent-atlas/packages/mcp-server/dist/stdio.js --path . --profile private
```

Repos may wrap these commands in local package scripts while Agent Atlas remains unpublished.

## Consumer rollout checklist

- Run `validate` before committing atlas files.
- Run `generate markdown` when a repo publishes `docs/agents/*`.
- Use `context-pack` for broad or multi-seam tasks.
- Use the read-only MCP server when the agent host can consume MCP.
- Run `migrate . --to 1` before schema-version cleanup; add `--write` only in an explicit migration task.
- Use `global validate` and `global context-pack` from a central registry when a task spans repositories.
- Keep generated Markdown and context packs downstream-only until a repo has stable atlas files and a known CLI path.
- Do not copy `templates/repo/AGENTS.md` verbatim into target repos unless its referenced surfaces exist in that repo.
