# Contributor Examples

These examples show small, reviewable changes contributors can make to an atlas.

## Add a component

```yaml
schema_version: 1
id: component:search-indexer
kind: component
title: Search Indexer
summary: Builds local search metadata from repository files.
code:
  paths:
    - packages/search-indexer/**
relations:
  - type: part-of
    target: workflow:index-repository
  - type: tested-by
    target: test-scope:search-indexer-tests
agent:
  load_when:
    - Changing search index generation
  token_budget_hint: 800
```

## Add verification

```yaml
schema_version: 1
id: test-scope:search-indexer-tests
kind: test-scope
title: Search Indexer Tests
summary: Unit tests for search indexing and path filtering.
commands:
  - command: pnpm --filter search-indexer test
    purpose: Run search indexer tests.
relations:
  - type: verifies
    target: component:search-indexer
```

## Add a private document reference

Public placeholder:

```yaml
schema_version: 1
id: document:search-index-design
kind: document
title: Search Index Design
summary: Internal design document for search indexing tradeoffs.
access:
  private_overlay_required: true
relations:
  - type: documents
    target: component:search-indexer
```

Private overlay:

```yaml
id: document:search-index-design
uri: confluence://redacted-private-page
access:
  method: mcp
  server: confluence
  permission: read
```

## Review checklist

- `atlas validate .`
- `atlas resolve-path <changed-file> .`
- `atlas context-pack "<task>" . --budget 2000`
- `atlas generate markdown . --output docs/agents`
