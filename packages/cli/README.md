# @agent-atlas/cli

CLI for Agent Atlas.

Implemented commands:

```sh
atlas validate [path]
atlas overview [path]
atlas show <entity-id>
atlas neighbors <entity-id> --depth 2
atlas resolve-path <path>
atlas context-pack "<task>" --budget 4000
atlas generate markdown
atlas generate markdown --check
atlas suggest-card --path <file>
atlas discover-gaps
atlas propose-cards --report <file>
atlas proposal validate <proposal>
atlas proposal apply <proposal> --select <entity-id>
atlas maintain check
atlas maintain fix
atlas maintain agent-instructions
atlas diff
atlas migrate
atlas benchmark
atlas doctor
atlas boundary-check
atlas usage-note "<task>" --command context-pack
atlas evaluate
atlas mcp smoke-test
atlas ui
atlas global validate
atlas global list
atlas global manifest
atlas global context-pack "<task>" --budget 8000
atlas global generate markdown
```

Output should be concise Markdown by default. Add `--json` for machine-readable output.

All commands that load an atlas accept one positional root path or `--path <root>`. Passing both is an error, and unknown flags fail instead of being treated as paths.

## `atlas validate [path]`

Loads entity YAML files under `path` or the current working directory, ignores local `.agent-atlas/usage/` receipts, applies the selected profile, then checks entity shape, ID grammar, kind consistency, relation types, relation targets, duplicate IDs, overlay conflicts, and basic public-profile safety.

```sh
atlas validate examples/personal-ops-sanitized
```

Use `--profile private` or `--profile company` to apply matching overlays before validation:

```sh
atlas validate examples/personal-ops-sanitized --profile private
```

Default output is compact Markdown:

```md
# Atlas validation

Status: passed

Entities: 16
Relations: 32
Warnings: 0
Errors: 0
```

Use JSON for machine-readable diagnostics:

```sh
atlas validate examples/personal-ops-sanitized --json
```

## `atlas overview [path]`

Prints an overview-first map of domains, workflows, implementation surfaces,
supporting docs, tests, and drill-down commands.

```sh
atlas overview --path . --profile public
atlas overview examples/personal-ops-sanitized --json
```

Use this when starting from a repository or atlas root and deciding where to
drill down next. Use `list_entities`, `show`, or `neighbors` for exact lookup
and debugging after the broad shape is clear.

## `atlas show <entity-id> [path]`

Prints one entity plus incoming and outgoing relations. Generated inverse relations are included and marked.

```sh
atlas show workflow:plan-week examples/personal-ops-sanitized
```

Use `--path <path>` when passing flags after the entity ID:

```sh
atlas show workflow:plan-week --path examples/personal-ops-sanitized --json
```

## `atlas neighbors <entity-id> [path]`

Traverses the normalized graph from an entity.

```sh
atlas neighbors workflow:plan-week examples/personal-ops-sanitized --depth 2
```

Filter traversal by relation type with comma-separated values:

```sh
atlas neighbors workflow:plan-week examples/personal-ops-sanitized --relation uses,tested-by
```

## `atlas resolve-path <file-path> [path]`

Matches a repo-relative or absolute source path against component `code.paths` and `code.entrypoints`, then returns owning components plus related workflows, domains, documents, and tests.

```sh
atlas resolve-path packages/planning/src/weeklyPlanner.ts examples/personal-ops-sanitized
```

Ambiguous ownership is scored so more specific matches appear first:

```sh
atlas resolve-path packages/planning/src/shared/format.ts examples/personal-ops-sanitized
```

Use `--depth N` to control related-context traversal depth, `--profile private|company` to apply overlays, or `--json` for machine-readable output.

## `atlas context-pack "<task>" [path]`

Generates a deterministic, token-budgeted context bundle for a coding task.

```sh
atlas context-pack "change CLI path resolution in packages/cli/src/index.ts" --budget 1200
```

The pack selects entities from task text, entity IDs, mentioned paths, and graph neighborhood. Markdown output includes relevant entities with provenance, recommended local reads, external references, verification commands, and risk notes.

Use profile and JSON flags when needed:

```sh
atlas context-pack "generate agent docs" --profile public --json
```

## Local checkout use before publishing

