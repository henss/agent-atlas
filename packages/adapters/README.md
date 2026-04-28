# @agent-atlas/adapters

Adapter interfaces and generic adapters for connecting Agent Atlas to existing systems.

Adapters should route agents to authoritative systems instead of copying private content into the atlas.

## Interfaces

- `CodeIndexAdapter`: resolves paths, symbols, and text search references.
- `DeveloperPortalAdapter`: maps service catalogs and developer portals to atlas entities.
- `ExternalResourceResolver`: describes external references without embedding private data.
- `AtlasAdapter`: generic provider interface for entities, relations, resources, and diagnostics.

## Built-in adapters

- `BackstageAdapter`: maps Backstage catalog entities to atlas entities and relations.
- `SourcegraphAdapter`: creates deterministic Sourcegraph file, symbol, and text-search references.
- `LocalDocsAdapter`: scans local Markdown files and emits `document` entities.

## Built-in resource resolvers

- `notionResourceResolver`
- `confluenceResourceResolver`
- `googleResourceResolver`

For public profiles, these resolvers redact concrete external URIs and mark that a private overlay is required.

## Example

```ts
import { BackstageAdapter, SourcegraphAdapter } from "@agent-atlas/adapters";

const backstage = new BackstageAdapter({
  catalog: [
    {
      kind: "Component",
      metadata: {
        name: "checkout-api",
        description: "Handles checkout requests.",
      },
      spec: {
        owner: "team-payments",
        system: "commerce-platform",
      },
    },
  ],
});

const result = await backstage.load({ profile: "public" });

const sourcegraph = new SourcegraphAdapter({
  baseUrl: "https://sourcegraph.example",
  repository: "github.com/example/repo",
});

const matches = await sourcegraph.resolvePath("packages/api/src/index.ts", {
  profile: "company",
});
```
