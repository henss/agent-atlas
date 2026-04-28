# Boundary Safety

Boundary checks help keep public, private, and company atlas rollouts auditable.

`atlas boundary-check` is local-only. It reads atlas files, optional generated docs, and an optional repo-local policy file. It does not send telemetry or inspect external systems.

## Command

```sh
atlas boundary-check --path . --profile public
atlas boundary-check --path . --profile company --policy agent-atlas.boundary.yaml
```

By default the command checks:

- `.agent-atlas/public/**/*.yaml`
- selected profile overlays
- generated `docs/agents/**/*.md`

Use `--no-generated` to temporarily skip generated docs while diagnosing canonical atlas files.

## Public Profile Rules

Public profile files must not include:

- private URI schemes such as `notion:`, `confluence:`, `jira:`, `gdrive:`, `gcal:`, `slack:`, or `mailto:`
- issue-key-shaped identifiers such as `TEAM-123`
- internal URLs or hosts such as `localhost`, private IP ranges, `.internal`, `.local`, or `.corp`
- local user paths such as `C:\Users\...`, `/Users/...`, `/home/...`, or `file://...`
- private path markers such as `private`, `private.local`, `internal`, or `restricted` path segments
- configured public markers from a repo-local boundary policy

## Private and Company Rules

Private and company profile files must not include:

- secret-shaped assignments such as `api_key: ...`, `token=...`, `password: ...`, or `client_secret: ...`
- copied private-key material
- email-shaped live customer data
- configured secret, customer, or company markers

Secret names should be represented with `secret-scope` entities. Secret values should never appear in atlas files.

## Repo-Local Policy

Boundary policy files may live at `agent-atlas.boundary.yaml` or `.agent-atlas/boundary-policy.yaml`.

```yaml
version: 1
public_markers:
  - ACME-INTERNAL
secret_markers:
  - production-token
customer_markers:
  - live-customer
company_markers:
  - company-only
allow_patterns:
  - sanitized-example
```

Policy marker matching is case-insensitive substring matching. `allow_patterns` removes known-safe literals before checks run.

## Generated Docs

Generated `docs/agents/*` output is checked with the same profile rules because generated files are often the first thing agents read.

Fix generated-doc boundary findings in the source atlas metadata, then regenerate Markdown. Do not manually patch generated files.

## Public Pilot Guidance

Public pilot repos should run their normal public-boundary checks and `atlas boundary-check --profile public`. Atlas only checks atlas metadata and generated agent docs; it does not replace repo-specific checks for source code, fixtures, screenshots, or broader docs.
