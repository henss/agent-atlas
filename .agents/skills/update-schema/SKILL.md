---
name: update-schema
description: Use when changing entity fields, relation vocabulary, validation behavior, or schema versioning.
---

# Update Schema Skill

Schema changes must keep docs, TypeScript types, JSON Schema, and examples aligned.

## Checklist

- Update `docs/spec/entities.md` or `docs/spec/relations.md`.
- Update `packages/schema/src/types.ts`.
- Update `packages/schema/schema/atlas.entity.schema.json`.
- Update example atlas files.
- Add validation diagnostics if relevant.
- Consider migration behavior if changing existing fields.

## Bias

Prefer small, composable fields over domain-specific blobs.
