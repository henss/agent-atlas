# Agent Atlas

Agent Atlas is a typed context graph and traversal toolkit for AI coding agents.

It helps agents answer four questions before they burn tokens spelunking through a repository like a caffeinated raccoon:

1. **What exists?** Domains, workflows, components, tools, interfaces, resources, documents, datasets, and tests.
2. **How does it relate?** Typed links such as `uses`, `implements`, `documented-in`, `writes-to`, and `tested-by`.
3. **What should be loaded next?** Token-aware context packs, generated docs, and MCP resources.
4. **How should changes be verified?** Scope-aware test and validation guidance.

This repository is intentionally a **foundation**, not a finished product. It contains the specification, schema skeletons, package layout, examples, LLM-facing instructions, and roadmap needed for iterative implementation.

## Core idea

The atlas is **not** a knowledge dump. It is a navigation layer.

```text
Task or starting file
  -> atlas entity
    -> related domain / workflow / component
      -> relevant source files, docs, resources, tools, tests
        -> load only what is needed
```

The canonical source should be a small, typed graph. Hierarchical docs are generated views.

```text
.agent-atlas/              # canonical entity cards and overlays
docs/agents/               # generated LLM-facing markdown views
packages/schema/           # entity types, relation vocabulary, JSON Schema
packages/core/             # loading, graph building, traversal, context packs
packages/cli/              # atlas command line interface
packages/mcp-server/       # atlas:// resources and agent tools
packages/markdown/         # generated markdown views
packages/adapters/         # integration interfaces and reusable adapters
```

## What this project should eventually provide

- A generic atlas schema for repositories, workflows, resources, and external context.
- A CLI for `validate`, `show`, `resolve-path`, `neighbors`, `context-pack`, and `generate markdown`.
- An MCP server exposing `atlas://...` resources and traversal tools.
- Markdown generators for `docs/agents/*`.
- Public/private overlay support.
- Adapter interfaces for code indexes, developer portals, external documents, and MCP connectors.
- Sanitized examples for diverse domains: personal ops, music/band ops, and company cross-repo architecture.

## What this project should not become

- A vector database pretending to be a source of truth.
- A giant manually maintained wiki.
- A replacement for Backstage, Port, Sourcegraph, DataHub, Notion, Confluence, Jira, or Google Workspace.
- A dumping ground for secrets, private URLs, customer data, or operational live data.

The atlas should route agents to authoritative systems, not absorb those systems into one giant doomed Markdown blob.

## Repository status

Current status: **seed / framework**.

This repo is ready for iterative build-out by coding agents. Start with:

1. [`AGENTS.md`](./AGENTS.md)
2. [`docs/vision.md`](./docs/vision.md)
3. [`docs/concepts/typed-context-graph.md`](./docs/concepts/typed-context-graph.md)
4. [`docs/spec/entities.md`](./docs/spec/entities.md)
5. [`ROADMAP.md`](./ROADMAP.md)

## Example atlas entity

```yaml
id: workflow:publish-single
kind: workflow
title: Publish Single
summary: >
  Coordinates song metadata, video assets, release tasks, marketing copy,
  and publishing checklist for a single release.
relations:
  - type: part-of
    target: domain:music-operations
  - type: uses
    target: component:song-library
  - type: uses
    target: component:video-generator
  - type: writes-to
    target: resource:release-checklist
  - type: documented-in
    target: document:release-process
agent:
  load_when:
    - Planning or changing single-release workflows
    - Updating release-related automation
  token_budget_hint: 1200
```

## Public/private boundary

The open-source core should include:

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

## License

Apache-2.0. See [`LICENSE`](./LICENSE).
