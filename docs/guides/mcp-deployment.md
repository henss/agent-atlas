# MCP Deployment

Use the read-only MCP server when an agent host can call MCP tools directly instead of shelling out to the CLI.

## Smoke test first

From a downstream repo:

```sh
node ../agent-atlas/packages/cli/dist/index.js mcp smoke-test --path . --profile public --resolve-path packages/core/src/example.ts
```

The smoke test starts the server, calls `resolve_path`, calls `context_pack`, closes cleanly, and verifies that no files under the atlas root changed.

## Public repo config

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

## Private repo config

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

## Company control-plane config

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

Keep private topology and company registry paths in downstream-owned config. Public product repos should document only the public profile shape unless the repo intentionally publishes more.
