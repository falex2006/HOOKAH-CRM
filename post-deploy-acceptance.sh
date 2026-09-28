#!/usr/bin/env bash
set -euo pipefail

# Production-only smoke check. Credentials are read from the environment and
# are never echoed or written to the repository.
BASE_URL="${BASE_URL:-https://crm.example.com}"
CRM_USERNAME="${CRM_USERNAME:-}"
CRM_PASSWORD="${CRM_PASSWORD:-}"
ALLOW_HTTP="${ALLOW_HTTP:-0}"

if [[ -z "$CRM_USERNAME" || -z "$CRM_PASSWORD" ]]; then
  echo 'Set CRM_USERNAME and CRM_PASSWORD for a production smoke check.' >&2
  exit 2
fi
if [[ "$BASE_URL" != https://* && "$ALLOW_HTTP" != 1 ]]; then
  echo 'BASE_URL must use HTTPS (set ALLOW_HTTP=1 only for an intentional local check).' >&2
  exit 2
fi
if ! command -v curl >/dev/null 2>&1; then
  echo 'curl is required.' >&2
  exit 2
fi
if ! command -v jq >/dev/null 2>&1; then
  echo 'jq is required to safely encode login credentials.' >&2
  exit 2
fi

cookie_file="$(mktemp)"
response_file="$(mktemp)"
trap 'rm -f "$cookie_file" "$response_file"' EXIT

health="$(curl --fail --silent --show-error --max-time 15 "$BASE_URL/api/health")"
grep -q '"status":"ok"' <<<"$health" || { echo 'Healthcheck did not return status=ok.' >&2; exit 1; }

login_payload="$(jq -n --arg username "$CRM_USERNAME" --arg password "$CRM_PASSWORD" '{username:$username,password:$password}')"
curl --fail --silent --show-error --max-time 15 \
  -c "$cookie_file" -H 'Content-Type: application/json' \
  -d "$login_payload" "$BASE_URL/api/login" >"$response_file"
grep -q '"token"' "$response_file" || { echo 'Login response did not contain a token.' >&2; exit 1; }

session="$(curl --fail --silent --show-error --max-time 15 -b "$cookie_file" "$BASE_URL/api/session")"
grep -q '"user"' <<<"$session" || { echo 'Authenticated session was not returned.' >&2; exit 1; }

for path in /admin /orders /inventory /finance /api/health; do
  curl --fail --silent --show-error --max-time 15 -b "$cookie_file" "$BASE_URL$path" >/dev/null
done

echo 'POST-DEPLOY ACCEPTANCE: PASS (HTTPS, health, login, session and core routes)'
