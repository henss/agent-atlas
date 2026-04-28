# Adapter Specification

Adapters connect Agent Atlas to existing systems without making the graph a copy of those systems.

## Principles

- Keep adapter interfaces small and vendor-neutral.
- Return typed entities, relations, path matches, or resource references.
- Prefer links and access instructions over copied external content.
- Keep concrete private IDs, URLs, and credentials in private overlays.
- Make public output safe by default.

## Adapter result

Adapters return zero or more:

- `entities`: atlas entities produced from an external catalog or local source.
- `relations`: relation contributions between existing entities.
- `resources`: external resource references that can be resolved elsewhere.
- `diagnostics`: adapter warnings or errors.

## Code index adapter

Code index adapters support bottom-up discovery from code search systems.

Core methods:

- `resolvePath(path, context)`: returns path matches, optional entity IDs, URIs, confidence, and source.
- `findSymbols(query, context)`: optional symbol lookup.
- `searchText(query, context)`: optional text search.

The built-in Sourcegraph adapter produces deterministic Sourcegraph file and search URLs. It does not call Sourcegraph directly.

## Developer portal adapter

Developer portal adapters convert service catalogs into atlas-safe entities.

Core methods:

- `listEntities(context)`: returns catalog entities mapped to atlas kinds.
- `getEntity(id, context)`: optional point lookup.

The built-in Backstage adapter maps catalog `Component`, `System`, `API`, and `Resource` entries to atlas entities and relations.

## External resource resolver

External resource resolvers describe references to systems such as Notion, Confluence, or Google Workspace.

Core methods:

- `canResolve(uri)`: returns whether a resolver understands the URI scheme.
- `describe(uri, context)`: returns a title, summary, access method, and safe URI.

For public profiles, resolvers should redact concrete external IDs and mark private overlay requirements.

## Local docs adapter

The local docs adapter scans Markdown files and emits `document` entities with file access references. It is intended for local repository docs, not external knowledge bases.
