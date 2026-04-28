#!/usr/bin/env sh
set -eu

ATLAS_CHECKOUT="${ATLAS_CHECKOUT:-../agent-atlas}"
ATLAS_CLI="$ATLAS_CHECKOUT/packages/cli/dist/index.js"
ATLAS_MCP="$ATLAS_CHECKOUT/packages/mcp-server/dist/stdio.js"

pnpm --dir "$ATLAS_CHECKOUT" -r build
node "$ATLAS_CLI" doctor --path . --profile company
node "$ATLAS_CLI" validate . --profile company
node "$ATLAS_CLI" boundary-check --path . --profile company
node "$ATLAS_CLI" diff --path . --profile company
node "$ATLAS_CLI" evaluate --path . --profile company
node "$ATLAS_CLI" benchmark --path . --profile company --iterations "${ATLAS_ITERATIONS:-3}"
printf 'MCP stdio entrypoint: node %s --path . --profile company\n' "$ATLAS_MCP"
