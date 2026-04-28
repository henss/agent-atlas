# Architecture

Agent Atlas has five layers.

## 1. Atlas files

Human-authored or generated YAML files under `.agent-atlas`.

```text
.agent-atlas/public/domains/calendar.yaml
.agent-atlas/public/workflows/plan-week.yaml
.agent-atlas/public/components/calendar-adapter.yaml
```

## 2. Schema

Types and JSON Schema define valid entities and relations.

Package: `packages/schema`

## 3. Core graph engine

Loads entities, applies overlays, validates, normalizes relations, generates inverse edges, resolves paths, builds context packs, merges global registries, plans migrations, runs lightweight benchmarks, diagnoses local checkout setup, writes local usage receipts, evaluates context-pack output against those receipts, checks profile boundaries, and analyzes stale authoring references.

Package: `packages/core`

## 4. Interfaces

- CLI: `packages/cli`
- MCP server: `packages/mcp-server`
- Generated Markdown: `packages/markdown`

## 5. Adapters

Adapters connect the atlas to existing systems:

- local filesystem
- code indexes
- developer portals
- external docs
- MCP connectors
- data catalogs

Package: `packages/adapters`

## Data flow

```text
.agent-atlas files
  -> schema validation
    -> graph normalization
      -> traversal / diagnostics
        -> CLI / MCP / generated Markdown / context packs
```

## Current implementation

The original implementation roadmap through M14 is complete:

1. Schema, validation, and schema-version migration support.
2. Graph loading, traversal, path resolution, and diagnostics.
3. CLI commands for validation, boundary checks, graph inspection, context packs, generated Markdown, generation checks, maintenance diffs, card suggestions, migration, benchmarks, doctor checks, usage evidence, and global registries.
4. Generated Markdown views under `docs/agents/*`.
5. Public/private/company overlays and redaction behavior.
6. Read-only MCP resources and tools.
7. Adapter interfaces and generic adapters.
8. Cross-repo registry loading and global context packs.

The next roadmap milestones focus on registry operations and MCP deployment.
