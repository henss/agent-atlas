# Start Here

This repo is a seed for a public Agent Atlas project.

Recommended first Codex task:

```text
Implement M1: schema and validation.
Start by reading AGENTS.md, docs/spec/entities.md, docs/spec/relations.md, packages/schema/README.md, and ROADMAP.md.
Then implement a simple validator that loads example YAML files and checks required fields, entity ID format, kind consistency, known relation types, and missing relation targets.
```

Recommended second task:

```text
Implement M2: graph loading and traversal.
Create a loader for .agent-atlas/**/*.yaml, build a graph index, generate inverse relations, and implement atlas show / atlas neighbors.
```

Recommended third task:

```text
Implement M3: bottom-up path resolution.
Use component code.paths globs to resolve a source file to components, then traverse to workflows/domains/docs/tests.
```
