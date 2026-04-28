---
name: add-adapter
description: Use when designing adapters for Backstage, Sourcegraph, code indexes, Notion, Confluence, Google Workspace, or other external systems.
---

# Add Adapter Skill

Adapters should connect Agent Atlas to existing systems without making the core vendor-specific.

## Rules

- Keep adapter interfaces small.
- Put vendor-specific behavior outside `packages/core`.
- Respect public/private profiles.
- Never leak private identifiers into public generated output.
- Prefer references and aliases over copied external content.

## Common adapter outputs

Adapters may provide:

- entities
- relations
- external resource descriptions
- path or symbol resolution
- verification hints
