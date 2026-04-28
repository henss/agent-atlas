# Agent guidance

This repository uses Agent Atlas for context navigation.

Before broad search:

- Read `docs/agents/atlas.md`.
- Resolve current files with `pnpm atlas resolve-path <path>`.
- For broad tasks, run `pnpm atlas context-pack "<task>" --budget 4000`.

Do not fetch external or live resources unless the atlas says they are relevant.

Update `.agent-atlas` files when adding domains, workflows, components, interfaces, tools, documents, resources, or test scopes.
