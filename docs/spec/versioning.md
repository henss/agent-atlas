# Versioning and Migrations

The atlas schema should be versioned once implementation begins.

Suggested top-level field for future entity files:

```yaml
schema_version: 1
```

Initial seed examples omit `schema_version` to keep the draft light. Add it when validation and migration tooling exist.

## Migration principles

- Additive changes should be preferred.
- Breaking changes should include migration diagnostics.
- The CLI should eventually support `atlas migrate`.
- Generated files should record generator version.
