# @agent-atlas/ui

Local read-only review UI for Agent Atlas.

Launch it through the CLI:

```sh
atlas ui --path . --profile public
```

The UI serves a loopback-only web app by default and exposes read-only JSON
endpoints for graph browsing, entity details, focused neighborhoods, path
resolution, and context-pack previews.

The UI does not edit atlas YAML files, apply proposals, or regenerate Markdown.
