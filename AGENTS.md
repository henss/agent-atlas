# Agent guidance for Agent Atlas

This repository defines a public framework for building typed context graphs that help AI coding agents navigate complex repositories and external context with minimal token waste.

## Start here

Before changing code or docs, read these files in order:

1. `README.md` for project purpose and boundaries.
2. `docs/vision.md` for the intended product shape.
3. `docs/concepts/typed-context-graph.md` for the central abstraction.
4. `docs/spec/entities.md` and `docs/spec/relations.md` for the draft schema model.
5. `ROADMAP.md` for prioritized implementation work.

For implementation tasks, also read the nearest package README.

## Repository layout

- `packages/schema`: TypeScript types and JSON Schema for atlas entities.
- `packages/core`: graph loading, normalization, traversal, diagnostics, and context-pack logic.
- `packages/cli`: command-line interface skeleton.
- `packages/mcp-server`: MCP server skeleton for atlas resources and tools.
- `packages/markdown`: generated Markdown views for agents and humans.
- `packages/adapters`: adapter interfaces and generic integrations.
- `docs/spec`: draft specification.
- `docs/concepts`: conceptual docs.
- `docs/guides`: practical usage guides.
- `examples`: sanitized example atlases for diverse repo types.
- `.agents/skills`: workflow-specific instructions for coding agents.

## Development principles

- Treat the atlas as a **navigation system**, not a knowledge store.
- Prefer typed, deterministic graph traversal before fuzzy search.
- Keep root context tiny and progressively disclose detail.
- Make generated files obvious and reproducible.
- Keep public/private overlays first-class.
- Avoid hard-coding one domain, one company, one language, or one agent vendor.
- Do not introduce secrets, real private URLs, real customer data, or personal operational data.
- Update docs and examples when changing schema concepts.

## Implementation rules

When adding or changing an entity field:

1. Update `docs/spec/entities.md`.
2. Update `packages/schema/src/types.ts`.
3. Update `packages/schema/schema/atlas.entity.schema.json`.
4. Add or update examples under `examples/*`.
5. Update `docs/guides/authoring-atlas-files.md` if authoring behavior changes.

When adding or changing a relation type:

1. Update `docs/spec/relations.md`.
2. Update `packages/schema/src/relations.ts`.
3. Update examples that should use the relation.
4. Keep inverse relation behavior documented.

When adding CLI behavior:

1. Document command behavior in `packages/cli/README.md`.
2. Keep output concise and LLM-readable.
3. Prefer Markdown output for agent-facing commands.
4. Include machine-readable output only when requested via flags such as `--json`.

When adding MCP behavior:

1. Document resources and tools in `docs/spec/mcp.md`.
2. Keep resources read-only unless explicitly designed otherwise.
3. Use clear confirmation boundaries for any future write-capable tools.

## Done means

For any meaningful change:

- The relevant spec docs are updated.
- The package README remains accurate.
- Examples still reflect the intended model.
- Security and public/private boundaries are not weakened.
- The change preserves top-down and bottom-up traversal use cases.
- Run `atlas maintain fix --path .` and `atlas maintain check --path .` so repo-local Atlas metadata and generated docs stay current.

## Atlas maintenance

This repo uses `agent-atlas.maintenance.yaml` in `agent-maintained` mode. If Atlas metadata is missing or stale while you are working, update `.agent-atlas/**` directly and regenerate `docs/agents/**` with `atlas maintain fix --path .`.

Boundary and validation failures are blockers. Do not bypass them by weakening public/private boundaries or adding private data to public Atlas files.

## Avoid

- Giant root docs that agents must always read.
- Long generated summaries with no source references.
- Vendor-specific assumptions unless isolated in adapters.
- Schema fields that only work for software repos and fail for workflows, creative repos, personal ops, or company catalogs.
- Private context in public examples.

## Useful tasks for Codex

Good first implementation tasks:

- Implement entity loading from `.agent-atlas/**/*.yaml`.
- Implement JSON Schema validation.
- Implement `atlas validate`.
- Implement `atlas show <entity-id>`.
- Implement `atlas resolve-path <path>` using `code.paths` globs.
- Generate `docs/agents/atlas.md` from example atlas files.
- Add tests for overlay merge behavior.

Do not attempt to build every adapter at once. Apparently restraint is still legal.
