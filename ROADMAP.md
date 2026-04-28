# Roadmap

This roadmap is intentionally staged. Building everything at once is how frameworks become haunted furniture.

## M0: Foundations

Goal: make the public framework understandable and implementable.

- [x] Repository scaffold.
- [x] Draft entity and relation docs.
- [x] Package layout.
- [x] Sanitized examples.
- [x] LLM-facing `AGENTS.md`.
- [x] Agent skills for common implementation tasks.

## M1: Schema and validation

Goal: make atlas files machine-checkable.

- [x] Implement TypeScript entity types in `packages/schema`.
- [x] Finalize JSON Schema for entity cards.
- [x] Add validation diagnostics.
- [x] Implement `atlas validate`.
- [x] Add tests for valid and invalid example entities.
- [x] Define stable entity ID grammar.
- [x] Define required vs optional fields by entity kind.

## M2: Graph loading and traversal

Goal: make atlas data navigable.

- [x] Load `.agent-atlas/**/*.yaml` files.
- [x] Normalize entities and relation edges.
- [x] Generate inverse edges.
- [x] Implement `atlas show <entity-id>`.
- [x] Implement `atlas neighbors <entity-id> --depth N`.
- [x] Implement relation filters.
- [x] Implement cycle and orphan diagnostics.

## M3: Bottom-up path resolution

Goal: let agents start from a file and find broader context.

- [x] Implement glob matching for `code.paths`.
- [x] Implement `atlas resolve-path <path>`.
- [x] Return owning components, workflows, domains, docs, and tests.
- [x] Add confidence scoring for ambiguous path matches.
- [x] Add examples for multi-component path ownership.

## M4: Generated Markdown views

Goal: create lightweight docs that agents and contributors can read.

- [x] Generate `docs/agents/atlas.md`.
- [x] Generate domain cards.
- [x] Generate workflow cards.
- [x] Generate component cards.
- [x] Mark generated files clearly.
- [x] Add public/private profile support for generated docs.

## M5: Context packs

Goal: generate token-budgeted context bundles for coding agents.

- [x] Implement `atlas context-pack "<task>" --budget <tokens>`.
- [x] Select entities by ID, text match, path, and graph neighborhood.
- [x] Include recommended reads and verification commands.
- [x] Include external resources as references, not copied content.
- [x] Add provenance for each included item.
- [x] Add deterministic output mode.

## M6: Overlays

Goal: support public core metadata plus private/company extensions.

- [x] Define overlay merge rules.
- [x] Implement `--profile public|private|company`.
- [x] Add private overlay examples.
- [x] Add diagnostics for accidentally public sensitive fields.
- [x] Add redaction helpers for generated docs.

## M7: MCP server

Goal: expose the atlas to agents through standard tools/resources.

- [x] Expose `atlas://root`.
- [x] Expose `atlas://entity/{id}`.
- [x] Expose `atlas://path/{path}`.
- [x] Add tools: `list_entities`, `describe_entity`, `resolve_path`, `find_related`, `context_pack`.
- [x] Keep the initial MCP server read-only.
- [x] Add security documentation for MCP use.

## M8: Adapter ecosystem

Goal: reuse existing systems instead of rebuilding them badly.

- [x] Define code index adapter interface.
- [x] Define developer portal adapter interface.
- [x] Define external resource resolver interface.
- [x] Add optional Backstage adapter.
- [x] Add optional Sourcegraph adapter.
- [x] Add optional local filesystem/docs adapter.
- [x] Add examples for Notion/Confluence/Google resource references without embedding private data.

## M9: Cross-repo registry

Goal: support organizations with many repositories.

- [x] Define central registry model.
- [x] Import per-repo atlases.
- [x] Resolve cross-repo entity references.
- [x] Generate global context packs.
- [x] Add `atlas global ...` commands.
- [x] Document company deployment patterns.

## M10: Usability hardening

Goal: make the project boringly useful.

- [ ] Better diagnostics.
- [ ] Golden output tests.
- [ ] Migration tooling for schema versions.
- [ ] Authoring guide improvements.
- [ ] Contributor examples.
- [ ] CI templates.
- [ ] Performance benchmarks for large repos.
