#!/usr/bin/env bash
#
# setup-doppler.sh
#
# Walks a new dev through configuring Doppler locally for Gaff. After this
# runs, `doppler run -- bun run dev` (and Drizzle, push-secrets.sh, etc.) will
# pick up the right project/config without extra flags.
#
# Prerequisites:
#   - doppler CLI installed (`brew install dopplerhq/cli/doppler` on macOS)
#   - A Doppler project named `gaff` with `dev` + `prd` configs (you have access)
#
# Usage:
#   bash scripts/setup-doppler.sh
#
# By default the Doppler config is scoped to this repo directory, matching the
# `${DOPPLER_SCOPE:-.}` default in the package.json scripts. Set DOPPLER_SCOPE
# to keep an isolated scope elsewhere (e.g. ~/.t-stack/orgs/<org>).
set -euo pipefail

PROJECT="gaff"
CONFIG="dev"
SCOPE="${DOPPLER_SCOPE:-$(pwd)}"

if ! command -v doppler >/dev/null 2>&1; then
  echo "doppler CLI not found on PATH." >&2
  echo "Install it from https://docs.doppler.com/docs/install-cli and re-run." >&2
  exit 1
fi

# `doppler whoami` is the cheapest way to confirm an auth token exists.
if ! doppler whoami >/dev/null 2>&1; then
  echo "Not logged into Doppler. Running 'doppler login'..."
  doppler login
fi

# Ensure the scope directory exists so `doppler setup --scope` has somewhere
# to write its .doppler.yaml.
mkdir -p "$SCOPE"

echo "Configuring Doppler:"
echo "  project: $PROJECT"
echo "  config:  $CONFIG"
echo "  scope:   $SCOPE"

doppler setup \
  --project "$PROJECT" \
  --config "$CONFIG" \
  --scope "$SCOPE" \
  --no-interactive

echo
echo "Done. Verify with:"
echo "  doppler secrets --project $PROJECT --config $CONFIG --scope $SCOPE"
