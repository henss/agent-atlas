# @agent-atlas/core

Core atlas logic.

Implemented responsibilities:

- load `.agent-atlas/**/*.yaml` entity files
- validate entity graph structure
- normalize explicit relation edges
- generate inverse relation edges for traversal
- build incoming/outgoing graph indexes
- apply selected private/company overlays before graph normalization
- traverse graph neighbors with depth and relation filters
- resolve source paths to owning components and related context
- create deterministic task-specific context packs
- load cross-repo registry configs and merge imported atlases
- plan and write schema-version migrations
- run lightweight load benchmarks
- diagnose sibling-checkout setup with doctor checks
- emit validation, orphan, and cycle diagnostics

Keep this package UI-free and vendor-neutral.

Roadmap work after M11 should keep shared behavior here when it is not UI-specific, especially diagnostics, boundary checks, registry checks, generated-doc checks, and authoring analysis.
