# CLI Command Reference

> Generated from Commander command definitions. Edit the CLI program metadata and rerun `atlas cli docs generate`.

## Evaluation Commands

### `atlas benchmark [path] [--iterations <n>] [--path <root>] [--profile <profile>] [--json]`

Benchmark Atlas context-pack selection.

Runs context-pack benchmark iterations for the atlas graph.

Arguments:
- `path`

Options:
- `--path <root>` (value required) - Atlas root path; use instead of positional root.
- `--profile <profile>` (value required) - Atlas profile: public, private, or company.
- `--json` - Print machine-readable JSON output.
- `--iterations <n>` (value required) - Benchmark iterations.

### `atlas boundary-check [path] [--policy <path>] [--include-generated] [--path <root>] [--profile <profile>] [--json]`

Check profile boundary safety.

Scans atlas metadata and generated docs for public/private boundary issues and secret-shaped values.

Arguments:
- `path`

Options:
- `--path <root>` (value required) - Atlas root path; use instead of positional root.
- `--profile <profile>` (value required) - Atlas profile: public, private, or company.
- `--json` - Print machine-readable JSON output.
- `--policy <path>` (value required) - Boundary policy path.
- `--include-generated` - Include generated Markdown in the boundary scan.

### `atlas doctor [path] [--path <root>] [--profile <profile>] [--json]`

Check local Agent Atlas setup.

Reports CLI build state, package versions, supported commands, atlas input, generated docs, and MCP availability.

Arguments:
- `path`

Options:
- `--path <root>` (value required) - Atlas root path; use instead of positional root.
- `--profile <profile>` (value required) - Atlas profile: public, private, or company.
- `--json` - Print machine-readable JSON output.

### `atlas evaluate [path] [--receipts <path>] [--budget <tokens>] [--evaluation-version <id>] [--out <path>] [--path <root>] [--profile <profile>] [--json]`

Evaluate Atlas usage evidence.

Aggregates local usage receipts and reports recall and adoption evidence.

Arguments:
- `path`

Options:
- `--path <root>` (value required) - Atlas root path; use instead of positional root.
- `--profile <profile>` (value required) - Atlas profile: public, private, or company.
- `--json` - Print machine-readable JSON output.
- `--receipts <path>` (value required) - Usage receipt directory.
- `--budget <tokens>` (value required) - Context budget.
- `--evaluation-version <id>` (value required) - Caller-owned evaluation version.
- `--out <path>` (value required) - Write evaluation JSON.

### `atlas usage-note <task> [--command <command>] [--entity <id>] [--file <path>] [--test <command>] [--missing-card <note>] [--misleading-card <note>] [--out <path>] [--path <root>] [--profile <profile>] [--json]`

Record local Atlas usage evidence.

Writes a local usage receipt for context-pack, path-resolution, or fallback evidence.

Arguments:
- `task` (required)

Options:
- `--path <root>` (value required) - Atlas root path; use instead of positional root.
- `--profile <profile>` (value required) - Atlas profile: public, private, or company.
- `--json` - Print machine-readable JSON output.
- `--command <command>` (value required) - Atlas command used.
- `--entity <id>` (value required) - Selected entity; repeatable.
- `--file <path>` (value required) - Selected file; repeatable.
- `--test <command>` (value required) - Selected verification command; repeatable.
- `--missing-card <note>` (value required) - Missing card observation.
- `--misleading-card <note>` (value required) - Misleading card observation.
- `--out <path>` (value required) - Usage receipt output path.

## Generated Artifact Commands

### `atlas cli docs check [--output <path>]`

Check the CLI command reference.

Fails when the Commander-derived CLI reference is stale or missing.

Options:
- `--output <path>` (value required) - Reference Markdown output path.

### `atlas cli docs generate [--output <path>] [--check]`

Generate the CLI command reference.

Writes the Commander-derived CLI reference Markdown.

Options:
- `--output <path>` (value required) - Reference Markdown output path.
- `--check` - Check drift without writing files.

### `atlas generate markdown [path] [--output <path>] [--check] [--path <root>] [--profile <profile>] [--json]`

Generate atlas Markdown views.

