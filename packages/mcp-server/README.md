# @agent-atlas/mcp-server

Read-only MCP server skeleton for exposing atlas context to agents.

Initial target resources:

- `atlas://root`
- `atlas://entity/{id}`
- `atlas://path/{path}`
- `atlas://context-pack?task=...&budget=...`

Initial target tools:

- `list_entities`
- `describe_entity`
- `resolve_path`
- `find_related`
- `context_pack`

Do not add write tools until the security model is documented and tested. Humanity has enough footguns.
