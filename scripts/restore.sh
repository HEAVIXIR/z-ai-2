#!/usr/bin/env bash
# HEAVIX — Restore databases from a backup directory
# Usage: bash scripts/restore.sh ./backups/20251010_143000
#
# WARNING: This will DROP and recreate the databases.
# Do NOT run on production without explicit authorization.

set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: bash scripts/restore.sh <backup-dir>"
  echo "Example: bash scripts/restore.sh ./backups/20251010_143000"
  exit 1
fi

BACKUP_DIR="$1"

if [ ! -d "$BACKUP_DIR" ]; then
  echo "ERROR: Backup directory not found: $BACKUP_DIR"
  exit 1
fi

if [ ! -f "$BACKUP_DIR/main.sql" ] || [ ! -f "$BACKUP_DIR/store.sql" ]; then
  echo "ERROR: Backup files not found in $BACKUP_DIR"
  echo "Expected: main.sql, store.sql"
  exit 1
fi

echo "→ Restoring from $BACKUP_DIR"
echo ""
echo "⚠️  WARNING: This will DROP and recreate both databases!"
echo "    Main DB:  $DB_NAME"
echo "    Store DB: $STORE_DB_NAME"
echo ""

# STEP 11.50 FIX: require explicit confirmation before destructive operation
read -p "Type 'CONFIRM' to proceed with database restore: " CONFIRMATION
if [ "$CONFIRMATION" != "CONFIRM" ]; then
  echo "Aborted. Database restore cancelled."
  exit 0
fi
echo ""

# Load env
if [ -f .env ]; then
  source .env
fi

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-heavix}"
DB_NAME="${DB_NAME:-heavix}"
DB_PASSWORD="${DB_PASSWORD:-heavix}"

STORE_DB_HOST="${STORE_DB_HOST:-localhost}"
STORE_DB_PORT="${STORE_DB_PORT:-5433}"
STORE_DB_USER="${STORE_DB_USER:-heavix}"
STORE_DB_NAME="${STORE_DB_NAME:-heavix_store}"
STORE_DB_PASSWORD="${STORE_DB_PASSWORD:-heavix}"

# Verify checksums
echo "  Verifying checksums..."
cd "$BACKUP_DIR"
if [ -f checksums.txt ]; then
  sha256sum -c checksums.txt || {
    echo "ERROR: Checksum verification failed!"
    exit 1
  }
fi
cd - > /dev/null

# Check if running in Docker
if docker ps --format '{{.Names}}' | grep -q "heavix-db"; then
  echo "  (Docker mode — using docker exec)"
  
  echo "  Restoring main database..."
  docker exec heavix-db-1 psql -U "$DB_USER" -d postgres -c "DROP DATABASE IF EXISTS \"$DB_NAME\";"
  docker exec heavix-db-1 psql -U "$DB_USER" -d postgres -c "CREATE DATABASE \"$DB_NAME\";"
  docker exec -i heavix-db-1 psql -U "$DB_USER" -d "$DB_NAME" < "$BACKUP_DIR/main.sql"
  
  echo "  Restoring store database..."
  docker exec heavix-store-db-1 psql -U "$STORE_DB_USER" -d postgres -c "DROP DATABASE IF EXISTS \"$STORE_DB_NAME\";"
  docker exec heavix-store-db-1 psql -U "$STORE_DB_USER" -d postgres -c "CREATE DATABASE \"$STORE_DB_NAME\";"
  docker exec -i heavix-store-db-1 psql -U "$STORE_DB_USER" -d "$STORE_DB_NAME" < "$BACKUP_DIR/store.sql"
else
  echo "  (Local mode — using psql)"
  
  echo "  Restoring main database..."
  PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "DROP DATABASE IF EXISTS \"$DB_NAME\";"
  PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "CREATE DATABASE \"$DB_NAME\";"
  PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" < "$BACKUP_DIR/main.sql"
  
  echo "  Restoring store database..."
  PGPASSWORD="$STORE_DB_PASSWORD" psql -h "$STORE_DB_HOST" -p "$STORE_DB_PORT" -U "$STORE_DB_USER" -d postgres -c "DROP DATABASE IF EXISTS \"$STORE_DB_NAME\";"
  PGPASSWORD="$STORE_DB_PASSWORD" psql -h "$STORE_DB_HOST" -p "$STORE_DB_PORT" -U "$STORE_DB_USER" -d postgres -c "CREATE DATABASE \"$STORE_DB_NAME\";"
  PGPASSWORD="$STORE_DB_PASSWORD" psql -h "$STORE_DB_HOST" -p "$STORE_DB_PORT" -U "$STORE_DB_USER" -d "$STORE_DB_NAME" < "$BACKUP_DIR/store.sql"
fi

echo "✓ Restore complete from $BACKUP_DIR"
echo ""
echo "Next steps:"
echo "  1. Run Prisma migrations: bunx prisma db push --schema=prisma/schema.prisma"
echo "  2. Run Prisma store migrations: bunx prisma db push --schema=prisma/store-schema.prisma"
echo "  3. Seed RBAC: bun run db:seed-rbac"
echo "  4. Start the application: bun run dev"
