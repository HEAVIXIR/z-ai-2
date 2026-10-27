#!/usr/bin/env bash
set -euo pipefail

# Disposable CI-only proof for the paired Main + Store backup script.
# The explicit guard, local-host restriction, and CI-only check prevent this
# script from being used as a production/staging backup or destructive reset.
if [[ "${GITHUB_ACTIONS:-}" != "true" || "${HEAVIX_ALLOW_DISPOSABLE_DB_RESET:-}" != "1" ]]; then
  echo "FAIL: paired backup/restore drill is restricted to disposable GitHub Actions databases." >&2
  exit 2
fi

PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-postgres}"
PGPASSWORD="${PGPASSWORD:-postgres}"
export PGHOST PGPORT PGUSER PGPASSWORD

if [[ "$PGHOST" != "localhost" && "$PGHOST" != "127.0.0.1" ]]; then
  echo "FAIL: refusing non-local PostgreSQL host: $PGHOST" >&2
  exit 2
fi

MAIN_SOURCE="heavix_pair_main_source_proof"
STORE_SOURCE="heavix_pair_store_source_proof"
MAIN_RESTORE="heavix_pair_main_restore_proof"
STORE_RESTORE="heavix_pair_store_restore_proof"
TMP="$(mktemp -d)"

cleanup() {
  for db in "$MAIN_RESTORE" "$STORE_RESTORE" "$MAIN_SOURCE" "$STORE_SOURCE"; do
    psql -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS $db WITH (FORCE);" >/dev/null 2>&1 || true
  done
  rm -rf "$TMP"
}
trap cleanup EXIT

echo "=== HEAVIX disposable paired Main + Store PostgreSQL 17 backup/restore proof ==="
echo "commit: ${GITHUB_SHA:-unknown}"
psql -d postgres -v ON_ERROR_STOP=1 -Atc "SHOW server_version;"

for db in "$MAIN_SOURCE" "$STORE_SOURCE" "$MAIN_RESTORE" "$STORE_RESTORE"; do
  psql -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS $db WITH (FORCE);"
done
for db in "$MAIN_SOURCE" "$STORE_SOURCE" "$MAIN_RESTORE" "$STORE_RESTORE"; do
  psql -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE $db;"
done

psql -d "$MAIN_SOURCE" -v ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE backup_sentinel (id text PRIMARY KEY, payload text NOT NULL, amount integer NOT NULL);
INSERT INTO backup_sentinel VALUES ('main-sentinel-2026', 'main paired backup proof', 731);
SQL

psql -d "$STORE_SOURCE" -v ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE backup_sentinel (id text PRIMARY KEY, payload text NOT NULL, amount integer NOT NULL);
INSERT INTO backup_sentinel VALUES ('store-sentinel-2026', 'store paired backup proof', 947);
SQL

main_before="$(psql -d "$MAIN_SOURCE" -v ON_ERROR_STOP=1 -Atc "SELECT id || '|' || payload || '|' || amount FROM backup_sentinel;")"
store_before="$(psql -d "$STORE_SOURCE" -v ON_ERROR_STOP=1 -Atc "SELECT id || '|' || payload || '|' || amount FROM backup_sentinel;")"
[[ "$main_before" == "main-sentinel-2026|main paired backup proof|731" ]] || { echo "FAIL: Main sentinel precondition failed"; exit 1; }
[[ "$store_before" == "store-sentinel-2026|store paired backup proof|947" ]] || { echo "FAIL: Store sentinel precondition failed"; exit 1; }

BACKUP_ROOT="$TMP/backups" \
DB_HOST="$PGHOST" DB_PORT="$PGPORT" DB_USER="$PGUSER" DB_NAME="$MAIN_SOURCE" DB_PASSWORD="$PGPASSWORD" \
STORE_DB_HOST="$PGHOST" STORE_DB_PORT="$PGPORT" STORE_DB_USER="$PGUSER" STORE_DB_NAME="$STORE_SOURCE" STORE_DB_PASSWORD="$PGPASSWORD" \
BACKUP_DOCKER_MODE=0 bash scripts/backup.sh | tee "$TMP/backup-output.txt"

backup_id="$(find "$TMP/backups" -mindepth 1 -maxdepth 1 -type d -printf '%f' | grep -E '^[0-9]{8}_[0-9]{6}$')"
backup_dir="$TMP/backups/$backup_id"
test -s "$backup_dir/main.sql"
test -s "$backup_dir/store.sql"
test -s "$backup_dir/checksums.txt"
(
  cd "$backup_dir"
  sha256sum -c checksums.txt
)

psql -d "$MAIN_RESTORE" -v ON_ERROR_STOP=1 -f "$backup_dir/main.sql" >/dev/null
psql -d "$STORE_RESTORE" -v ON_ERROR_STOP=1 -f "$backup_dir/store.sql" >/dev/null

main_after="$(psql -d "$MAIN_RESTORE" -v ON_ERROR_STOP=1 -Atc "SELECT id || '|' || payload || '|' || amount FROM backup_sentinel;")"
store_after="$(psql -d "$STORE_RESTORE" -v ON_ERROR_STOP=1 -Atc "SELECT id || '|' || payload || '|' || amount FROM backup_sentinel;")"
[[ "$main_after" == "$main_before" ]] || { echo "FAIL: Main restored sentinel mismatch"; exit 1; }
[[ "$store_after" == "$store_before" ]] || { echo "FAIL: Store restored sentinel mismatch"; exit 1; }

echo "Main source: $main_before"
echo "Main restore: $main_after"
echo "Store source: $store_before"
echo "Store restore: $store_after"
echo "VERDICT: PASS — paired Main + Store dumps, checksums, and non-zero sentinel values restored into separate disposable databases."
