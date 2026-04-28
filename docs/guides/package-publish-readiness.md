# Package Publish Readiness

Agent Atlas is still consumed from sibling checkouts by default. Public repos can become self-contained once the CLI has a deliberately scoped preview npm release.

Use this checklist before publishing any Agent Atlas npm artifact.

## Intended First Artifact

- Package: `@agent-atlas/cli`
- Release line: `0.x` preview
- Supported public-repo use:
  - `pnpm dlx @agent-atlas/cli@<pinned-version> validate . --profile public`
  - `pnpm dlx @agent-atlas/cli@<pinned-version> boundary-check . --profile public`
  - `pnpm dlx @agent-atlas/cli@<pinned-version> generate markdown . --output docs/agents --profile public --check`
  - `pnpm dlx @agent-atlas/cli@<pinned-version> doctor --path .`
- Not part of the first publish:
  - Stable public APIs for `@agent-atlas/core`
  - Stable public APIs for `@agent-atlas/schema`
  - Stable public APIs for `@agent-atlas/mcp-server`
  - Hosted services, telemetry, or remote registries

## Hard Gates

- `pnpm build` passes from the repository root.
- `pnpm test` passes from the repository root.
- `pnpm lint` passes from the repository root.
- `node packages/cli/dist/index.js doctor --path .` passes after a fresh build.
- `node packages/cli/dist/index.js validate . --profile public` passes.
- `node packages/cli/dist/index.js boundary-check . --profile public` passes.
- `node packages/cli/dist/index.js generate markdown . --output docs/agents --profile public --check` passes.
- `node packages/cli/dist/index.js mcp smoke-test --path . --profile public --resolve-path packages/cli/src/index.ts` passes, even though MCP is not part of the first stable API promise.
- No package includes private, company, customer, credential, or local-machine data in published files.

## Package Shape Gates

- `packages/cli/package.json` has a working `bin.atlas` entry.
- The package version matches the intended preview release version.
- Workspace dependency packaging is deliberate:
  - either dependent workspace packages are also publish-ready, or
  - the CLI package is bundled so `pnpm dlx @agent-atlas/cli@<version>` works from a clean public repo.
- `npm pack --dry-run` or `pnpm pack --dry-run` output is reviewed.
- Published files include only required runtime code, README, license, and package metadata.
- Published files exclude:
  - `.agent-atlas/**`
  - `.runtime/**`
  - `examples/**` unless explicitly reviewed as public-safe
  - local generated docs not needed by CLI runtime
  - test fixtures that are not needed by consumers

## Public Repo Script Template

After publish, public repos should pin the preview version instead of using `latest`:

```json
{
  "scripts": {
    "atlas:doctor": "pnpm dlx @agent-atlas/cli@0.x doctor --path .",
    "atlas:validate": "pnpm dlx @agent-atlas/cli@0.x validate . --profile public",
    "atlas:boundary-check": "pnpm dlx @agent-atlas/cli@0.x boundary-check . --profile public",
    "atlas:docs:check": "pnpm dlx @agent-atlas/cli@0.x generate markdown . --output docs/agents --profile public --check"
  }
}
```

Use a concrete version before committing scripts, for example `@agent-atlas/cli@0.16.0`.

## Hook Guidance

Start with package scripts and CI before adding git hooks.

If a repo adds a hook, it should only run Atlas checks when relevant files changed:

- `.agent-atlas/**`
- `docs/agents/**`
- `agent-atlas.boundary.yaml`
- `agent-atlas.registry.yaml`

Recommended hook checks:

```sh
pnpm atlas:validate
pnpm atlas:docs:check
```

For public repos, include:

```sh
pnpm atlas:boundary-check
```

Do not run context packs, global registry packs, MCP servers, or usage evaluation in lightweight hooks.

## Release Notes Requirements

Every preview release should state:

- the CLI version
- compatible entity schema version
- compatible usage receipt version
- compatible registry config version
- whether generated Markdown output changed
- whether CLI command arguments changed
- whether public boundary checks changed

## Rollback Requirements

- Keep sibling-checkout consumption documented and working.
- Downstream public repos should be able to pin or roll back the CLI version without changing atlas metadata.
- If the published CLI breaks public repo validation, create a Linear issue and revert downstream script adoption before changing public atlas metadata.

