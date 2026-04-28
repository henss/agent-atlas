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

## Tools

Implemented tools:

### `list_entities`

Inputs:

- `kind?`
- `query?`
- `profile?`

Returns compact entity summaries.

### `describe_entity`

Inputs:

- `id`
- `depth?`
- `profile?`
- `budget?`

Returns entity card plus selected neighbors.

### `resolve_path`

Inputs:

- `path`
- `profile?`

Returns owning component(s), workflows, domains, docs, resources, and verification scopes.

### `find_related`

Inputs:

- `id`
- `relation?`
- `depth?`
- `profile?`

Returns graph neighborhood.

### `context_pack`

Inputs:

- `task`
- `budget?`
- `profile?`

Returns task-specific context pack.

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
