#!/usr/bin/env bash
set -euo pipefail

backup_dir="${BACKUP_DIR:-./backups}"
mkdir -p "$backup_dir"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
file="$backup_dir/crm-$stamp.sql.gz"

docker compose exec -T db pg_dump --clean --if-exists -U "${POSTGRES_USER:-crm}" "${POSTGRES_DB:-crm}" | gzip > "$file"
chmod 600 "$file"
find "$backup_dir" -type f -name 'crm-*.sql.gz' -mtime +14 -delete
echo "$file"
