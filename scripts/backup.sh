# HEAVIX — Backup and Restore Scripts
# 
# These scripts provide database backup and restore for both
# PostgreSQL instances (main + store).
#
# Usage:
#   Backup:  bash scripts/backup.sh
#   Restore: bash scripts/restore.sh <backup-dir>
#
# Prerequisites:
#   - PostgreSQL client tools (pg_dump, pg_restore, psql)
#   - Docker (if databases run in Docker)
#   - Write access to ./backups/ directory

# ────────────────────────────────────────────────────────────
# scripts/backup.sh — Create timestamped backup of both databases
# ────────────────────────────────────────────────────────────

#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="./backups/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

echo "→ Creating backup in $BACKUP_DIR"

# Main database
echo "  Backing up main database..."
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

# Check if running in Docker
if docker ps --format '{{.Names}}' | grep -q "heavix-db"; then
  echo "  (Docker mode — using docker exec)"
  docker exec heavix-db-1 pg_dump -U "$DB_USER" "$DB_NAME" > "$BACKUP_DIR/main.sql"
  docker exec heavix-store-db-1 pg_dump -U "$STORE_DB_USER" "$STORE_DB_NAME" > "$BACKUP_DIR/store.sql"
else
  echo "  (Local mode — using pg_dump)"
  PGPASSWORD="$DB_PASSWORD" pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$DB_NAME" > "$BACKUP_DIR/main.sql"
  PGPASSWORD="$STORE_DB_PASSWORD" pg_dump -h "$STORE_DB_HOST" -p "$STORE_DB_PORT" -U "$STORE_DB_USER" "$STORE_DB_NAME" > "$BACKUP_DIR/store.sql"
fi

# Create checksum
cd "$BACKUP_DIR"
sha256sum main.sql store.sql > checksums.txt
cd - > /dev/null

echo "✓ Backup complete: $BACKUP_DIR"
echo "  Main DB:  $(wc -c < "$BACKUP_DIR/main.sql") bytes"
echo "  Store DB: $(wc -c < "$BACKUP_DIR/store.sql") bytes"
echo "  Checksums: $BACKUP_DIR/checksums.txt"

# ────────────────────────────────────────────────────────────
# scripts/restore.sh — Restore from a backup directory
# Usage: bash scripts/restore.sh ./backups/20251010_143000
# ────────────────────────────────────────────────────────────
