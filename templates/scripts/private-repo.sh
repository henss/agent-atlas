#!/usr/bin/env sh
set -eu

ATLAS_CHECKOUT="${ATLAS_CHECKOUT:-../agent-atlas}"
ATLAS_CLI="$ATLAS_CHECKOUT/packages/cli/dist/index.js"

pnpm --dir "$ATLAS_CHECKOUT" -r build
node "$ATLAS_CLI" doctor --path . --profile private
node "$ATLAS_CLI" validate . --profile private
node "$ATLAS_CLI" generate markdown --path . --output docs/agents --profile private
node "$ATLAS_CLI" context-pack "${1:-change this repo}" --path . --budget "${ATLAS_BUDGET:-4000}" --profile private