Writes generated Markdown cards for the atlas graph and optionally checks for drift.

Arguments:
- `path`

Options:
- `--path <root>` (value required) - Atlas root path; use instead of positional root.
- `--profile <profile>` (value required) - Atlas profile: public, private, or company.
- `--json` - Print machine-readable JSON output.
- `--output <path>` (value required) - Generated docs output directory.
- `--check` - Check drift without writing files.

### `atlas sources docs check [path] [--path <root>] [--output <path>] [--profile <profile>]`

Check the source-derived Atlas reference.

Fails when the source-derived reference is stale or missing.

Arguments:
- `path`

Options:
- `--path <root>` (value required) - Atlas root path.
- `--output <path>` (value required) - Reference Markdown output path.
- `--profile <profile>` (value required) - Atlas profile.

### `atlas sources docs generate [path] [--path <root>] [--output <path>] [--check] [--profile <profile>]`

Generate the source-derived Atlas reference.

Writes the reference for entities derived from package scripts, packages, tests, docs, config, routes, and dependencies.

Arguments:
- `path`

Options:
- `--path <root>` (value required) - Atlas root path.
- `--output <path>` (value required) - Reference Markdown output path.
- `--check` - Check drift without writing files.
- `--profile <profile>` (value required) - Atlas profile.

## Global Registry Commands

### `atlas global context-pack <task> [path] [--budget <tokens>] [--deterministic] [--path <root>] [--profile <profile>] [--json]`

Build a global registry context pack.

Selects task context across merged cross-repo Atlas imports.

Arguments:
- `task` (required)
- `path`

Options:
- `--path <root>` (value required) - Atlas root path; use instead of positional root.
- `--profile <profile>` (value required) - Atlas profile: public, private, or company.
- `--json` - Print machine-readable JSON output.
- `--budget <tokens>` (value required) - Approximate token budget.
- `--deterministic` - Use deterministic selection.

### `atlas global generate markdown [path] [--output <path>] [--check] [--path <root>] [--profile <profile>] [--json]`

Generate global registry Markdown.

Writes generated Markdown views for a merged global registry graph.

Arguments:
- `path`

Options:
- `--path <root>` (value required) - Atlas root path; use instead of positional root.
- `--profile <profile>` (value required) - Atlas profile: public, private, or company.
- `--json` - Print machine-readable JSON output.
- `--output <path>` (value required) - Generated docs output directory.
- `--check` - Check drift without writing files.

### `atlas global list [path] [--path <root>] [--profile <profile>] [--json]`

List global Atlas registry entities.

Prints entities from the merged cross-repo registry graph.

Arguments:
- `path`

Options:
- `--path <root>` (value required) - Atlas root path; use instead of positional root.
- `--profile <profile>` (value required) - Atlas profile: public, private, or company.
- `--json` - Print machine-readable JSON output.

### `atlas global manifest [path] [--path <root>] [--profile <profile>] [--json]`

Print a global registry manifest.

Renders a compact manifest for cross-repo registry imports.

Arguments:
- `path`

Options:
- `--path <root>` (value required) - Atlas root path; use instead of positional root.
- `--profile <profile>` (value required) - Atlas profile: public, private, or company.
- `--json` - Print machine-readable JSON output.

### `atlas global validate [path] [--path <root>] [--profile <profile>] [--json]`

Validate a global Atlas registry.

Loads registry imports and validates the merged cross-repo graph.

Arguments:
- `path`

Options:
- `--path <root>` (value required) - Atlas root path; use instead of positional root.
- `--profile <profile>` (value required) - Atlas profile: public, private, or company.
- `--json` - Print machine-readable JSON output.

## Graph Commands

### `atlas context-pack <task> [path] [--budget <tokens>] [--deterministic] [--path <root>] [--profile <profile>] [--json]`

Build a task-focused context pack.

Selects task-relevant entities, source reads, external references, verification commands, and risk notes within a token budget.

Arguments:
- `task` (required)
- `path`

Options:
- `--path <root>` (value required) - Atlas root path; use instead of positional root.
- `--profile <profile>` (value required) - Atlas profile: public, private, or company.
- `--json` - Print machine-readable JSON output.
- `--budget <tokens>` (value required) - Approximate token budget.
- `--deterministic` - Use deterministic selection.

