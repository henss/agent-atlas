# Agent Atlas CLI 0.18.0 Preview Release

Release artifact: `@agent-atlas/cli@0.18.0`

Dist tag: `preview`

## Compatibility

- Entity schema version: 1
- Registry config version: 1
- Usage receipt version: 1
- Generated Markdown: unchanged from the 0.17 release line
- CLI arguments: existing atlas-loading commands retain the positional root path or `--path <root>` shape
- Boundary checks: public, private, and company profiles use the 0.18.0 boundary-check rules

## New Preview Surface

- `atlas evaluate --evaluation-version <id>`
- `atlas evaluate --out <file>`

Evaluation output now includes run metadata for cut-over tracking:

- `evaluationVersion`
- `generatedAt`
- `atlasPackageVersion`
- `receiptVersion`
- `rootPath`
- `receiptsPath`
- `profile`

The evaluation version is a caller-owned run or cut-over key. It is not a receipt schema migration.

## Public API Boundary

- Supported preview artifact: `@agent-atlas/cli`
- Internal packages bundled into the CLI are not stable public APIs:
  - `@agent-atlas/core`
  - `@agent-atlas/schema`
  - `@agent-atlas/markdown`
  - `@agent-atlas/mcp-server`

## Publish Notes

- Publish with the `preview` dist-tag.
- Public repos should pin the exact version: `pnpm dlx @agent-atlas/cli@0.18.0 ...`.
- Public repos can use `templates/scripts/public-repo-npm.sh` as the self-contained validation template.
