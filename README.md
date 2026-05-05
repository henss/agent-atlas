# Agent Atlas

Agent Atlas is a typed context graph and traversal toolkit for AI coding agents.

It helps agents answer four questions before they spend tokens searching blindly through a repository:

1. **What exists?** Domains, workflows, components, tools, interfaces, resources, documents, datasets, and tests.
2. **How does it relate?** Typed links such as `uses`, `implements`, `documented-in`, `writes-to`, and `tested-by`.
3. **What should be loaded next?** Token-aware context packs, generated docs, and MCP resources.
4. **How should changes be verified?** Scope-aware test and validation guidance.

The M0-M17 roadmap is implemented. The project now provides a working schema, validator, graph loader, traversal engine, path resolver, Markdown generator, context-pack builder, overlay support, hardened read-only MCP server, adapter interfaces, hardened cross-repo registry support, migration tooling, diagnostics, Commander-derived CLI documentation, CLI tests, benchmarks, setup doctor checks, local usage receipts, context-pack evaluation, boundary checks, incremental authoring tools for sibling-checkout consumers, and a local human review UI.

## Core idea

The atlas is **not** a knowledge dump. It is a navigation layer.

```text
Task or starting file
  -> atlas entity
    -> related domain / workflow / component
      -> relevant source files, docs, resources, tools, tests
        -> load only what is needed
```

The canonical source is a small, typed graph. Hierarchical files such as `docs/agents/*` are generated views.

```text
.agent-atlas/              # canonical entity cards and overlays
docs/agents/               # generated LLM-facing markdown views
packages/schema/           # entity types, relation vocabulary, JSON Schema
packages/core/             # loading, graph building, traversal, migrations, benchmarks
packages/cli/              # atlas command line interface
packages/mcp-server/       # atlas:// resources and read-only agent tools
packages/markdown/         # generated markdown views
packages/adapters/         # integration interfaces and reusable adapters
```

## Implemented capabilities

- Validate atlas YAML files and schema versions.
- Load `.agent-atlas/**/*.yaml` files and selected private/company overlays.
- Normalize typed relations and generate inverse traversal edges.
- Resolve source paths to owning components and related context.
- Show entities, traverse neighbors, and generate task-specific context packs.
- Generate compact `docs/agents/*` Markdown views.
- Check generated docs without rewriting with `atlas generate markdown --check`.
- Expose read-only MCP resources and tools.
- Smoke-test read-only MCP resolution and context-pack behavior with `atlas mcp smoke-test`.
- Serve a local read-only human review UI with focused graph browsing and debug metadata.
- Define adapters for code indexes, developer portals, local docs, and external references.
- Merge central registries and per-repo atlases for cross-repo context packs.
- Generate central registry manifests and global Markdown summaries.
- Preview or write schema migrations with `atlas migrate`.
- Run lightweight load benchmarks with `atlas benchmark`.
- Check downstream setup with `atlas doctor`.
- Audit profile boundaries with `atlas boundary-check`.
- Suggest starter cards with `atlas suggest-card`.
- Diagnose stale references with `atlas diff`.
- Run policy-driven Atlas maintenance checks and autonomous fixes with `atlas maintain`.
- Generate Commander-derived CLI command docs with `atlas cli docs generate`.
- Record local adoption receipts with `atlas usage-note`.
- Evaluate context-pack selection against receipts with `atlas evaluate`.

## CLI snapshot

For local/private development, use a built local checkout:

```sh
pnpm -r build
node packages/cli/dist/index.js validate .
node packages/cli/dist/index.js overview --path .
node packages/cli/dist/index.js boundary-check --path . --profile public
node packages/cli/dist/index.js doctor --path .
node packages/cli/dist/index.js generate markdown --check --profile public
node packages/cli/dist/index.js diff --path .
node packages/cli/dist/index.js maintain check --path .
node packages/cli/dist/index.js maintain fix --path .
node packages/cli/dist/index.js resolve-path packages/core/src/index.ts --path .
node packages/cli/dist/index.js context-pack "change CLI path handling" --path . --budget 4000
node packages/cli/dist/index.js usage-note "change CLI path handling" --path . --command context-pack --entity component:cli-package
node packages/cli/dist/index.js evaluate --path .
node packages/cli/dist/index.js mcp smoke-test --path . --resolve-path packages/cli/src/index.ts
node packages/cli/dist/index.js ui --path . --profile public
node packages/cli/dist/index.js generate markdown --profile public
node packages/cli/dist/index.js global validate examples/company-cross-repo-sanitized
node packages/cli/dist/index.js global manifest examples/company-cross-repo-sanitized
node packages/cli/dist/index.js global generate markdown examples/company-cross-repo-sanitized --output docs/agents/global
```

To browse this repository's own atlas as a local demo, run:

```sh
pnpm atlas:ui
```

See the generated [`CLI Command Reference`](./docs/generated/cli-command-reference.md) for command syntax and options. See [`packages/cli/README.md`](./packages/cli/README.md) for package usage and consumption notes.

For sibling-checkout consumers, the current local compatibility contract is workspace package version `0.18.0`, entity `schema_version: 1`, usage receipt `version: 1`, boundary policy `version: 1`, and registry `version: 1`. Public repos may use exact pinned preview CLI releases such as `@agent-atlas/cli@0.18.0` after the [package publish readiness checklist](./docs/guides/package-publish-readiness.md) passes.

## Roadmap status

M0-M17 are complete.

See [`ROADMAP.md`](./ROADMAP.md).

## What this project should not become

- A vector database pretending to be a source of truth.
- A giant manually maintained wiki.
- A replacement for Backstage, Port, Sourcegraph, DataHub, Notion, Confluence, Jira, or Google Workspace.
- A dumping ground for secrets, private URLs, customer data, or operational live data.

The atlas should route agents to authoritative systems, not absorb those systems into one giant doomed Markdown blob.

## Public/private boundary

The open-source core includes:

- schema
- validators
- traversal logic
- generated docs
- CLI/MCP interfaces
- generic adapters
- sanitized examples

Real deployments should keep private:

- actual company/personal atlas contents
- internal repository topology if sensitive
- Notion/Confluence page IDs
- calendar IDs
- email labels
- customer data
- credentials and secret names where even names reveal sensitive information

Use overlays for private context instead of contaminating public files.

## Start points

1. [`docs/guides/authoring-atlas-files.md`](./docs/guides/authoring-atlas-files.md)
2. [`docs/guides/local-cli-consumption.md`](./docs/guides/local-cli-consumption.md)
3. [`docs/guides/package-publish-readiness.md`](./docs/guides/package-publish-readiness.md)
4. [`docs/concepts/typed-context-graph.md`](./docs/concepts/typed-context-graph.md)
5. [`docs/spec/entities.md`](./docs/spec/entities.md)
6. [`docs/agents/atlas.md`](./docs/agents/atlas.md)

## License

Apache-2.0. See [`LICENSE`](./LICENSE).
