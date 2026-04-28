#!/usr/bin/env sh
set -eu

ATLAS_CHECKOUT="${ATLAS_CHECKOUT:-../agent-atlas}"
ATLAS_CLI="$ATLAS_CHECKOUT/packages/cli/dist/index.js"

pnpm --dir "$ATLAS_CHECKOUT" -r build
node "$ATLAS_CLI" doctor --path . --profile public
node "$ATLAS_CLI" validate . --profile public
node "$ATLAS_CLI" generate markdown --path . --output docs/agents --profile public
node "$ATLAS_CLI" evaluate --path . --profile public
git diff --exit-code docs/agents
