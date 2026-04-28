# ADR 0001: Model the atlas as a typed context graph

## Status

Accepted as initial direction.

## Context

Complex repositories and organizations contain code, documents, workflows, resources, tools, tests, and external systems. A simple directory hierarchy cannot model cross-cutting workflows or bottom-up traversal from source files to broader context.

## Decision

Agent Atlas will use a typed context graph as the canonical model.

Entities represent domains, workflows, components, interfaces, tools, resources, documents, datasets, secret scopes, test scopes, repositories, and systems.

Relations represent typed edges such as `uses`, `implements`, `documented-in`, `writes-to`, and `tested-by`.

Hierarchical Markdown views are generated from the graph.

## Consequences

Benefits:

- supports top-down traversal
- supports bottom-up traversal
- supports cross-cutting workflows
- supports generated docs and context packs
- supports cross-repo registries

Costs:

- requires schema discipline
- requires validation
- requires careful relation vocabulary design
- may be overkill for tiny repos

## Alternatives considered

### Pure hierarchy

Rejected because many entities belong to multiple workflows/domains.

### Vector index as source of truth

Rejected because retrieval results are not stable enough for authoritative traversal.

### Markdown wiki only

Rejected because it is hard to validate and hard to query deterministically.
