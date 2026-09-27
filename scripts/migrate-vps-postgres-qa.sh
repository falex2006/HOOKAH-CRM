#!/usr/bin/env bash
set -euo pipefail

# Exercise migrate-vps.sh failure/retry semantics against an isolated real
# PostgreSQL container. Only the Docker Compose adapter is shimmed; each
# readiness/psql operation reaches the supplied PostgreSQL container.
qa_container="${QA_POSTGRES_CONTAINER:-}"
qa_database="${QA_POSTGRES_DATABASE:-}"
qa_user="${QA_POSTGRES_USER:-postgres}"
real_docker="${REAL_DOCKER_PATH:-$(command -v docker || true)}"
[[ -n "$qa_container" ]] || { echo 'Set QA_POSTGRES_CONTAINER to an isolated PostgreSQL container' >&2; exit 1; }
[[ "$qa_container" == 'territory-crm-postgres-qa' ]] || { echo 'Refusing writes outside the dedicated territory-crm-postgres-qa container' >&2; exit 1; }
[[ "$qa_database" =~ ^[a-zA-Z0-9_-]+$ && "$qa_database" =~ (^|[_-])(test|qa|scratch)([_-]|$) ]] || { echo 'Refusing writes unless QA_POSTGRES_DATABASE is a safe test/QA/scratch database identifier' >&2; exit 1; }
[[ "$qa_user" =~ ^[a-zA-Z0-9_-]+$ ]] || { echo 'QA_POSTGRES_USER must be a simple identifier' >&2; exit 1; }
[[ -n "$real_docker" && -x "$real_docker" ]] || { echo 'Docker CLI path is required' >&2; exit 1; }

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
tmp_parent="$(cd "${TMPDIR:-/tmp}" && pwd -P)"
tmp="$(mktemp -d "$tmp_parent/territory-migrate-vps-pg-qa.XXXXXX")"
tmp_resolved="$(cd "$tmp" && pwd -P)"
probe="qa_migrate_probe_${$}"
following="qa_migrate_following_${$}"

cleanup() {
  "$real_docker" exec "$qa_container" psql -X -v ON_ERROR_STOP=1 -U "$qa_user" -d "$qa_database" -c "DROP TABLE IF EXISTS public.$following, public.$probe" >/dev/null 2>&1 || true
  if [[ -n "${tmp_resolved:-}" && -d "$tmp_resolved" ]]; then
    local current_parent current_path
    current_parent="$(cd "$(dirname "$tmp_resolved")" && pwd -P)"
    current_path="$(cd "$tmp_resolved" && pwd -P)"
    if [[ "$current_parent" == "$tmp_parent" && "$current_path" == "$tmp_parent"/territory-migrate-vps-pg-qa.* ]]; then
      rm -rf -- "$current_path"
    else
      echo 'Refusing to remove QA files outside the expected temporary directory' >&2
    fi
  fi
}
trap cleanup EXIT

if [[ "$probe" =~ [^a-zA-Z0-9_] || "$following" =~ [^a-zA-Z0-9_] ]]; then
  echo 'Invalid generated QA object name' >&2
  exit 1
fi

ready="$("$real_docker" exec "$qa_container" pg_isready -U "$qa_user" -d "$qa_database")"
[[ "$ready" == *'accepting connections'* ]] || { echo 'Isolated PostgreSQL container is not ready' >&2; exit 1; }
existing="$("$real_docker" exec "$qa_container" psql -X -At -U "$qa_user" -d "$qa_database" -c "SELECT to_regclass('public.$probe') IS NULL AND to_regclass('public.$following') IS NULL")"
[[ "$existing" == 't' ]] || { echo 'Refusing to reuse existing QA marker tables' >&2; exit 1; }

