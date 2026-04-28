# @agent-atlas/core

Core atlas logic.

Implemented responsibilities:

- load `.agent-atlas/**/*.yaml` entity files
- validate entity graph structure
- normalize explicit relation edges
- generate inverse relation edges for traversal
- build incoming/outgoing graph indexes
- traverse graph neighbors with depth and relation filters
- emit validation, orphan, and cycle diagnostics

Planned responsibilities:

- apply overlays
- resolve paths to components/workflows/domains
- create context packs

Keep this package UI-free and vendor-neutral.
