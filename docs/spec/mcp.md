# MCP Specification Draft

Agent Atlas should eventually expose a read-only MCP server so coding agents can traverse atlas context without shelling out to the CLI.

## Resources

Suggested resources:

```text
atlas://root
atlas://entity/{entity-id}
atlas://domain/{slug}
atlas://workflow/{slug}
atlas://component/{slug}
atlas://path/{repo-relative-path}
atlas://context-pack?task=...&budget=...
```

## Tools

Suggested tools:

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

## Initial safety stance

The first MCP server should be read-only.

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
