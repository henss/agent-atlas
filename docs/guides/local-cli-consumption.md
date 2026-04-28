# Local CLI Consumption

Agent Atlas is not published as a package yet. Early portfolio adopters should use a sibling local checkout and keep rollout scoped to M1-M3 commands.

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
```

Repos may wrap these commands in local package scripts while Agent Atlas remains unpublished.

## First-rollout limits

- Use `validate`, `show`, `neighbors`, and `resolve-path`.
- Do not rely on generated `docs/agents/atlas.md`, `context-pack`, overlays, or MCP behavior until the matching roadmap milestones are implemented.
- Do not copy `templates/repo/AGENTS.md` verbatim into target repos yet; it references later surfaces.
