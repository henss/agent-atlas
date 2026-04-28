# Open Source Strategy

The core project should be public. Real atlas contents can remain private.

## Open-source core

Public:

- schema
- CLI
- graph traversal
- validators
- generated Markdown tools
- MCP server
- adapter interfaces
- generic adapters
- sanitized examples
- docs and roadmap

## Private deployments

Private:

- actual company atlas contents
- internal overlays
- internal repo registry
- sensitive resource aliases
- private MCP server configs
- real operational context

## Why this split works

The standard and tools benefit from public scrutiny and adoption. The contents are often sensitive and should not be public by default.

## License

Apache-2.0 is recommended for broad adoption, including company use.
