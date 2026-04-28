# Design Principles

## 1. Graph first, hierarchy second

A hierarchy is a useful view, but the canonical model is a typed graph. Domains, workflows, components, tools, and documents often overlap. A graph handles overlap without duplicating everything until the docs become an archaeological site.

## 2. Progressive disclosure

Agents should start with small routing context and load detail only when needed.

```text
root index -> entity card -> related cards -> source artifacts
```

## 3. Deterministic before fuzzy

Use typed entity IDs, relation traversal, path matching, and explicit resources before vector search or generated summaries.

Fuzzy search is useful as a fallback. It should not be the authority.

## 4. Metadata routes to sources

Atlas metadata should point to authoritative source artifacts. It should not duplicate entire docs, code files, calendars, tickets, or datasets.

## 5. Public/private overlays are first-class

The same repo may have:

- public metadata for contributors
- private local metadata for the owner
- company metadata for internal agents
- generated views for different profiles

## 6. Security by structure

The schema should make it hard to accidentally publish secrets or private identifiers. Sensitive details belong in private overlays or external systems.

## 7. Agent output should be concise

Commands meant for agents should produce compact Markdown by default. Machines can request JSON.

## 8. Adapters over rewrites

Use existing systems where possible: code indexes, Backstage/Port, Sourcegraph, Notion, Confluence, Google Workspace, data catalogs, and MCP servers.

## 9. Examples must be diverse

The schema should work for:

- open-source software repos
- internal company repos
- personal automation repos
- creative/music/media repos
- cross-repo organizations

## 10. Every abstraction must earn its keep

A field, entity kind, or relation type should exist because it improves traversal, validation, context selection, security, or verification.
