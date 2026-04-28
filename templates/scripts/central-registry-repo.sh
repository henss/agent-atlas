#!/usr/bin/env sh
set -eu

ATLAS_CHECKOUT="${ATLAS_CHECKOUT:-../agent-atlas}"
ATLAS_CLI="$ATLAS_CHECKOUT/packages/cli/dist/index.js"

pnpm --dir "$ATLAS_CHECKOUT" -r build
node "$ATLAS_CLI" doctor --path . --profile company
node "$ATLAS_CLI" boundary-check --path . --profile company
node "$ATLAS_CLI" diff --path . --profile company
node "$ATLAS_CLI" global validate --path . --profile company
node "$ATLAS_CLI" global manifest --path . --profile company
node "$ATLAS_CLI" global generate markdown --path . --output docs/agents/global --profile company --check
node "$ATLAS_CLI" global list --path . --profile company
node "$ATLAS_CLI" global context-pack "${1:-change across registered repos}" --path . --budget "${ATLAS_BUDGET:-8000}" --profile company
node "$ATLAS_CLI" evaluate --path . --profile company