### `atlas neighbors <entity-id> [path] [--depth <n>] [--relation <types>] [--path <root>] [--profile <profile>] [--json]`

Traverse nearby graph context.

Walks relations around an entity for a bounded depth and optional relation filter.

Arguments:
- `entity-id` (required)
- `path`

Options:
- `--path <root>` (value required) - Atlas root path; use instead of positional root.
- `--profile <profile>` (value required) - Atlas profile: public, private, or company.
- `--json` - Print machine-readable JSON output.
- `--depth <n>` (value required) - Traversal depth.
- `--relation <types>` (value required) - Comma-separated relation types to traverse.

### `atlas overview [path] [--path <root>] [--profile <profile>] [--json]`

Print an overview of the atlas graph.

Renders the high-level domain, workflow, component, document, and verification map for a repository.

Arguments:
- `path`

Options:
- `--path <root>` (value required) - Atlas root path; use instead of positional root.
- `--profile <profile>` (value required) - Atlas profile: public, private, or company.
- `--json` - Print machine-readable JSON output.

### `atlas resolve-path <file-path> [path] [--depth <n>] [--path <root>] [--profile <profile>] [--json]`

Resolve a file path to atlas owners.

Matches a source path against component paths and entrypoints, then returns relevant surrounding context.

Arguments:
- `file-path` (required)
- `path`

Options:
- `--path <root>` (value required) - Atlas root path; use instead of positional root.
- `--profile <profile>` (value required) - Atlas profile: public, private, or company.
- `--json` - Print machine-readable JSON output.
- `--depth <n>` (value required) - Related-context traversal depth.

### `atlas show <entity-id> [path] [--path <root>] [--profile <profile>] [--json]`

Show one atlas entity.

Prints one entity with incoming and outgoing relations.

Arguments:
- `entity-id` (required)
- `path`

Options:
- `--path <root>` (value required) - Atlas root path; use instead of positional root.
- `--profile <profile>` (value required) - Atlas profile: public, private, or company.
- `--json` - Print machine-readable JSON output.

### `atlas validate [path] [--path <root>] [--profile <profile>] [--json]`

Validate atlas metadata.

Loads atlas YAML, applies the selected profile, and reports schema, relation, and safety diagnostics.

Arguments:
- `path`

Options:
- `--path <root>` (value required) - Atlas root path; use instead of positional root.
- `--profile <profile>` (value required) - Atlas profile: public, private, or company.
- `--json` - Print machine-readable JSON output.

## Integration Commands

### `atlas mcp smoke-test [path] [--path <root>] [--profile <profile>] [--resolve-path <path>] [--task <task>] [--budget <tokens>] [--json]`

Run MCP smoke tests.

Checks the read-only MCP path-resolution and context-pack tools against the atlas.

Arguments:
- `path`

Options:
- `--path <root>` (value required) - Atlas root path; use instead of positional root.
- `--profile <profile>` (value required) - Atlas profile: public, private, or company.
- `--json` - Print machine-readable JSON output.
- `--resolve-path <path>` (value required) - Path to resolve through MCP.
- `--task <task>` (value required) - Task text for context-pack smoke test.
- `--budget <tokens>` (value required) - Context-pack budget.

### `atlas ui [path] [--host <host>] [--port <port>] [--path <root>] [--profile <profile>]`

Start the local Atlas review UI.

Serves the read-only local UI for graph browsing, diagnostics, path resolution, and context-pack previews.

Arguments:
- `path`

Options:
- `--path <root>` (value required) - Atlas root path.
- `--profile <profile>` (value required) - Atlas profile.
- `--host <host>` (value required) - Server host.
- `--port <port>` (value required) - Server port.

## Maintenance Commands

### `atlas diff [path] [--path <root>] [--profile <profile>] [--json]`

Report stale Atlas metadata and generated artifacts.

Compares source files, atlas metadata, generated docs, README, and generated CLI reference for drift.

Arguments:
- `path`

Options:
- `--path <root>` (value required) - Atlas root path; use instead of positional root.
- `--profile <profile>` (value required) - Atlas profile: public, private, or company.
- `--json` - Print machine-readable JSON output.

