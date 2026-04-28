# @agent-atlas/cli

CLI skeleton for Agent Atlas.

Planned commands:

```sh
atlas init
atlas validate [path]
atlas list [kind]
atlas show <entity-id>
atlas neighbors <entity-id> --depth 2
atlas resolve-path <path>
atlas context-pack "<task>" --budget 4000
atlas generate markdown
```

Output should be concise Markdown by default. Add `--json` for machine-readable output.

## `atlas validate [path]`

Loads `.agent-atlas/**/*.yaml` files under `path` or the current working directory, then checks entity shape, ID grammar, kind consistency, relation types, relation targets, duplicate IDs, and basic public-profile safety.

```sh
atlas validate examples/personal-ops-sanitized
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
