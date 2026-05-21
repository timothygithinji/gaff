#!/usr/bin/env bash
#
# push-secrets.sh
#
# Pulls secrets for this project from Doppler and pushes them to Cloudflare
# Workers as encrypted secrets via `wrangler secret put`.
#
# Prerequisites:
#   - doppler CLI authenticated (`doppler login`)
#   - wrangler CLI authenticated (`wrangler login` or CLOUDFLARE_API_TOKEN set)
#   - Run from the project root (or a workspace that has a wrangler.toml)
#
# Usage:
#   bash scripts/push-secrets.sh                # pushes prd secrets to default worker
#   ENV=stg bash scripts/push-secrets.sh        # pick a different Doppler config
#   WRANGLER_ENV=staging bash scripts/push-secrets.sh   # push to a wrangler env
#
set -euo pipefail

ENV="${ENV:-prd}"
PROJECT="gaff"
WRANGLER_ENV="${WRANGLER_ENV:-}"

echo "Fetching secrets from Doppler (project=${PROJECT}, config=${ENV})..."

# Export as dotenv lines: KEY=VALUE
SECRETS="$(doppler secrets download \
  --no-file \
  --format=env \
  --project="${PROJECT}" \
  --config="${ENV}")"

if [[ -z "${SECRETS}" ]]; then
  echo "No secrets returned for project=${PROJECT} config=${ENV}" >&2
  exit 1
fi

WRANGLER_ARGS=()
if [[ -n "${WRANGLER_ENV}" ]]; then
  WRANGLER_ARGS+=("--env" "${WRANGLER_ENV}")
fi

# Iterate over each line and push to Cloudflare. Strip surrounding quotes that
# `doppler secrets download --format=env` may add around values.
while IFS= read -r line; do
  # Skip blank lines and comments
  [[ -z "${line}" || "${line}" =~ ^[[:space:]]*# ]] && continue

  key="${line%%=*}"
  value="${line#*=}"

  # Strip leading/trailing double quotes if present
  if [[ "${value}" == \"*\" ]]; then
    value="${value:1:${#value}-2}"
  fi

  echo "  -> pushing ${key}"
  printf "%s" "${value}" | bunx wrangler secret put "${key}" "${WRANGLER_ARGS[@]}"
done <<< "${SECRETS}"

echo "Done."
