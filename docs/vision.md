# Vision

Agent Atlas is a generic, typed navigation layer for AI coding agents operating in complex repositories and organizations.

Modern repositories rarely contain only code. They contain scripts, CLIs, APIs, MCP servers, generated artifacts, docs, tests, workflows, infrastructure, data sources, external pages, and cross-repo dependencies. Agents often discover this context by searching blindly, reading large files, and making expensive guesses. That works about as well as finding a violin in a warehouse by yelling at the shelving.

Agent Atlas gives agents a compact map:

- broad domains
- workflows and processes
- code components
- tools and interfaces
- external resources
- documents
- tests and verification scopes
- typed relationships between all of them

The M0-M16 implementation now includes the core schema, validation, graph traversal, path resolution, generated Markdown, context packs, overlays, hardened read-only MCP resources and tools, MCP smoke tests, adapter interfaces, hardened cross-repo registries, registry manifests, global generated Markdown, migrations, diagnostics, benchmarks, consumer-friendly CLI path handling, version discipline, setup doctor checks, downstream script templates, local usage receipts, context-pack evaluation, profile boundary checks, and incremental authoring tools.

The atlas should support both traversal directions:

```text
Top-down:
  domain -> workflow -> component -> code/docs/resources/tests

Bottom-up:
  file/symbol -> component -> workflow/domain -> broader context
```

## Non-goals

Agent Atlas is not intended to:

- store live operational data
- replace source code search
- replace developer portals
- replace knowledge bases
- replace data catalogs
- own secrets
- automatically summarize everything forever

It should instead integrate with those systems and tell agents when to use them.

## Design target

A coding agent should be able to start with one of these:

- a task description
- a source file path
- an entity ID
- a domain name
- a workflow name
- a repository name in a cross-repo registry

And receive a compact answer:

- what this thing is
- what owns or contains it
- what it uses
- what it affects
- what docs/resources matter
- which files to inspect
- which tests to run
- what not to load unless necessary

## Public repo philosophy

The open-source project defines the standards and tooling. Real personal/company atlas contents stay private unless intentionally published.

The original roadmap and hardening extension are implemented.
