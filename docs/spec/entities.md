# Entity Specification

This document defines the implemented entity model.

## Entity identity

Every entity has a stable ID:

```text
<kind>:<slug>
```

Examples:

```text
domain:calendar
workflow:plan-week
component:google-calendar-adapter
document:notion-weekly-planning-system
resource:primary-calendar
test-scope:calendar-tests
```

IDs should be stable, lowercase, URL-friendly, and portable across generated outputs.

## Common fields

```yaml
schema_version: 1
id: component:example
kind: component
title: Example Component
summary: Short description that helps an agent decide whether to load more.
status: active
visibility: public
tags:
  - example
relations: []
agent:
  load_when: []
  avoid_loading_when: []
  token_budget_hint: 800
```

## Required fields

All entities require:

- `id`
- `kind`
- `title`
- `summary`

M1 does not define additional required fields for specific entity kinds. Kind-specific sections below document optional fields that are meaningful for that kind.

## Optional common fields

- `status`: `active`, `planned`, `deprecated`, `archived`, `experimental`
- `schema_version`: currently `1`; omitted legacy files can be updated with `atlas migrate --to 1 --write`
- `visibility`: `public`, `private`, `internal`, `restricted`
- `tags`: short classification labels
- `aliases`: alternate names agents may see in tasks
- `owners`: people, teams, or roles
- `relations`: typed edges to other entities
- `agent`: agent-specific loading hints
- `metadata`: extension field for adapters

## Entity kinds

### `domain`

A broad conceptual or business area.

Examples:

- calendar
- email
- food
- music-operations
- marketing
- payments
- data-platform

### `system`

A collection of components, resources, APIs, workflows, or repositories that operate together.

### `workflow`

A human, business, operational, creative, or automation process.

Examples:

- plan-week
- publish-single
- generate-music-video
- onboard-customer
- rotate-api-key

### `repository`

A source repository in a cross-repo atlas.

### `component`

A code unit, package, service, module, script group, app, worker, or adapter.

Common fields:

```yaml
code:
  paths:
    - packages/calendar/**
  entrypoints:
    - packages/calendar/src/index.ts
  public_symbols:
    - createCalendarClient
```

### `interface`

An exposed API, CLI, MCP server, npm script, HTTP endpoint collection, event contract, or importable package boundary.

### `tool`

An executable capability that an agent or human can invoke.

Examples:

- CLI command
- MCP tool
- script
- automation helper

### `resource`

An external or internal data/resource location.

Examples:

- Google Calendar
- Notion database
- Confluence space
- S3 bucket
- local generated artifact directory
- Mealie instance
- song asset folder

### `document`

A knowledge artifact.

Examples:

- Markdown file
- Notion page
- Confluence page
- design doc
- policy page
- release process

### `dataset`

Structured data source or derived data collection.

### `secret-scope`

Abstract credential or permission scope, not the secret itself.

### `test-scope`

A verification target: test command, typecheck command, contract suite, smoke test, or validation workflow.

## Agent hints

The `agent` field helps context selection.

```yaml
agent:
  load_when:
    - Editing calendar integration code
    - Debugging weekly planning output
  avoid_loading_when:
    - Only changing email rendering
  token_budget_hint: 900
  risk_notes:
    - Writes to a live calendar when invoked with production credentials.
```

Agent hints are advisory and should not replace typed relations.

## Source references

Entities can reference source artifacts:

```yaml
code:
  paths:
    - packages/calendar/**
  entrypoints:
    - packages/calendar/src/index.ts
```

Documents/resources can reference external URIs:

```yaml
uri: notion://page/weekly-planning-system
access:
  method: mcp
  server: notion
  permission: read
```

Public files should avoid sensitive URI values. Use aliases or private overlays.
