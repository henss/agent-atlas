# Contributing

Agent Atlas is meant to be a generic, domain-neutral framework for agent-facing context graphs.

## Contribution priorities

Good contributions:

- Improve schema clarity.
- Add validation behavior.
- Add small, reusable traversal primitives.
- Improve examples across diverse domains.
- Add tests for overlays, relation traversal, and context-pack generation.
- Improve LLM-facing docs without making them bloated.

Less useful contributions:

- Vendor-specific behavior baked into the core.
- Large generated summaries with no provenance.
- Private/company-specific concepts without a generic abstraction.
- New fields that only solve one repo's local problem.

## Public/private safety

Never contribute real secrets, private page IDs, internal URLs, customer names, confidential architecture, or personal operational data.

Examples should be sanitized and fictionalized.

## Development workflow

1. Read `AGENTS.md`.
2. Check `ROADMAP.md` for priorities.
3. Update spec docs and examples alongside code changes.
4. Keep output formats friendly to both humans and LLM agents.
