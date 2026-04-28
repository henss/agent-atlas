# Relation Specification

Relations are typed, directional edges between entities.

```yaml
relations:
  - type: uses
    target: component:calendar-adapter
```

## Relation shape

```yaml
type: uses
target: component:calendar-adapter
summary: Optional explanation of the relationship.
strength: primary
```

Optional fields:

- `summary`: short explanation
- `strength`: `primary`, `secondary`, `weak`, `inferred`
- `source`: provenance for generated relations
- `visibility`: public/private/internal/restricted

## Core relation types

### Structural

- `part-of`
- `contains`
- `owned-by`
- `alias-of`

### Implementation

- `implements`
- `implemented-by`
- `exposes`
- `configured-by`

### Usage and dependency

- `uses`
- `used-by`
- `depends-on`
- `dependency-of`
- `calls`
- `called-by`

### Data and resource flow

- `reads-from`
- `writes-to`
- `syncs-with`
- `derived-from`
- `source-of-truth-for`

### Documentation and knowledge

- `documented-in`
- `documents`
- `related-to`
- `supersedes`
- `superseded-by`

### Verification

- `tested-by`
- `verifies`
- `validated-by`

### Security and access

- `requires-secret-scope`
- `requires-permission`
- `accessed-through`

## Inverse relations

Some relations have natural inverses:

| Relation | Inverse |
|---|---|
| `part-of` | `contains` |
| `implements` | `implemented-by` |
| `uses` | `used-by` |
| `depends-on` | `dependency-of` |
| `reads-from` | `read-by` |
| `writes-to` | `written-by` |
| `documented-in` | `documents` |
| `tested-by` | `verifies` |

The core graph loader should generate inverse edges for traversal, while preserving whether an edge was explicit or generated.

## Relation design rules

- Prefer specific relations over vague `related-to`.
- Use `related-to` sparingly.
- Do not encode secrets in relation targets.
- Use `strength: inferred` for generated or uncertain edges.
- Add summaries only when they help an agent choose whether to traverse.

## Example

```yaml
id: workflow:publish-single
kind: workflow
title: Publish Single
summary: Coordinates release tasks for a song.
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
  - type: tested-by
    target: test-scope:release-workflow-tests
```
