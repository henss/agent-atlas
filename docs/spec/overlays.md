# Overlay Specification

Overlays let the same atlas support public, private, local, and company profiles.

## Why overlays exist

A public repo may safely say:

```yaml
id: document:release-process
visibility: private
summary: Internal release process documentation.
```

A private overlay can add:

```yaml
id: document:release-process
uri: confluence://SPACE/release-process
access:
  method: mcp
  server: atlassian
```

## Profiles

Suggested profiles:

- `public`: safe for open-source contributors.
- `private`: local owner context.
- `company`: internal company context.
- `generated`: machine-generated enrichments.

## Directory convention

```text
.agent-atlas/
  public/
  overlays/
    private.local/     # gitignored
    company/           # internal-only
    generated/         # reproducible if possible
```

## Merge rules

1. Entity identity is determined by `id`.
2. Base entities live outside `.agent-atlas/overlays/**` and must include normal required entity fields.
3. Overlay files live under `.agent-atlas/overlays/<profile>/` and may be partial. They must include `id`; `kind` is optional.
4. Supported overlay profiles are `private`, `private.local`, `company`, and `generated`.
5. The `public` profile uses base entities only. The `private` profile applies private overlays. The `company` profile applies company overlays. Generated overlays apply to non-public profiles.
6. Overlays may replace selected scalar fields: `title`, `summary`, `status`, `visibility`, and `uri`.
7. Overlays merge string arrays such as aliases, tags, owners, code paths, entrypoints, and agent hints.
8. Overlays shallow-merge `access` and `metadata`.
9. Overlays append relations and commands, deduplicating by stable keys.
10. Overlays must not change `kind`.

## Conflict diagnostics

The validator should detect:

- conflicting `kind` for same ID
- duplicate relation entries
- public files containing private-only URI schemes
- unknown overlay profile
- missing base entity for overlay entity

## Example

Base:

```yaml
id: resource:primary-calendar
kind: resource
title: Primary Calendar
summary: Calendar used by planning workflows.
visibility: private
access:
  private_overlay_required: true
```

Private overlay:

```yaml
id: resource:primary-calendar
uri: gcal://calendar/primary
access:
  method: mcp
  server: google-workspace
  permission: read-write
```

## Generated output safety

Public generated Markdown redacts private URI schemes if a public-visible entity accidentally contains one. The validator still warns so the source can be moved into an overlay.
