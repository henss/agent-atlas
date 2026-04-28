# Authoring Atlas Files

This guide explains how to write atlas entity cards.

## Start with domains and workflows

For a new repo, begin with broad concepts:

```text
domains -> workflows -> components/resources/docs/tests
```

Do not start by documenting every file. That way lies sadness and abandoned docs.

## Good summaries

A good summary helps an agent decide whether to load more.

Bad:

```yaml
summary: Calendar stuff.
```

Good:

```yaml
summary: >
  Reads calendar events, derives scheduling constraints, and writes planned
  time blocks for planning workflows.
```

## Use stable IDs

Prefer:

```text
component:google-calendar-adapter
workflow:plan-week
```

Avoid:

```text
component:newThing2
workflow:johnsWorkflow
```

## Link outward instead of copying

For documents and resources, link to authoritative systems or aliases:

```yaml
id: document:release-process
kind: document
title: Release Process
summary: Internal document describing release sequencing and approvals.
access:
  private_overlay_required: true
```

Then put actual private URIs in private overlays.

## Model verification

Add `test-scope` entities for targeted checks:

```yaml
id: test-scope:calendar-tests
kind: test-scope
title: Calendar Tests
summary: Tests for calendar adapters and planning integration.
commands:
  - pnpm --filter @example/calendar test
```

Then link components and workflows:

```yaml
relations:
  - type: tested-by
    target: test-scope:calendar-tests
```

## Model code ownership

Use `code.paths` on components to support bottom-up path resolution:

```yaml
id: component:weekly-planner
kind: component
title: Weekly Planner
summary: Combines calendar constraints and task signals into a weekly plan.
code:
  paths:
    - packages/planning/**
  entrypoints:
    - packages/planning/src/weeklyPlanner.ts
```

More specific overlapping paths are allowed when a file belongs to a narrower helper component:

```yaml
id: component:planning-output-helpers
kind: component
title: Planning Output Helpers
summary: Shared formatting helpers used by weekly planning output code.
code:
  paths:
    - packages/planning/src/shared/**
```

`atlas resolve-path` ranks the narrower owner above broader package ownership.

## Use agent hints sparingly

Agent hints are helpful, but typed relations are more important.

```yaml
agent:
  load_when:
    - Editing calendar write behavior
  avoid_loading_when:
    - Only changing marketing copy generation
  token_budget_hint: 800
```
