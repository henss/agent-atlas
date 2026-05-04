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

For private and company work, downstream repos may use one built Agent Atlas sibling checkout for every local integration surface:

- CLI commands
- schema validation
- generated `docs/agents/*`
- registry commands
- read-only MCP server

The current local contract is:

- workspace package version: `0.18.0`
- entity schema version: `1`
- usage receipt version: `1`
- boundary policy version: `1`
- registry config version: `1`

Generated Markdown should be refreshed with the same checkout version used for validation. `atlas doctor --path <repo>` reports the package versions, supported commands, schema version, registry version, build state, and MCP availability for the current checkout.

`atlas evaluate` also accepts an optional evaluation version. This is a caller-owned run or cut-over key used to compare evidence before and after Atlas metadata or routing changes. It does not change receipt `version: 1` and does not require a migration.

Public repos may use the preview npm CLI package when they need self-contained scripts. Pin exact versions such as `@agent-atlas/cli@0.18.0`; do not rely on `latest` while the release line uses the `preview` dist-tag.

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
