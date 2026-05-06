# MCP Specification

Agent Atlas exposes a read-only MCP server so coding agents can traverse atlas context without shelling out to the CLI.

## Resources

Implemented resources:

```text
atlas://root
atlas://entity/{entity-id}
atlas://path/{repo-relative-path}
atlas://context-pack?task=...&budget=...
```

Resource templates are read-only convenience surfaces for MCP hosts that prefer
URI reads. Most LLM agents should use the tools first because tool schemas expose
the expected inputs more clearly.

## Tools

Implemented tools:

### `list_entities`

Inputs:

- `kind?`: one of the Atlas entity kinds from `docs/spec/entities.md`
- `query?`
- `profile?`
- `budget?`
- `mode?`: `compact`, `standard`, or `full`
- `limit?`

Returns compact entity summaries.

### `atlas_overview`

Inputs:

- `profile?`
- `budget?`
- `mode?`: `compact`, `standard`, or `full`
- `limit?`
- `includeOtherEntities?`

Returns an overview-first map of domains, workflows, implementation surfaces,
documents, tests, and MCP tool drill-down guidance. `atlas://root` returns this
same orientation view.

### `describe_entity`

Inputs:

- `id`
- `depth?`
- `profile?`
- `budget?`
- `mode?`: `compact`, `standard`, or `full`
- `limit?`

Returns entity card plus selected neighbors.

### `resolve_path`

Inputs:

- `path`
- `profile?`
- `depth?`
- `budget?`
- `mode?`: `compact`, `standard`, or `full`
- `limit?`
- `includeBroadMatches?`
- `includeLowConfidence?`
- `minConfidence?`

Returns owning component(s), workflows, domains, docs, resources, and verification scopes.
Repo-relative paths are preferred. Absolute paths are accepted only when they are
inside the configured atlas root; outside-root paths return a scoped-server error
so agents do not mistake a wrong server for missing Atlas coverage.
By default the response is compact: direct owners and strong nearby context are
shown first, while weak or broad graph matches are counted as omitted context.
Use `mode: "full"` or the inclusion flags when auditing coverage.

### `find_related`

Inputs:

- `id`
- `relation?`: one of the relation types from `docs/spec/relations.md`
- `depth?`
- `profile?`
- `budget?`
- `mode?`: `compact`, `standard`, or `full`
- `limit?`

Returns graph neighborhood.

### `context_pack`

Inputs:

- `task`
- `budget?`
- `profile?`

Returns task-specific context pack.

MCP tools default to `mode: "compact"` so responses route agents to the next
useful entity, path, read, or verification target without dumping the whole
graph. Use `mode: "standard"` for broader orientation and `mode: "full"` for
audits or debugging. `limit` caps displayed rows. The `budget` field remains an
approximate final safety fuse and should not be the primary relevance control.

## Smoke test

Use the CLI smoke test when wiring an agent host or downstream repo:

```sh
node ../agent-atlas/packages/cli/dist/index.js mcp smoke-test --path . --profile public --resolve-path packages/core/src/example.ts
```

The smoke test starts an in-memory MCP server, calls `resolve_path`, calls `context_pack`, closes the client/server pair, and checks that files under the atlas root were not modified.

## Initial safety stance

The MCP server is read-only. It loads atlas YAML, applies selected profile overlays, traverses the graph, resolves paths, and generates context packs. It does not write atlas files, generated Markdown, source files, or external systems. MCP tests include a read-only smoke assertion that detects file changes under the atlas root.

Future write-capable tools must be explicitly designed, documented, and gated. The atlas may eventually update generated files or local metadata, but it should not write to external systems by default.

## Output style

MCP output should be concise, structured, and friendly to model context.

Prefer:

- entity IDs
- short summaries
- typed relations
- recommended reads
- verification commands

Avoid:

- long unstructured blobs
- full external docs
- secret or private values in public profile

## Running over stdio

```sh
atlas-mcp --path . --profile public
```

Use `--profile private` or `--profile company` only when the MCP client and model are allowed to see the matching overlay data.

## Host config snippets

Generic stdio shape:

```json
{
  "mcpServers": {
    "agent-atlas": {
      "command": "node",
      "args": [
        "../agent-atlas/packages/mcp-server/dist/stdio.js",
        "--path",
        ".",
        "--profile",
        "public"
      ]
    }
  }
}
```

Private-profile repo:

```json
{
  "mcpServers": {
    "agent-atlas-private": {
      "command": "node",
      "args": [
        "../agent-atlas/packages/mcp-server/dist/stdio.js",
        "--path",
        ".",
        "--profile",
        "private"
      ]
    }
  }
}
```

Company control-plane registry:

```json
{
  "mcpServers": {
    "agent-atlas-company": {
      "command": "node",
      "args": [
        "../agent-atlas/packages/mcp-server/dist/stdio.js",
        "--path",
        ".",
        "--profile",
        "company"
      ]
    }
  }
}
```

Keep private and company MCP configs in downstream or control-plane repos, not in public product repos. Public examples should show shape and profile boundaries without exposing private topology.

## Errors

MCP resource and tool responses use concise Markdown errors for common bad inputs such as missing entities, empty paths, and empty task strings. Invalid profiles fail fast with a clear expected-value message.
