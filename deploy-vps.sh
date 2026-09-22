#!/usr/bin/env bash
set -euo pipefail

# Run from the CRM directory on a fresh Ubuntu/Debian VPS.
# Do not put real passwords in this file; create .env before running it.
command -v docker >/dev/null || { echo 'Docker is required'; exit 1; }

docker compose version >/dev/null 2>&1 || { echo 'Docker Compose plugin is required' >&2; exit 1; }
test -f .env || { echo 'Create .env from .env.example first'; exit 1; }
set -a
. ./.env
set +a
[ "${AUTH_REQUIRED:-}" = 'true' ] || { echo 'AUTH_REQUIRED=true is required on VPS' >&2; exit 1; }
[ "${COOKIE_SECURE:-}" = 'true' ] || { echo 'COOKIE_SECURE=true is required on VPS' >&2; exit 1; }
for secret_name in POSTGRES_PASSWORD DEMO_ADMIN_PASSWORD DEMO_OWNER_PASSWORD DEMO_STAFF_PASSWORD STAFF_PASSPORT_KEY SAAS_OWNER_PASSWORD; do
  secret_value="${!secret_name:-}"
  [ -n "$secret_value" ] || { echo "$secret_name is required" >&2; exit 1; }
  case "$secret_value" in change_*|*change_me*|*change_this*|replace-*|*replace-with*) echo "Replace placeholder in $secret_name" >&2; exit 1;; esac
done
[ -n "${SAAS_OWNER_EMAIL:-}" ] || { echo 'SAAS_OWNER_EMAIL is required' >&2; exit 1; }
case "${SAAS_OWNER_EMAIL}" in platform-owner@example.com|change_*|replace-*) echo 'Replace placeholder in SAAS_OWNER_EMAIL' >&2; exit 1;; esac

docker compose config --quiet
docker compose pull
docker compose build --pull
docker compose up -d
./migrate-vps.sh
docker compose exec -T crm npm run db:seed-menu
docker compose restart crm

for attempt in $(seq 1 30); do
  if docker compose exec -T crm wget -qO- http://localhost:3000/api/health | grep -q '"status":"ok"'; then
    echo 'CRM is healthy'
    exit 0
  fi
  sleep 2
done

docker compose ps
docker compose logs --tail=100 crm
echo 'CRM did not become healthy' >&2
exit 1
