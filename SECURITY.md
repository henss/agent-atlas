# Security Policy

Agent Atlas is designed to describe and traverse context. That makes security boundaries unusually important, because metadata can leak structure even when it does not leak content.

## Do not store secrets

Atlas files must not contain:

- access tokens
- API keys
- passwords
- OAuth refresh tokens
- private keys
- customer data
- production credentials
- live personal data

When credentials are relevant, describe required secret scopes abstractly:

```yaml
relations:
  - type: requires-secret-scope
    target: secret-scope:calendar-read
```

## Treat private identifiers carefully

Even identifiers can be sensitive:

- Notion page IDs
- Confluence page IDs
- Google Calendar IDs
- Jira project names
- internal repository names
- email labels
- customer-specific dataset names

Use private overlays or local aliases for sensitive identifiers.

## Write-capable integrations

The initial project should prefer read-only resources and traversal tools. Any future write-capable MCP tool must have:

- clear documentation
- least-privilege permission requirements
- visible invocation semantics
- human confirmation boundaries where appropriate
- tests covering unsafe invocation cases

## Reporting issues

For security issues, do not open a public issue with sensitive details. Use the project's chosen private disclosure channel once configured.
