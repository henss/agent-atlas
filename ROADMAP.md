# Roadmap

This roadmap is intentionally staged. Building everything at once is how frameworks become haunted furniture.

Status: M0-M15 are complete. M16 is the next MCP hardening milestone.

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

- [x] Better diagnostics.
- [x] Golden output tests.
- [x] Migration tooling for schema versions.
- [x] Authoring guide improvements.
- [x] Contributor examples.
- [x] CI templates.
- [x] Performance benchmarks for large repos.

## M11: Consumer ergonomics and version discipline

Goal: make Atlas boring to invoke from downstream repos and agent runtimes.

- [x] Make CLI path arguments consistent across commands, including `<path>` and `--path` forms.
- [x] Remove footguns where stale or alternate invocation shapes silently load zero entities.
- [x] Define the sibling-checkout compatibility contract for CLI, schema, generated docs, and registry versions.
- [x] Add `atlas doctor` for build state, package availability, supported commands, schema version, MCP availability, and common downstream setup mistakes.
- [x] Add copy-paste script templates for public repos, private repos, company repos, and central registry repos.
- [x] Keep npm package publishing out of scope until a separate distribution decision is made.

## M12: Adoption evidence and efficiency measurement

Goal: prove Atlas reduces agent search cost before broadening metadata.

- [x] Add a local `atlas usage-note` or session receipt format for task label, command used, selected entities, selected files/tests, broad-search fallback, and missing or misleading cards.
- [x] Add an evaluator that compares context packs against known task packets or completed sessions from downstream control-plane usage.
- [x] Document success metrics for fewer broad searches, fewer irrelevant reads, better first-pass test selection, and less repeated orientation.
- [x] Add a rollout evidence guide for moving repos from `guidance-only` to `pilot` to `active`.
- [x] Keep usage evidence local and downstream-owned; do not add hosted telemetry or phone-home behavior.

## M13: Boundary safety and policy integration

Goal: make public, private, and company rollouts safer to audit.

- [x] Add `atlas boundary-check <repo> --profile public|private|company`.
- [x] Reject public-profile atlas files that include private paths, issue keys, internal URLs, local user paths, or configured private markers.
- [x] Reject company-profile files that include secrets, credentials, copied document bodies, or live customer data.
- [x] Support repo-local boundary policy files so control planes can supply private marker sets without putting them in the public project.
- [x] Check generated `docs/agents/*` output for the same boundary leaks as canonical atlas files.
- [x] Document how public pilot repos combine Atlas boundary checks with their own public-boundary checks.

## M14: Incremental authoring and maintenance tools

Goal: reduce the cost of keeping atlas metadata current.

- [x] Add `atlas suggest-card --path <file>` to emit draft component, workflow, or test-scope cards without writing by default.
- [x] Add `atlas diff` for changed entities, stale generated docs, orphaned paths, and removed files referenced by cards.
- [x] Add `atlas generate --check` for CI and control-plane validation without rewriting generated docs.
- [x] Diagnose stale card references: missing paths, globs matching nothing, missing entrypoints, and test commands that reference missing scripts.
- [x] Add authoring recipes for one-seam updates so agents do not blanket-seed repos.

## M15: Control-plane and global registry hardening

Goal: make central registries reliable for portfolio and company control planes.

- [x] Add global registry diagnostics for duplicate repository IDs, missing imports, missing repository entities, profile mismatches, and weak cross-repo context packs.
- [x] Add a registry lock or manifest output with imported repo path, profile, entity count, relation count, and schema version.
- [x] Add `atlas global generate markdown` for central registry summaries without merging private or company content into product repos.
- [x] Add sanitized examples for private overlays owned by a portfolio control plane and company overlays owned by a company control plane.
- [x] Keep cross-repo topology centralized; product repos remain small and repo-local.

## M16: MCP operational hardening

Goal: make read-only Atlas MCP practical for everyday agent use.

- [ ] Add an MCP smoke-test CLI that starts the server, calls `resolve_path`, calls `context_pack`, and exits cleanly.
- [ ] Add MCP config snippets for common agent hosts with profile-specific examples.
- [ ] Improve MCP resource and tool errors for bad profiles, missing graphs, stale builds, and invalid path inputs.
- [ ] Add read-only security assertions so MCP tests prove no file mutation or downstream command execution occurs.
- [ ] Add portfolio and company deployment notes that keep private topology out of public examples.
