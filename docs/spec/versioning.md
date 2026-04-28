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
