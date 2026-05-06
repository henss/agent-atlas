# @agent-atlas/mcp-server

Read-only MCP server for exposing atlas context to agents.

Resources:

- `atlas://root`
- `atlas://entity/{id}`
- `atlas://path/{path}`
- `atlas://context-pack?task=...&budget=...`

Tools:

- `atlas_overview`
- `list_entities`
- `describe_entity`
- `resolve_path`
- `find_related`
- `context_pack`

Most MCP agents should start with tools rather than resource templates:

- Use `atlas_overview` for initial orientation.
- Use `resolve_path` when starting from a file path.
- Use `context_pack` for broad or multi-seam tasks.

The resource templates expose the same read-only context for hosts that prefer
URI reads, but they are secondary to the tools for normal agent workflows.

Do not add write tools until the security model is documented and tested. Humanity has enough footguns.

## Stdio

```sh
atlas-mcp --path . --profile public
```

Profiles match the CLI: `public`, `private`, and `company`.

The stdio entrypoint accepts one positional root path or `--path <root>`. Passing both is an error so agent host configs do not accidentally point at the wrong atlas.

## Smoke test

```sh
node ../agent-atlas/packages/cli/dist/index.js mcp smoke-test --path . --profile public --resolve-path packages/core/src/example.ts
```

The smoke test starts the MCP server in memory, calls `resolve_path`, calls `context_pack`, exits cleanly, and asserts that no files under the atlas root changed.

## Host config shape

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

Use `private` or `company` only in downstream-owned configs where the agent host and model are allowed to see that context.
