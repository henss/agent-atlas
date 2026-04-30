#!/usr/bin/env sh
set -eu

ATLAS_CLI_VERSION="${ATLAS_CLI_VERSION:-0.17.0}"

atlas() {
  pnpm dlx "@agent-atlas/cli@${ATLAS_CLI_VERSION}" "$@"
}

atlas doctor --path . --profile public
atlas validate . --profile public
atlas boundary-check . --profile public
atlas generate markdown . --output docs/agents --profile public --check
atlas diff . --profile public
atlas evaluate . --profile public