Until packages are published, portfolio repos should build the CLI in a sibling `agent-atlas` checkout and call the built entrypoint directly:

```sh
pnpm --dir ../agent-atlas --filter @agent-atlas/cli build
node ../agent-atlas/packages/cli/dist/index.js validate .
node ../agent-atlas/packages/cli/dist/index.js doctor --path .
node ../agent-atlas/packages/cli/dist/index.js resolve-path packages/core/src/example.ts --path .
node ../agent-atlas/packages/cli/dist/index.js generate markdown --path . --output docs/agents --profile private
node ../agent-atlas/packages/cli/dist/index.js generate markdown --path . --output docs/agents --profile private --check
node ../agent-atlas/packages/cli/dist/index.js suggest-card --path packages/core/src/example.ts --root .
node ../agent-atlas/packages/cli/dist/index.js diff --path .
node ../agent-atlas/packages/cli/dist/index.js context-pack "change packages/core/src/example.ts" --path . --budget 4000 --profile private
```

Keep rollout adoption limited to implemented commands. Downstream repos may use `validate`, `boundary-check`, `show`, `neighbors`, `resolve-path`, `generate markdown`, `generate markdown --check`, `suggest-card`, `diff`, `context-pack`, `usage-note`, `evaluate`, `mcp smoke-test`, `ui`, and read-only MCP resources. Company registry repos may use `atlas global ...`, including registry manifests and central generated Markdown.

## `atlas generate markdown [path]`

Generates compact agent-facing Markdown views.

```sh
atlas generate markdown examples --output ../docs/agents --profile public
```

Generated files begin with `<!-- Generated by Agent Atlas. Do not edit directly. -->`.

Profiles:

- `public`: load base atlas files only, then include public and unspecified visibility entities.
- `private`: load base atlas files plus private overlays, then include all visible entities.
- `company`: load base atlas files plus company overlays, then include all visible entities.

The generator refreshes known generated files and directories while preserving non-generated files such as `docs/agents/README.md`.

Use `--check` in CI to compare generated Markdown with the files on disk without rewriting anything:

```sh
atlas generate markdown --path . --output docs/agents --profile public --check
```

The check fails when generated files are missing or stale.

## `atlas suggest-card --path <file>`

Prints a draft atlas card for a repo file without writing it.

```sh
atlas suggest-card --path packages/cli/src/index.ts --root .
```

The command infers a conservative entity kind from the path. Test-like files become `test-scope` drafts; other files become `component` drafts. Review the ID, summary, relations, and path coverage before adding the YAML to `.agent-atlas/`.

Use `--json` for editor or script integrations.

## `atlas discover-gaps [path]`

Reads local usage receipts, context-pack recall, optional resolve-path misses, `atlas diff` diagnostics, and static metadata coverage checks to produce a read-only gap report.

```sh
atlas discover-gaps --path . --receipts .runtime/agent-atlas/usage --profile private --out .runtime/current/agent-atlas/gaps/latest.json
```

Gap discovery is proposal-first: it reports repeated missing cards, misleading cards, broad-search fallbacks, low recall, stale references, explicit resolve-path misses, untracked source documents, stale milestone summaries, weak document relations, and conservatively detected under-modeled CLI capabilities. Static coverage checks run by default; use `--no-static` for receipt-only runs. The command does not write atlas cards.

## `atlas propose-cards --report <file>`

Consumes a gap report and writes reviewable draft card proposals under `.runtime/agent-atlas/proposals` by default.

```sh
atlas propose-cards --report .runtime/current/agent-atlas/gaps/latest.json --out .runtime/agent-atlas/proposals
```

Proposal generation is deterministic by default. `--llm --llm-provider mock` exercises the bounded enrichment path without network access; live LLM providers are intentionally not wired into the preview CLI.

## `atlas proposal validate|apply <proposal>`

Validates and explicitly applies selected proposal entities.

```sh
atlas proposal validate .runtime/agent-atlas/proposals/example.yaml
atlas proposal apply .runtime/agent-atlas/proposals/example.yaml --select component:example
```

`apply` refuses invalid proposals and only writes selected cards into `.agent-atlas/<profile>/`. It does not commit, push, or regenerate generated docs.

