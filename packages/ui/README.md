# @agent-atlas/ui

Local read-only review UI for Agent Atlas.

Launch it through the CLI:

```sh
atlas ui --path . --profile public
```

The UI serves a loopback-only web app by default and exposes read-only JSON
endpoints for graph browsing, entity details, focused neighborhoods, path
resolution, and context-pack previews.

Entity pages use hash routes such as `#/overview`,
`#/entity/component:core-package`, `#/resolve`, and `#/pack`, so links can be
shared without requiring server-side routing. Local text files referenced by
document URIs or code entrypoints can be previewed through the read-only
`/api/preview?path=...` endpoint when the path stays inside the atlas root.
Markdown previews are rendered with the open-source `react-markdown` and
`remark-gfm` packages; other supported text files use a plain read-only text
view.

The UI does not edit atlas YAML files, apply proposals, or regenerate Markdown.
