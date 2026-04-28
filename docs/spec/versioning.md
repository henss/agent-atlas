# Versioning and Migrations

Atlas entity files may declare a schema version:

```yaml
schema_version: 1
id: component:example
kind: component
title: Example
summary: Example component.
```

The current supported version is `1`. Legacy files without `schema_version` remain valid.

## Sibling-checkout compatibility

Until package publishing is deliberately enabled, downstream repos should use one built Agent Atlas sibling checkout for every local integration surface:

- CLI commands
- schema validation
- generated `docs/agents/*`
- registry commands
- read-only MCP server

The current local contract is:

- workspace package version: `0.11.0`
- entity schema version: `1`
- registry config version: `1`

Generated Markdown should be refreshed with the same checkout version used for validation. `atlas doctor --path <repo>` reports the package versions, supported commands, schema version, registry version, build state, and MCP availability for the current checkout.

## Migration principles

- Additive changes should be preferred.
- Breaking changes should include migration diagnostics.
- Generated files should record generator version.

## CLI

Preview migrations:

```sh
atlas migrate . --to 1
```

Write migrations:

```sh
atlas migrate . --to 1 --write
```

The M10 migration adds or updates top-level `schema_version: 1`. It does not rewrite the rest of the YAML file.
