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

## Merge rules draft

1. Entity identity is determined by `id`.
2. Overlays may add optional fields.
3. Overlays may append relations.
4. Overlays may replace selected scalar fields only when explicitly allowed.
5. Overlays must not change `kind` unless a migration explicitly allows it.
6. Public profile must not include fields marked private.
7. Generated overlays must record provenance.

## Conflict diagnostics

The validator should detect:

- conflicting `kind` for same ID
- duplicate relation entries
- public files containing private-only URI schemes
- unknown overlay profile
- missing base entity for overlay entity, unless explicitly allowed

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
