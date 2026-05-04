# Package Publish Readiness

Agent Atlas is still consumed from sibling checkouts by default. Public repos can become self-contained once the CLI has a deliberately scoped preview npm release.

Use this checklist before publishing any Agent Atlas npm artifact. Prefer the reproducible release script over hand-running the individual commands:

```sh
pnpm release:package -- --package packages/cli --version 0.18.0 --tag preview
pnpm release:package -- --package packages/cli --version 0.18.0 --tag preview --publish
```

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
  - OPS-2298 chooses the bundled CLI approach for the first preview.
  - `@agent-atlas/core`, `@agent-atlas/schema`, `@agent-atlas/markdown`, and `@agent-atlas/mcp-server` are bundled into `@agent-atlas/cli` and are not stable public APIs.
  - Third-party runtime dependencies remain external and must be declared directly by `@agent-atlas/cli`.
- `npm pack --dry-run` or `pnpm pack --dry-run` output is reviewed.
- Published files include only required runtime code, README, license, and package metadata.
- Published files exclude:
  - `.agent-atlas/**`
  - `.runtime/**`
  - `examples/**` unless explicitly reviewed as public-safe
  - local generated docs not needed by CLI runtime
  - test fixtures that are not needed by consumers
- `package.json` in the packed CLI must not contain `workspace:*` dependencies.
- The packed preview CLI tarball should contain `dist/index.js`, `README.md`, `LICENSE`, and `package.json` only unless a new runtime need is explicit.

## Local Tarball Verification

Before publishing, prove the packed CLI works outside the workspace:

```sh
cd packages/cli
npm pack
mkdir %TEMP%\agent-atlas-pack-smoke
cd %TEMP%\agent-atlas-pack-smoke
npm init -y
npm install D:\workspace\agent-atlas\packages\cli\agent-atlas-cli-0.18.0.tgz
npx atlas --help
mkdir .agent-atlas\public\repositories
```

Create `.agent-atlas/public/repositories/example.yaml`:

```yaml
id: repository:example
kind: repository
title: Example
summary: Minimal public package smoke test repository.
status: active
visibility: public
uri: repo://example
relations: []
```

Then run:

```sh
npx atlas validate . --profile public
npx atlas generate markdown . --output docs/agents --profile public
npx atlas generate markdown . --output docs/agents --profile public --check
```

Delete the generated tarball after the smoke test unless it is the artifact being reviewed for release.

## Public Repo Script Template

After publish, public repos should pin the preview version instead of using `latest`:

```json
{
  "scripts": {
    "atlas:doctor": "pnpm dlx @agent-atlas/cli@0.x doctor --path .",
    "atlas:validate": "pnpm dlx @agent-atlas/cli@0.x validate . --profile public",
    "atlas:boundary-check": "pnpm dlx @agent-atlas/cli@0.x boundary-check . --profile public",
    "atlas:docs:check": "pnpm dlx @agent-atlas/cli@0.x generate markdown . --output docs/agents --profile public --check",
    "atlas:maintain": "pnpm dlx @agent-atlas/cli@0.x maintain check . --profile public",
    "atlas:discover-gaps": "pnpm dlx @agent-atlas/cli@0.x discover-gaps . --profile public",
    "atlas:propose-cards": "pnpm dlx @agent-atlas/cli@0.x propose-cards"
  }
}
```

Use a concrete version before committing scripts, for example `@agent-atlas/cli@0.18.0`.

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
