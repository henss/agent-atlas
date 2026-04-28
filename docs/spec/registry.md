# Registry Specification

Cross-repo registries let Agent Atlas combine a central company atlas with multiple per-repo atlases.

The registry file is named:

```text
agent-atlas.registry.yaml
```

It lives at the registry root and points at imported atlas roots.

## Registry shape

```yaml
version: 1
name: Company Engineering Registry
imports:
  - id: central
    path: registry
    role: registry
  - id: onboarding-api
    path: repos/onboarding-api
    role: repository
    repository: repository:onboarding-api
```

Fields:

- `version`: registry model version. Current value is `1`.
- `name`: human-readable registry name.
- `imports`: ordered atlas roots to load.

Import fields:

- `id`: stable import identifier.
- `path`: path relative to the registry file.
- `role`: `registry` for central metadata or `repository` for per-repo metadata.
- `repository`: optional repository entity ID for a per-repo import.
- `profile`: optional profile override for that import.

## Merge rules

Global loading:

1. Loads each import as an atlas root.
2. Allows direct YAML roots when an import does not contain `.agent-atlas`.
3. Applies the selected profile, defaulting to `company`.
4. Merges all entities into one graph.
5. Generates inverse graph edges as usual.
6. Adds import provenance under `entity.metadata.registry`.
7. Adds inferred `part-of` relations from per-repo entities to their repository entity when configured.

Duplicate entity IDs across imports are errors. The first entity is kept so diagnostics and output remain deterministic.

## Cross-repo references

Per-repo atlases may reference central registry entities such as shared interfaces, systems, resources, and repository IDs. Missing-target diagnostics from individual imports are suppressed when the target exists after the global merge.

## CLI

Implemented commands:

```sh
atlas global validate [registry-root]
atlas global list [registry-root]
atlas global context-pack "<task>" [registry-root] --budget 8000
```

Global commands default to the `company` profile because cross-repo registries usually contain internal topology.
