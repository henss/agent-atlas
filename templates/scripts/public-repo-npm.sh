#!/usr/bin/env sh
set -eu

ATLAS_CLI_VERSION="${ATLAS_CLI_VERSION:-0.18.0}"

atlas() {
  pnpm dlx "@agent-atlas/cli@${ATLAS_CLI_VERSION}" "$@"
}

atlas doctor --path . --profile public
atlas validate . --profile public
atlas boundary-check . --profile public
atlas maintain fix --path . --profile public
atlas maintain check --path . --profile public
atlas diff . --profile public
atlas evaluate . --profile public
