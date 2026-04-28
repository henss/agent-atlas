# Local CLI Consumption

Agent Atlas is not published as a package yet. Early portfolio adopters should use a sibling local checkout and keep rollout scoped to implemented CLI milestones.

## Build the CLI

From the `agent-atlas` checkout:

```sh
pnpm --filter @agent-atlas/cli build
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
```

Repos may wrap these commands in local package scripts while Agent Atlas remains unpublished.

## Rollout limits

- Use `validate`, `show`, `neighbors`, `resolve-path`, `generate markdown`, and `context-pack`.
- Keep generated Markdown and context packs downstream-only until a repo has stable atlas files and a known CLI path.
- Do not rely on MCP behavior or cross-repo global packs until the matching roadmap milestones are implemented.
- Do not copy `templates/repo/AGENTS.md` verbatim into target repos unless its referenced surfaces exist in that repo.
