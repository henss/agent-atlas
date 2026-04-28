---
name: implement-cli-command
description: Use when implementing or changing Agent Atlas CLI commands.
---

# Implement CLI Command Skill

CLI output should be concise Markdown by default and JSON only with `--json`.

## Steps

1. Read `packages/cli/README.md`.
2. Read the relevant spec doc under `docs/spec`.
3. Add command behavior in `packages/cli/src`.
4. Keep core logic in `packages/core`, not the CLI.
5. Add examples to CLI README.
6. Add tests or golden output fixtures when the test harness exists.

## Output style

Good default output:

```md
# Atlas validation

Status: passed

Entities: 24
Relations: 81
Warnings: 2
```

Avoid noisy logs unless `--verbose` is set.
