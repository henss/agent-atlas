# @agent-atlas/schema

Types, relation vocabulary, entity kinds, required fields, and JSON Schema assets for atlas entity cards.

Implemented responsibilities:

- define stable entity ID and kind types
- define common entity, relation, command, access, code, and agent hint shapes
- expose the supported relation vocabulary and inverse relation map
- define `schema_version: 1`
- keep `schema/atlas.entity.schema.json` aligned with TypeScript types

Schema changes should be reflected in `docs/spec/entities.md`, `docs/spec/relations.md`, and example atlas files.
