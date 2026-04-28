# Progressive Disclosure

Agents should not read everything upfront. That is expensive, slow, and usually unnecessary.

Agent Atlas uses progressive disclosure:

```text
Root index
  -> entity summary
    -> related entity summaries
      -> source files and external resources only when needed
```

## Always-loaded context

Keep this tiny:

- `AGENTS.md`
- `docs/agents/atlas.md` root view
- package-level `AGENTS.md` files if present

## On-demand context

Load when relevant:

- domain cards
- workflow cards
- component cards
- verification cards
- source files
- external documents
- live resources through MCP

## Context packs

A context pack is a generated, token-budgeted bundle for a task.

It should contain:

- likely relevant entities
- recommended source files
- recommended docs/resources
- live data access instructions
- verification commands
- warnings and constraints

It should not contain:

- full source files
- full external docs
- secrets
- stale live data
