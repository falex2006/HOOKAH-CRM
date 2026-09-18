#!/usr/bin/env bash
set -euo pipefail

# Run from the CRM directory on a fresh Ubuntu/Debian VPS.
# Do not put real passwords in this file; create .env before running it.
command -v docker >/dev/null || { echo 'Docker is required'; exit 1; }
test -f .env || { echo 'Create .env from .env.example first'; exit 1; }

docker compose config --quiet
docker compose pull
docker compose build --pull
docker compose up -d

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
