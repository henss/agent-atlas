# ADR 0002: Public core with private overlays

## Status

Accepted as initial direction.

## Context

Agent Atlas should be useful for open-source repositories, private personal repositories, and company environments. Real context often includes sensitive identifiers and relationships.

## Decision

The core standard and tooling will be open-source. Real atlas contents may use overlays for private or company-only details.

## Consequences

Benefits:

- public schema and tools can be adopted widely
- private data stays private
- the same repo can support public contributors and internal agents

Costs:

- overlay merge behavior must be specified and tested
- generated docs must respect profiles
- users need education on safe authoring