### `atlas discover-gaps [path] [--receipts <path>] [--budget <tokens>] [--output <path>] [--no-static] [--path <root>] [--profile <profile>] [--json]`

Discover Atlas coverage gaps.

Reports missing cards, misleading cards, broad-search fallback evidence, stale references, and under-modeled CLI capabilities.

Arguments:
- `path`

Options:
- `--path <root>` (value required) - Atlas root path; use instead of positional root.
- `--profile <profile>` (value required) - Atlas profile: public, private, or company.
- `--json` - Print machine-readable JSON output.
- `--receipts <path>` (value required) - Usage receipt directory.
- `--budget <tokens>` (value required) - Context budget for gap reporting.
- `--output <path>` (value required) - Write report JSON.
- `--no-static` - Disable static gap checks.

### `atlas maintain agent-instructions [path] [--path <root>] [--policy <path>] [--profile <profile>] [--json]`

Print maintenance instructions.

Prints the effective maintenance policy as agent-facing instructions.

Arguments:
- `path`

Options:
- `--path <root>` (value required) - Atlas root path; use instead of positional root.
- `--profile <profile>` (value required) - Atlas profile: public, private, or company.
- `--json` - Print machine-readable JSON output.
- `--policy <path>` (value required) - Maintenance policy path.

### `atlas maintain check [path] [--path <root>] [--policy <path>] [--profile <profile>] [--json]`

Check Atlas maintenance state.

Runs validation, optional boundary checks, metadata drift checks, generated docs checks, README checks, and generated CLI reference checks.

Arguments:
- `path`

Options:
- `--path <root>` (value required) - Atlas root path; use instead of positional root.
- `--profile <profile>` (value required) - Atlas profile: public, private, or company.
- `--json` - Print machine-readable JSON output.
- `--policy <path>` (value required) - Maintenance policy path.

### `atlas maintain fix [path] [--path <root>] [--policy <path>] [--profile <profile>] [--json]`

Refresh maintained Atlas surfaces.

Applies allowed metadata fixes and regenerates configured docs, README, and CLI reference artifacts.

Arguments:
- `path`

Options:
- `--path <root>` (value required) - Atlas root path; use instead of positional root.
- `--profile <profile>` (value required) - Atlas profile: public, private, or company.
- `--json` - Print machine-readable JSON output.
- `--policy <path>` (value required) - Maintenance policy path.

### `atlas migrate [path] --to <version> [--write] [--json]`

Run Atlas metadata migrations.

Reports or writes metadata migrations for a repository atlas.

Arguments:
- `path`

Options:
- `--to <version>` (value required) - Target migration version.
- `--write` - Write migration changes.
- `--json` - Print machine-readable JSON output.

### `atlas proposal apply <proposal> --select <entity-id> [--json]`

Apply selected Atlas proposal entities.

Writes selected proposed card metadata into the atlas.

Arguments:
- `proposal` (required)

Options:
- `--select <entity-id>` (value required) - Entity ID to apply; repeatable.
- `--json` - Print machine-readable JSON output.

### `atlas proposal validate <proposal> [path] [--path <root>] [--json]`

Validate an Atlas card proposal.

Checks a proposal file before applying generated card metadata.

Arguments:
- `proposal` (required)
- `path`

Options:
- `--path <root>` (value required) - Atlas root path.
- `--json` - Print machine-readable JSON output.

### `atlas propose-cards --report <file> [--output <dir>] [--llm] [--llm-provider <provider>] [--json]`

Generate card proposals from a gap report.

Creates deterministic Atlas card proposals from a discovery report.

Options:
- `--report <file>` (value required) - Gap report JSON path.
- `--output <dir>` (value required) - Proposal output directory.
- `--llm` - Enable bounded enrichment.
- `--llm-provider <provider>` (value required) - LLM provider name.
- `--json` - Print machine-readable JSON output.

### `atlas suggest-card --path <file> [--json]`

Suggest an atlas card for a file.

Drafts a small component or test-scope card for a source file.

Options:
- `--path <file>` (value required) - File path to cover.
- `--json` - Print machine-readable JSON output.
