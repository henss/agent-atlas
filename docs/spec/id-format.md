# Entity ID Format

Entity IDs use:

```text
<kind>:<slug>
```

Examples:

```text
domain:music-operations
workflow:publish-single
component:video-generator
resource:video-template-library
```

## Slug rules

Draft rules:

- lowercase letters
- numbers
- hyphen separators
- optional dots or slashes for namespaces if needed
- stable over time

## Cross-repo IDs

For central registries, entity IDs may remain local and be resolved by repo scope, or may include namespaced slugs.

Examples:

```text
repository:video-generation
component:video-generation/video-renderer
```

The exact cross-repo grammar is open for design in M9.
