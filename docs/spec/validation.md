# Validation Specification Draft

Validation should catch structural problems early and produce diagnostics that are useful to both humans and agents.

## Diagnostic levels

- `error`: invalid atlas, command should fail
- `warning`: likely issue, command can continue
- `info`: useful note

## Core validations

- Entity IDs are valid and unique in base atlas files.
- Overlay files have a valid `id` and merge into an existing base entity for the selected profile.
- Entity `kind` matches ID prefix.
- Required fields are present.
- Relation targets exist or are marked external.
- Relation types are known.
- Inverse relations are generated consistently.
- Code paths are repo-relative and do not escape the repo.
- Public profile does not contain private-only URI schemes.
- Unsupported `schema_version` values are errors.
- Unknown overlay profiles and overlay kind conflicts are reported.
- Overlay does not change protected fields.
- Generated files are not hand-edited when generation checks are enabled.

## Example diagnostic

```json
{
  "level": "warning",
  "code": "RELATION_TARGET_MISSING",
  "message": "Relation target document:release-process does not exist in profile public.",
  "hint": "Create the target entity, fix the target ID, or move cross-repo references into a global registry.",
  "entityId": "workflow:publish-single",
  "path": "examples/band-ops-sanitized/.agent-atlas/workflows/publish-single.yaml"
}
```

## Agent-facing CLI behavior

`atlas validate` should print compact Markdown by default:

```md
# Atlas validation

Status: failed

## Errors

- `workflow:publish-single`: relation target `document:release-process` does not exist.

## Warnings

- `component:video-generator`: code path `packages/video/**` matched no files.
  Fix: Add the missing files or narrow the component path.
```

Use `--json` for machine-readable output.
