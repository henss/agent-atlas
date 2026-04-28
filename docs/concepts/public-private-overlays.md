# Public and Private Overlays

Many repositories need public metadata and private metadata at the same time.

Example:

```text
Public contributor:
  knows a workflow depends on a private planning document

Repo owner / company agent:
  can resolve that document through Notion, Confluence, or another MCP server
```

## Base atlas

Public-safe metadata:

```yaml
id: document:release-process
kind: document
title: Release Process
visibility: private
summary: Internal document describing the release checklist and approval process.
access:
  private_overlay_required: true
```

## Private overlay

Gitignored or stored in a private repo:

```yaml
id: document:release-process
uri: notion://page/release-process
access:
  method: mcp
  server: notion
  permission: read
```

## Merge intent

Overlays should enrich or override selected fields without changing the identity of the entity.

The implementation should support profiles such as:

```sh
atlas validate --profile public
atlas validate --profile private
atlas generate markdown --profile public
atlas context-pack "change release flow" --profile company
```

Public profile commands load base atlas files only. Private and company profile commands load the same base files, then merge matching overlays before graph normalization, path resolution, Markdown generation, or context-pack selection.

## Security rule

If a value would be harmful or awkward in a public GitHub issue, it probably belongs in an overlay. A shocking concept, keeping private things private.