## `atlas maintain check|fix|agent-instructions [path]`

Loads `agent-atlas.maintenance.yaml` or `.agent-atlas/maintenance.yaml` and applies the repo's Atlas maintenance policy. If no policy exists, the default mode is `review-only`.

```sh
atlas maintain check --path .
atlas maintain fix --path .
atlas maintain agent-instructions --path .
```

Supported policy modes:

- `review-only`: report drift and gaps, but do not update atlas metadata automatically.
- `generated-docs-only`: allow generated `docs/agents/*` refreshes while keeping `.agent-atlas/**` metadata review-gated.
- `agent-maintained`: allow agents to update canonical atlas cards and regenerate generated docs, subject to validation and boundary checks.

Example policy:

```yaml
version: 1
mode: agent-maintained
profile: public
generated_docs:
  output: docs/agents
  auto_regenerate: true
metadata:
  auto_apply: true
  allow_add: true
  allow_update: true
  allow_archive: true
  allow_delete: false
safety:
  require_validate: true
  require_boundary_check: true
  block_secret_like_values: true
  block_profile_leaks: true
```

`maintain check` runs validation, boundary checks when required by policy, generated Markdown drift checks, and stale-reference diagnostics. `maintain fix` applies policy-allowed fixes: in `agent-maintained` mode it may add missing cards for changed source files with no atlas owner, and when `generated_docs.auto_regenerate` is enabled it refreshes generated docs. It still fails if validation or boundary checks fail after fixes.

`maintain agent-instructions` emits a compact AGENTS.md-ready block that tells coding agents how to keep Atlas current in the current repo.

## `atlas diff [path]`

Reports atlas maintenance signals for the current checkout.

```sh
atlas diff --path .
```

The report includes changed atlas files, changed generated docs, orphaned `code.paths`, missing `code.entrypoints`, removed files referenced by cards, and package-script references that no longer resolve. Diagnostics are concise Markdown by default, with `--json` available for automation.

## `atlas migrate [path]`

Previews or writes schema migrations. The current migration supports `schema_version: 1`.

```sh
atlas migrate . --to 1
atlas migrate . --to 1 --write
```

Dry-run output is Markdown by default and lists planned file changes.

## `atlas benchmark [path]`

Runs a lightweight load benchmark for larger atlases.

```sh
atlas benchmark . --iterations 5
atlas benchmark examples/company-cross-repo-sanitized --profile company --json
```

## `atlas doctor [path]`

Checks the local sibling-checkout setup and target repo inputs.

```sh
atlas doctor --path .
```

Doctor reports build state, package versions, supported commands, schema and registry versions, MCP availability, and common setup mistakes. Use `--json` for machine-readable health checks.

## `atlas boundary-check [path]`

Audits atlas files and generated `docs/agents/*` for profile boundary leaks.

```sh
atlas boundary-check --path . --profile public
atlas boundary-check --path . --profile company --policy agent-atlas.boundary.yaml
```

Public checks reject private URI schemes, issue-key-shaped identifiers, internal URLs, local user paths, private path markers, and configured public markers. Private and company checks reject secret-shaped values, private-key material, email-shaped live customer data, and configured sensitive markers.

Use `--no-generated` to skip generated docs when diagnosing source atlas files only. Use `--json` for machine-readable diagnostics.

Optional repo-local policy files are loaded from `agent-atlas.boundary.yaml` or `.agent-atlas/boundary-policy.yaml`:

```yaml
version: 1
public_markers:
  - ACME-INTERNAL
secret_markers:
  - production-token
company_markers:
  - live-customer
allow_patterns:
  - sanitized-example
```

## `atlas usage-note "<task>" [path]`

Writes a local session receipt under `.agent-atlas/usage/`.

```sh
atlas usage-note "change CLI path handling" --path . --command context-pack --entity component:cli-package --file packages/cli/src/index.ts --test "pnpm -r test"
```

Receipts can record selected entities, selected files, selected tests, broad-search fallback, missing cards, misleading cards, and an optional outcome. Evidence stays local; the CLI does not send telemetry.

Useful flags:

