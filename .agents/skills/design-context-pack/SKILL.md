---
name: design-context-pack
description: Use when implementing task-specific context pack generation, ranking, budgeting, or output format.
---

# Design Context Pack Skill

A context pack is a task-specific, token-budgeted map. It should route the agent, not become the entire source of truth.

## Include

- matched entities
- graph neighborhood
- recommended reads
- external resources to fetch
- verification commands
- risk notes

## Avoid

- full source files
- full external docs
- secrets
- stale live data
- ungrounded generated summaries

## Ranking hints

Prioritize:

1. direct ID/title/alias matches
2. owning workflows/domains/components
3. `tested-by` scopes
4. `documented-in` sources
5. primary relations over weak/inferred relations
