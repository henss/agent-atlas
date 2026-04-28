---
name: add-atlas-entity
description: Use when adding or modifying atlas entity cards, relation links, or examples.
---

# Add Atlas Entity Skill

Use this skill when creating or modifying `.agent-atlas/**/*.yaml` files.

## Steps

1. Identify the entity kind: domain, workflow, component, resource, document, tool, interface, dataset, secret-scope, or test-scope.
2. Choose a stable ID in `<kind>:<slug>` format.
3. Write a short summary that helps an agent decide whether to load more.
4. Add typed relations to existing entities.
5. Add `agent.load_when` only when it improves context selection.
6. Avoid private identifiers in public examples.
7. Update examples or docs if the schema shape changes.

## Good output

Prefer compact, explicit cards:

```yaml
id: component:video-generator
kind: component
title: Video Generator
summary: Produces campaign and song videos from templates, metadata, and media assets.
relations:
  - type: part-of
    target: domain:music-operations
  - type: used-by
    target: workflow:publish-single
code:
  paths:
    - packages/video-generator/**
```
