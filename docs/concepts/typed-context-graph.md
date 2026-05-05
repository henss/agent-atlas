# Typed Context Graph

The typed context graph is the central abstraction of Agent Atlas.

An atlas contains **entities** connected by **typed relations**.

```text
entity --relation--> entity
```

Example:

```text
workflow:publish-single --uses--> component:video-generator
workflow:publish-single --uses--> capability:agent-skill.release-checklist
workflow:publish-single --documented-in--> document:release-process
component:video-generator --tested-by--> test-scope:video-generation-tests
```

## Why a graph?

Complex repositories do not fit cleanly into a tree.

A music operations repo might have:

- song library code
- video generation tools
- marketing copy helpers
- release workflows
- external docs
- storage buckets
- templates
- publishing checklists

A weekly planning repo might have:

- calendar adapters
- email helpers
- meal planning tools
- task extraction
- Notion pages
- calendar data
- generated plans

A company repo ecosystem might have:

- 100+ repositories
- systems
- domains
- services
- APIs
- owners
- dependencies
- Confluence pages
- Jira projects
- data pipelines

A graph lets the same component participate in multiple workflows and domains without forcing duplication.

## Canonical graph, generated views

The graph is the source of truth.

Hierarchical files such as `docs/agents/domains/calendar.md` are generated views.

```text
.agent-atlas/**/*.yaml  -> graph -> generated markdown / CLI / MCP
```

## Traversal examples

Top-down:

```text
domain:music-operations
  -> workflow:publish-single
    -> component:video-generator
      -> packages/video-generator/**
      -> test-scope:video-generation-tests
```

Bottom-up:

```text
packages/video-generator/src/render.ts
  -> component:video-generator
    -> workflow:publish-single
      -> document:release-process
      -> resource:video-template-library
```

## Minimal entity card

```yaml
id: component:video-generator
kind: component
title: Video Generator
summary: Produces video assets from song metadata, templates, and source media.
relations:
  - type: part-of
    target: domain:music-operations
  - type: used-by
    target: workflow:publish-single
code:
  paths:
    - packages/video-generator/**
```
