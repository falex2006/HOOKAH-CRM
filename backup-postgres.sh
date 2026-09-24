#!/usr/bin/env bash
set -euo pipefail

compose() {
  if docker compose version >/dev/null 2>&1; then docker compose "$@"; else docker-compose "$@"; fi
}

backup_dir="${BACKUP_DIR:-./backups}"
mkdir -p "$backup_dir"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
file="$backup_dir/crm-$stamp.sql.gz"

compose exec -T db pg_dump --clean --if-exists -U "${POSTGRES_USER:-crm}" "${POSTGRES_DB:-crm}" | gzip > "$file"
test -s "$file" || { echo "Backup is empty: $file" >&2; exit 1; }
gzip -t "$file" || { echo "Backup archive is corrupt: $file" >&2; exit 1; }
chmod 600 "$file"
find "$backup_dir" -type f -name 'crm-*.sql.gz' -mtime +14 -delete
echo "$file"
