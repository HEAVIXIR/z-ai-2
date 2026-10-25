#!/usr/bin/env bash
set -euo pipefail

# Disposable CI-only rehearsal: an existing schema is created from the
# committed baseline SQL, receives sentinel data, then is adopted with
# migrate resolve and advanced with migrate deploy. No production URL is used.
PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-postgres}"
PGPASSWORD="${PGPASSWORD:-postgres}"
export PGHOST PGPORT PGUSER PGPASSWORD

MAIN_BASELINE="20261025081255_init_postgresql_baseline"
STORE_BASELINE="0001_init_store_baseline"
MAIN_FRESH="heavix_migrate_main_proof"
STORE_FRESH="heavix_migrate_store_proof"
MAIN_EXISTING="heavix_main_adoption_proof"
STORE_EXISTING="heavix_store_adoption_proof"

MAIN_SQL="prisma/migrations/${MAIN_BASELINE}/migration.sql"
STORE_SQL="prisma/store/migrations/${STORE_BASELINE}/migration.sql"
test -s "$MAIN_SQL"
test -s "$STORE_SQL"

psql -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS $MAIN_EXISTING WITH (FORCE);"
psql -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS $STORE_EXISTING WITH (FORCE);"
psql -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE $MAIN_EXISTING;"
psql -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE $STORE_EXISTING;"

echo "── Main: materialize the committed baseline as an existing schema"
psql -d "$MAIN_EXISTING" -v ON_ERROR_STOP=1 -f "$MAIN_SQL"
psql -d "$MAIN_EXISTING" -v ON_ERROR_STOP=1 -c \
  'INSERT INTO "Brand" ("id","name","slug","createdAt","updatedAt") VALUES ('\''baseline-adoption-fixture'\'', '\''Baseline adoption fixture'\'', '\''baseline-adoption-fixture'\'', NOW(), NOW());'

echo "── Store: materialize the committed baseline as an existing schema"
psql -d "$STORE_EXISTING" -v ON_ERROR_STOP=1 -f "$STORE_SQL"
psql -d "$STORE_EXISTING" -v ON_ERROR_STOP=1 -c \
  'INSERT INTO "AdminUser" ("id","username","passwordHash","name","createdAt","updatedAt") VALUES ('\''baseline-adoption-fixture'\'', '\''baseline-adoption-fixture'\'', '\''ci-not-a-real-password'\'', '\''Baseline Fixture'\'', NOW(), NOW());'

echo "── Adopt existing schemas without dropping data"
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/$MAIN_EXISTING?schema=public" \
  bunx prisma migrate resolve --applied "$MAIN_BASELINE" --schema=prisma/schema.prisma
STORE_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/$STORE_EXISTING?schema=public" \
  bunx prisma migrate resolve --applied "$STORE_BASELINE" --schema=prisma/store/schema.prisma

echo "── Apply any subsequent reviewed migrations and verify status"
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/$MAIN_EXISTING?schema=public" \
  bunx prisma migrate deploy --schema=prisma/schema.prisma
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/$MAIN_EXISTING?schema=public" \
  bunx prisma migrate status --schema=prisma/schema.prisma
STORE_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/$STORE_EXISTING?schema=public" \
  bunx prisma migrate deploy --schema=prisma/store/schema.prisma
STORE_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/$STORE_EXISTING?schema=public" \
  bunx prisma migrate status --schema=prisma/store/schema.prisma

test "$(psql -d "$MAIN_EXISTING" -tAc 'SELECT count(*) FROM "Brand" WHERE "id" = '\''baseline-adoption-fixture'\'';')" = "1"
test "$(psql -d "$STORE_EXISTING" -tAc 'SELECT count(*) FROM "AdminUser" WHERE "id" = '\''baseline-adoption-fixture'\'';')" = "1"

# Compare public schema DDL against the fresh migrate-deploy databases. Exclude
# only Prisma's migration bookkeeping table. pg_dump adds randomized
# \\restrict/\\unrestrict psql safety tokens, so normalize only those
# non-DDL lines; all schema statements, tables, constraints and indexes remain
# part of the strict comparison.
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
for pair in "main:$MAIN_FRESH:$MAIN_EXISTING" "store:$STORE_FRESH:$STORE_EXISTING"; do
  IFS=: read -r name fresh existing <<<"$pair"
  pg_dump -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$fresh" \
    --schema-only --no-owner --no-privileges --exclude-table=public._prisma_migrations >"$TMP/$name-fresh.raw.sql"
  pg_dump -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$existing" \
    --schema-only --no-owner --no-privileges --exclude-table=public._prisma_migrations >"$TMP/$name-existing.raw.sql"
  sed -E '/^\\(un)?restrict[[:space:]]+/d' "$TMP/$name-fresh.raw.sql" >"$TMP/$name-fresh.sql"
  sed -E '/^\\(un)?restrict[[:space:]]+/d' "$TMP/$name-existing.raw.sql" >"$TMP/$name-existing.sql"
  diff -u "$TMP/$name-fresh.sql" "$TMP/$name-existing.sql"
  echo "✓ $name existing-schema adoption matches fresh migration schema; sentinel row survived."
done
