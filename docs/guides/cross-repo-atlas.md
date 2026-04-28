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

## Registry file

Create `agent-atlas.registry.yaml` at the registry root:

```yaml
version: 1
name: Company Engineering Registry
imports:
  - id: central
    path: registry
    role: registry
  - id: release-api
    path: repos/release-api
    role: repository
    repository: repository:release-api
```

The `registry` import holds central metadata. Each `repository` import points at a per-repo atlas root and can name the repository entity it belongs to.

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

```sh
atlas global context-pack "change release video generation workflow" --budget 8000
```

Returns:

- relevant systems/domains
- repositories to inspect
- components and interfaces
- docs/resources
- verification commands per repo
- ownership or contact hints if available

## Company deployment pattern

Keep the public framework and sanitized examples separate from real company data:

- Store central registry metadata in an internal repository.
- Keep each repo's local atlas near that repo's code.
- Import repo atlases through `agent-atlas.registry.yaml`.
- Put real Notion, Confluence, Google, Jira, and repository URLs in private/company overlays.
- Run global context packs with `--profile company`.

Useful checks:

```sh
atlas global validate path/to/company-registry
atlas global list path/to/company-registry
atlas global context-pack "change onboarding workflow" path/to/company-registry --budget 8000
```
