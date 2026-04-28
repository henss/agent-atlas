# Cross-Repo Atlas Guide

For organizations with many repositories, use two layers:

```text
Per-repo atlas:
  local paths, components, workflows, tests, docs

Central registry:
  domains, systems, repositories, cross-repo relations, ownership, shared resources
```

## Per-repo responsibilities

Each repo owns metadata close to its code:

- components
- local interfaces
- local workflows
- source paths
- tests
- repo-specific documents/resources

## Central registry responsibilities

The central registry owns cross-cutting metadata:

- company domains
- systems spanning repos
- shared resources
- ownership and teams
- cross-repo dependencies
- global verification workflows
- links to developer portal entities

## Example central registry entity

```yaml
id: system:release-platform
kind: system
title: Release Platform
summary: Coordinates release planning, asset generation, publishing, and analytics across multiple repositories.
relations:
  - type: contains
    target: repository:release-api
  - type: contains
    target: repository:marketing-tools
  - type: contains
    target: repository:video-generation
```

## Integration with developer portals

For company use, Agent Atlas should integrate with existing catalogs rather than replace them.

Examples:

- Backstage catalog entity -> atlas entity
- Port blueprint instance -> atlas entity
- Sourcegraph code search -> code index adapter
- DataHub dataset -> atlas dataset/resource entity
- Confluence/Jira/Notion -> document/resource references through MCP

## Cross-repo context pack

A future command:

```sh
atlas global context-pack "change release video generation workflow" --budget 8000
```

Should return:

- relevant systems/domains
- repositories to inspect
- components and interfaces
- docs/resources
- verification commands per repo
- ownership or contact hints if available
