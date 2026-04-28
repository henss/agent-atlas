# @agent-atlas/mcp-server

Read-only MCP server for exposing atlas context to agents.

Resources:

- `atlas://root`
- `atlas://entity/{id}`
- `atlas://path/{path}`
- `atlas://context-pack?task=...&budget=...`

Tools:

- `list_entities`
- `describe_entity`
- `resolve_path`
- `find_related`
- `context_pack`

Do not add write tools until the security model is documented and tested. Humanity has enough footguns.

## Stdio

```sh
atlas-mcp --path . --profile public
```

Profiles match the CLI: `public`, `private`, and `company`.

The stdio entrypoint accepts one positional root path or `--path <root>`. Passing both is an error so agent host configs do not accidentally point at the wrong atlas.
