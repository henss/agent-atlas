# Boundary Checks Guide

Use boundary checks before publishing atlas metadata, generated agent docs, or rollout examples.

## Public Repos

```sh
node ../agent-atlas/packages/cli/dist/index.js boundary-check --path . --profile public
```

Run this with the repo's existing public-boundary checks. Atlas checks only `.agent-atlas` metadata and `docs/agents/*`.

## Private Repos

```sh
node ../agent-atlas/packages/cli/dist/index.js boundary-check --path . --profile private
```

Private profile checks focus on credentials, copied key material, and live customer-shaped data. Private metadata can contain internal topology, but should still avoid secrets and copied source-of-truth content.

## Company Repos

```sh
node ../agent-atlas/packages/cli/dist/index.js boundary-check --path . --profile company --policy agent-atlas.boundary.yaml
```

Use repo-local policy markers when a control plane knows company-specific private markers that should not live in the public Agent Atlas project.

## Policy Starter

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

Keep policy files in the downstream repo or control plane that owns the private marker set.

## Fix Flow

1. Run `boundary-check`.
2. Fix canonical atlas metadata.
3. Regenerate `docs/agents/*`.
4. Run `boundary-check` again.

Generated docs should not be edited by hand.
