#!/usr/bin/env sh
set -eu

ATLAS_CHECKOUT="${ATLAS_CHECKOUT:-../agent-atlas}"
ATLAS_CLI="$ATLAS_CHECKOUT/packages/cli/dist/index.js"

pnpm --dir "$ATLAS_CHECKOUT" -r build
node "$ATLAS_CLI" doctor --path . --profile public
node "$ATLAS_CLI" validate . --profile public
node "$ATLAS_CLI" boundary-check --path . --profile public
node "$ATLAS_CLI" maintain fix --path . --profile public
node "$ATLAS_CLI" maintain check --path . --profile public
node "$ATLAS_CLI" diff --path . --profile public
node "$ATLAS_CLI" evaluate --path . --profile public
