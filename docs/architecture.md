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

Loads entities, applies overlays, validates, normalizes relations, generates inverse edges, and performs traversal.

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

## Initial implementation priority

1. Schema and validation.
2. Graph loading and traversal.
3. CLI.
4. Generated Markdown.
5. Context packs.
6. MCP.
7. Adapters.