- `--entity <id>`: repeat for entities that were actually useful.
- `--file <path>`: repeat for source/docs files that were actually useful.
- `--test <command>`: repeat for verification commands that were actually useful.
- `--broad-search-fallback`: mark sessions where broad search was still needed.
- `--missing-card <text>` and `--misleading-card <text>`: record atlas maintenance gaps.
- `--out <file>`: write to a specific receipt path.

## `atlas evaluate [path]`

Compares local usage receipts with deterministic context-pack output.

```sh
atlas evaluate --path . --receipts .agent-atlas/usage --budget 4000
atlas evaluate --path . --evaluation-version atlas-m18-evidence-v1 --out .runtime/atlas-evaluate.json --json
```

Markdown output reports receipt count, broad-search fallback count, missing/misleading card mentions, and average recall for entities, files, and tests. Use `--json` for control-plane analysis. Use `--evaluation-version <id>` to stamp a cut-over or experiment key onto the evaluation, and `--out <file>` to write the JSON result without relying on terminal capture.

## `atlas mcp smoke-test [path]`

Starts the read-only MCP server in memory, calls `resolve_path`, calls `context_pack`, closes cleanly, and checks that files under the atlas root did not change.

```sh
atlas mcp smoke-test --path . --profile public --resolve-path packages/cli/src/index.ts
atlas mcp smoke-test --path . --profile company --resolve-path services/api/src/index.ts --task "change API routing"
```

Use this before adding MCP host config to a downstream repo.

## `atlas ui [path]`

Starts a local read-only human review UI for browsing and debugging an atlas.

```sh
atlas ui --path . --profile public
atlas ui examples/personal-ops-sanitized --port 4390
```

The server binds to `127.0.0.1` by default and chooses the next available port
when the requested port is busy. The UI shows entities, focused graph
neighborhoods, relation provenance, diagnostics, path resolution, context-pack
previews, and optional `metadata.agent_atlas` debug fields. It does not edit
atlas YAML, apply proposals, or regenerate Markdown.

## Sibling-checkout compatibility contract

Until a distribution decision is made, downstream repos should treat one built Agent Atlas checkout as the compatibility unit:

- Use the same checkout for CLI, schema, Markdown generation, registry commands, and MCP server.
- Build with `pnpm -r build` before invoking from a downstream repo.
- Keep all workspace package versions aligned; `0.17.0` is the current local contract version.
- Current entity `schema_version` is `1`; current registry `version` is `1`.
- Current local usage receipt `version` is `1`.
- Generated `docs/agents/*` should be regenerated by the same checkout version that validates the atlas files.
- Public repos may use exact pinned preview CLI packages. Before a preview `@agent-atlas/cli` release, run the readiness checklist in `docs/guides/package-publish-readiness.md`.

## `atlas global validate [registry-root]`

Loads `agent-atlas.registry.yaml`, imports central and per-repo atlas roots, resolves cross-repo relation targets, and prints a concise registry summary.

```sh
atlas global validate examples/company-cross-repo-sanitized
```

Global validation reports duplicate import IDs, duplicate repository IDs, missing import paths, missing repository entities, profile override mismatches, and weak cross-repo topology. Global commands default to `--profile company`.

## `atlas global list [registry-root]`

Lists merged global entities grouped by kind with import provenance.

```sh
atlas global list examples/company-cross-repo-sanitized
```

## `atlas global manifest [registry-root]`

Prints a lock-style registry manifest with imported paths, effective profiles, entity counts, relation counts, and schema versions.

```sh
atlas global manifest examples/company-cross-repo-sanitized
atlas global manifest examples/company-cross-repo-sanitized --json
```

## `atlas global context-pack "<task>" [registry-root]`

Generates a context pack across the merged cross-repo graph.

```sh
atlas global context-pack "change onboarding api http interface and web client" examples/company-cross-repo-sanitized --budget 8000
```

Use `--json` for machine-readable output.

## `atlas global generate markdown [registry-root]`

Generates central registry Markdown summaries from the merged global graph.

```sh
atlas global generate markdown examples/company-cross-repo-sanitized --output docs/agents/global
atlas global generate markdown examples/company-cross-repo-sanitized --output docs/agents/global --check
```

Run this in the control-plane or registry checkout. Product repos should keep their own repo-local `docs/agents/*` output small.
