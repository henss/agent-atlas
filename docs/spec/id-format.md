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

## Stable grammar

```text
<kind>:<slug>
```

- `<kind>` must be one of the entity kinds defined in `docs/spec/entities.md`.
- `<slug>` must start with a lowercase letter or number.
- `<slug>` may contain lowercase letters, numbers, hyphens, dots, underscores, and forward slashes.
- The `kind` field on the entity must match the ID prefix.

Regular expression:

```text
^(domain|system|workflow|repository|component|interface|tool|resource|document|dataset|secret-scope|test-scope):[a-z0-9][a-z0-9._/-]*$
```

## Slug rules

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
