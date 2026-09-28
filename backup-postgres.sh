#!/usr/bin/env bash
set -euo pipefail
umask 077

compose() {
  if docker compose version >/dev/null 2>&1; then docker compose "$@"; else docker-compose "$@"; fi
}

backup_dir="${BACKUP_DIR:-./backups}"
mkdir -p "$backup_dir"
command -v flock >/dev/null || { echo 'flock is required to prevent concurrent backups' >&2; exit 1; }
exec 9>"$backup_dir/.crm-backup.lock"
flock 9
if [ -n "${BACKUP_LABEL:-}" ]; then
  [[ "$BACKUP_LABEL" =~ ^[A-Za-z0-9._-]{1,160}$ ]] || { echo 'BACKUP_LABEL may contain only letters, numbers, dots, underscores and hyphens' >&2; exit 1; }
  file="$backup_dir/crm-$BACKUP_LABEL.sql.gz"
  if [ -e "$file" ]; then
    test -s "$file" || { echo "Existing backup is empty: $file" >&2; exit 1; }
    gzip -t "$file" || { echo "Existing backup archive is corrupt: $file" >&2; exit 1; }
    chmod 600 "$file"
    echo "Reusing verified backup: $file"
    exit 0
  fi
else
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  file="$backup_dir/crm-$stamp.sql.gz"
  suffix=1
  while [ -e "$file" ]; do
    file="$backup_dir/crm-$stamp-$suffix.sql.gz"
    suffix=$((suffix + 1))
  done
fi

tmp_file="$file.tmp.$$"
trap 'rm -f "$tmp_file"' EXIT
compose exec -T db pg_dump --clean --if-exists -U "${POSTGRES_USER:-crm}" "${POSTGRES_DB:-crm}" | gzip > "$tmp_file"
test -s "$tmp_file" || { echo "Backup is empty: $tmp_file" >&2; exit 1; }
gzip -t "$tmp_file" || { echo "Backup archive is corrupt: $tmp_file" >&2; exit 1; }
mv "$tmp_file" "$file"
chmod 600 "$file"
find "$backup_dir" -type f -name 'crm-*.sql.gz' -mtime +14 -delete
echo "$file"
