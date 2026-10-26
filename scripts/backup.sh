#!/usr/bin/env bash
# HEAVIX — paired PostgreSQL Main + Store backup.
# Requires explicit DB_* and STORE_DB_* settings in pg_dump mode.
# Output is published atomically only after both dumps and checksums succeed.
set -euo pipefail
umask 077

BACKUP_ROOT="${BACKUP_ROOT:-./backups}"
STAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_DIR="$BACKUP_ROOT/$STAMP"
WORK_DIR="$BACKUP_ROOT/.$STAMP.tmp.$$"

mkdir -p "$BACKUP_ROOT"
if [ -e "$BACKUP_DIR" ]; then
  echo "ERROR: backup destination already exists; refusing to overwrite."
  exit 1
fi
mkdir "$WORK_DIR"
cleanup() { rm -rf -- "$WORK_DIR"; }
trap cleanup EXIT

if [ "${BACKUP_DOCKER_MODE:-0}" = "1" ]; then
  : "${DB_USER:?DB_USER is required in Docker mode}"
  : "${DB_NAME:?DB_NAME is required in Docker mode}"
  : "${STORE_DB_USER:?STORE_DB_USER is required in Docker mode}"
  : "${STORE_DB_NAME:?STORE_DB_NAME is required in Docker mode}"
  MAIN_DB_CONTAINER="${MAIN_DB_CONTAINER:-heavix-db-1}"
  STORE_DB_CONTAINER="${STORE_DB_CONTAINER:-heavix-store-db-1}"
  docker exec "$MAIN_DB_CONTAINER" pg_dump -U "$DB_USER" "$DB_NAME" > "$WORK_DIR/main.sql"
  docker exec "$STORE_DB_CONTAINER" pg_dump -U "$STORE_DB_USER" "$STORE_DB_NAME" > "$WORK_DIR/store.sql"
else
  : "${DB_HOST:?DB_HOST is required}"
  : "${DB_PORT:?DB_PORT is required}"
  : "${DB_USER:?DB_USER is required}"
  : "${DB_NAME:?DB_NAME is required}"
  : "${DB_PASSWORD:?DB_PASSWORD is required}"
  : "${STORE_DB_HOST:?STORE_DB_HOST is required}"
  : "${STORE_DB_PORT:?STORE_DB_PORT is required}"
  : "${STORE_DB_USER:?STORE_DB_USER is required}"
  : "${STORE_DB_NAME:?STORE_DB_NAME is required}"
  : "${STORE_DB_PASSWORD:?STORE_DB_PASSWORD is required}"

  PGPASSWORD="$DB_PASSWORD" pg_dump --no-owner --no-privileges \
    -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$DB_NAME" > "$WORK_DIR/main.sql"
  PGPASSWORD="$STORE_DB_PASSWORD" pg_dump --no-owner --no-privileges \
    -h "$STORE_DB_HOST" -p "$STORE_DB_PORT" -U "$STORE_DB_USER" "$STORE_DB_NAME" > "$WORK_DIR/store.sql"
fi

# Empty/partial dumps must never be published as a successful paired backup.
test -s "$WORK_DIR/main.sql" || { echo "ERROR: Main database dump is empty."; exit 1; }
test -s "$WORK_DIR/store.sql" || { echo "ERROR: Store database dump is empty."; exit 1; }
(
  cd "$WORK_DIR"
  sha256sum main.sql store.sql > checksums.txt
  sha256sum -c checksums.txt >/dev/null
)

mv -- "$WORK_DIR" "$BACKUP_DIR"
trap - EXIT
echo "Backup complete: $BACKUP_DIR"
echo "Main DB bytes: $(wc -c < "$BACKUP_DIR/main.sql")"
echo "Store DB bytes: $(wc -c < "$BACKUP_DIR/store.sql")"