mkdir -p "$tmp_resolved/bin" "$tmp_resolved/migrations"
cp "$root_dir/migrate-vps.sh" "$tmp_resolved/migrate-vps.sh"
printf 'POSTGRES_USER=%s\nPOSTGRES_DB=%s\n' "$qa_user" "$qa_database" > "$tmp_resolved/.env"
cat > "$tmp_resolved/migrations/001_failure_probe.sql" <<SQL
CREATE TABLE public.$probe (id integer PRIMARY KEY);
INSERT INTO public.$probe VALUES (1);
SELECT 1 / 0;
SQL
cat > "$tmp_resolved/migrations/002_after_failure.sql" <<SQL
CREATE TABLE public.$following (id integer PRIMARY KEY);
SQL

cat > "$tmp_resolved/bin/docker" <<'FAKE_DOCKER'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$LOG_FILE"
case "$*" in
  'compose version') exit 0 ;;
  'compose exec -T db pg_isready '*)
    shift 4
    exec "$REAL_DOCKER_PATH" exec "$QA_POSTGRES_CONTAINER" "$@" ;;
  'compose exec -T db psql '*)
    shift 4
    exec "$REAL_DOCKER_PATH" exec -i "$QA_POSTGRES_CONTAINER" "$@" ;;
  *) exit 0 ;;
esac
FAKE_DOCKER
chmod +x "$tmp_resolved/bin/docker"

run_migrator() (
  cd "$tmp_resolved"
  PATH="$tmp_resolved/bin:$PATH" \
    REAL_DOCKER_PATH="$real_docker" \
    QA_POSTGRES_CONTAINER="$qa_container" \
    LOG_FILE=.qa-log \
    bash ./migrate-vps.sh
)

set +e
first_output="$(run_migrator 2>&1)"
first_status=$?
set -e
[[ $first_status -ne 0 ]] || { echo 'Injected SQL failure unexpectedly succeeded' >&2; exit 1; }
[[ "$first_output" == *'Applying migrations/001_failure_probe.sql'* ]] || { echo 'First migration was not reached' >&2; exit 1; }
[[ "$first_output" != *'Applying migrations/002_after_failure.sql'* ]] || { echo 'Runner continued after a failed migration' >&2; exit 1; }
rolled_back="$("$real_docker" exec "$qa_container" psql -X -At -U "$qa_user" -d "$qa_database" -c "SELECT to_regclass('public.$probe') IS NULL")"
[[ "$rolled_back" == 't' ]] || { echo 'Failed migration left partial PostgreSQL state behind' >&2; exit 1; }
first_log="$(cat "$tmp_resolved/.qa-log")"
[[ "$(printf '%s\n' "$first_log" | grep -c '^compose exec -T db psql ' || true)" -eq 1 ]] || { echo 'Runner did not stop after its first failed psql call' >&2; exit 1; }
[[ "$first_log" != *'compose up -d crm'* && "$first_log" != *'npm run db:seed-menu'* ]] || { echo 'Runner started CRM or seed after a failed migration' >&2; exit 1; }

sed -i '/SELECT 1 \/ 0;/d' "$tmp_resolved/migrations/001_failure_probe.sql"
retry_output="$(run_migrator 2>&1)"
[[ "$retry_output" == *'Applying migrations/001_failure_probe.sql'* && "$retry_output" == *'Applying migrations/002_after_failure.sql'* ]] || { echo 'Retry did not run migrations in lexical order' >&2; exit 1; }
[[ "$retry_output" == *'CRM migrations applied'* && "$retry_output" == *'CRM menu catalog synchronized'* ]] || { echo 'Successful retry did not complete the post-migration steps' >&2; exit 1; }
persisted="$("$real_docker" exec "$qa_container" psql -X -At -U "$qa_user" -d "$qa_database" -c "SELECT to_regclass('public.$probe') IS NOT NULL AND to_regclass('public.$following') IS NOT NULL AND (SELECT count(*) FROM public.$probe)=1")"
[[ "$persisted" == 't' ]] || { echo 'Successful retry did not commit both real PostgreSQL migrations' >&2; exit 1; }

printf '%s\n' 'MIGRATE VPS REAL POSTGRES FAILURE/RETRY QA: PASS (real PostgreSQL rollback, stop-on-error, ordered retry, CRM/seed only after successful migrations)'
