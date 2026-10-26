#!/usr/bin/env bash
set -euo pipefail

# Disposable CI-only PostgreSQL 17 backup/restore rehearsal.
# Fail closed outside GitHub Actions and unless the explicit disposable-DB
# reset guard is enabled. Never point this script at staging or production.
if [[ "${GITHUB_ACTIONS:-}" != "true" || "${HEAVIX_ALLOW_DISPOSABLE_DB_RESET:-}" != "1" ]]; then
  echo "FAIL: this drill is restricted to disposable GitHub Actions databases." >&2
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

SOURCE_DB="heavix_store_backup_source_proof"
RESTORE_DB="heavix_store_backup_restore_proof"
TMP="$(mktemp -d)"
cleanup() {
  psql -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS $RESTORE_DB WITH (FORCE);" >/dev/null 2>&1 || true
  psql -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS $SOURCE_DB WITH (FORCE);" >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap cleanup EXIT

echo "=== HEAVIX disposable Store backup/restore proof ==="
echo "commit: ${GITHUB_SHA:-unknown}"
psql -d postgres -v ON_ERROR_STOP=1 -Atc "SHOW server_version;"

psql -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS $RESTORE_DB WITH (FORCE);"
psql -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS $SOURCE_DB WITH (FORCE);"
psql -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE $SOURCE_DB;"
psql -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE $RESTORE_DB;"

STORE_DATABASE_URL="postgresql://$PGUSER:$PGPASSWORD@$PGHOST:$PGPORT/$SOURCE_DB?schema=public" \
  bunx prisma migrate deploy --schema=prisma/store/schema.prisma
STORE_DATABASE_URL="postgresql://$PGUSER:$PGPASSWORD@$PGHOST:$PGPORT/$SOURCE_DB?schema=public" \
  bunx prisma migrate status --schema=prisma/store/schema.prisma

psql -d "$SOURCE_DB" -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO "Category" ("id", "name", "slug", "createdAt")
VALUES ('restore-sentinel-category', 'Restore Sentinel Category', 'restore-sentinel-category', now());
INSERT INTO "Part" ("id", "name", "sku", "categoryId", "priceUsd", "stock", "createdAt", "updatedAt")
VALUES ('restore-sentinel-part', 'Restore Sentinel Part', 'RESTORE-SENTINEL-42', 'restore-sentinel-category', 42.0, 42, now(), now());
INSERT INTO "AuditOutbox" ("id", "payloadJson", "status", "attempts", "createdAt", "updatedAt")
VALUES ('restore-sentinel-outbox', '{"event":"restore.sentinel","stock":42}', 'PENDING', 0, now(), now());
SQL

count_query='SELECT
  (SELECT count(*) FROM information_schema.tables WHERE table_schema = '\''public'\'' AND table_type = '\''BASE TABLE'\'') || '\''|'\'' ||
  (SELECT count(*) FROM information_schema.table_constraints WHERE table_schema = '\''public'\'' AND constraint_type = '\''FOREIGN KEY'\'') || '\''|'\'' ||
  (SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL);'

stock_before="$(psql -d "$SOURCE_DB" -v ON_ERROR_STOP=1 -Atc 'SELECT stock FROM "Part" WHERE id = '\''restore-sentinel-part'\'';')"
outbox_before="$(psql -d "$SOURCE_DB" -v ON_ERROR_STOP=1 -Atc 'SELECT count(*) FROM "AuditOutbox" WHERE id = '\''restore-sentinel-outbox'\'' AND status = '\''PENDING'\'';')"
[[ "$stock_before" == "42" ]] || { echo "FAIL: source sentinel precondition expected 42, got $stock_before"; exit 1; }
[[ "$outbox_before" == "1" ]] || { echo "FAIL: source Outbox sentinel precondition failed"; exit 1; }
source_counts="$(psql -d "$SOURCE_DB" -v ON_ERROR_STOP=1 -Atc "$count_query")"
echo "source pre-backup: stock=$stock_before outbox_rows=$outbox_before tables/fks/migrations=$source_counts"

pg_dump -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$SOURCE_DB" \
  --format=custom --no-owner --no-privileges --file="$TMP/store.dump"
test -s "$TMP/store.dump"
pg_restore -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$RESTORE_DB" \
  --exit-on-error --no-owner --no-privileges "$TMP/store.dump"

restored_stock="$(psql -d "$RESTORE_DB" -v ON_ERROR_STOP=1 -Atc 'SELECT stock FROM "Part" WHERE id = '\''restore-sentinel-part'\'';')"
restored_outbox="$(psql -d "$RESTORE_DB" -v ON_ERROR_STOP=1 -Atc 'SELECT count(*) FROM "AuditOutbox" WHERE id = '\''restore-sentinel-outbox'\'' AND status = '\''PENDING'\'';')"
restored_counts="$(psql -d "$RESTORE_DB" -v ON_ERROR_STOP=1 -Atc "$count_query")"
source_after="$(psql -d "$SOURCE_DB" -v ON_ERROR_STOP=1 -Atc 'SELECT stock FROM "Part" WHERE id = '\''restore-sentinel-part'\'';')"

[[ "$restored_stock" == "42" ]] || { echo "FAIL: restored sentinel expected 42, got $restored_stock"; exit 1; }
[[ "$restored_outbox" == "1" ]] || { echo "FAIL: restored Outbox sentinel missing or changed"; exit 1; }
[[ "$source_after" == "42" ]] || { echo "FAIL: source changed during restore (expected 42, got $source_after)"; exit 1; }
[[ "$restored_counts" == "$source_counts" ]] || { echo "FAIL: schema/migration counts differ source=$source_counts restore=$restored_counts"; exit 1; }

echo "restore: stock=$restored_stock outbox_rows=$restored_outbox tables/fks/migrations=$restored_counts"
echo "source after restore: stock=$source_after"
echo "VERDICT: PASS — non-zero sentinel, Outbox sentinel, schema counts, and migration history preserved on separate restore target."
