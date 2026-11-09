#!/usr/bin/env bash
# HEAVIX — Restore paired Main + Store PostgreSQL backups.
# Usage: bash scripts/restore.sh ./backups/<timestamp>
#
# Destructive operation. Defaults to local/non-production targets only.
# Remote and Production restores require separate explicit opt-in gates.

set -euo pipefail
umask 077

if [ $# -lt 1 ]; then
  echo "Usage: bash scripts/restore.sh <backup-dir>"
  exit 1
fi

# Load local operator configuration before reading or displaying DB settings.
# Exported environment variables take precedence over values from .env.
load_env_preserving_process_overrides() {
  local name
  local -A saved=()
  local -a names=(
    DB_HOST DB_PORT DB_USER DB_NAME DB_PASSWORD
    STORE_DB_HOST STORE_DB_PORT STORE_DB_USER STORE_DB_NAME STORE_DB_PASSWORD
    MAIN_DB_CONTAINER STORE_DB_CONTAINER
    HEAVIX_ENV NODE_ENV HEAVIX_RESTORE_TARGET HEAVIX_RESTORE_MODE
    HEAVIX_ALLOW_PRODUCTION_RESTORE HEAVIX_ALLOW_REMOTE_RESTORE
    HEAVIX_RESTORE_TRAFFIC_DRAINED
  )

  # Capture explicitly supplied process environment before sourcing .env.
  # A local file must never silently redirect an operator's explicit target
  # or clear a destructive-operation safety gate.
  for name in "${names[@]}"; do
    if [[ -v "$name" ]]; then
      saved["$name"]="${!name}"
    fi
  done

  set -a
  # shellcheck disable=SC1091
  source .env
  set +a

  for name in "${!saved[@]}"; do
    printf -v "$name" '%s' "${saved[$name]}"
    export "$name"
  done
}

if [ -f .env ]; then
  load_env_preserving_process_overrides
fi

BACKUP_DIR="$1"
if [ ! -d "$BACKUP_DIR" ]; then
  echo "ERROR: Backup directory not found."
  exit 1
fi
for file in main.sql store.sql checksums.txt; do
  if [ ! -s "$BACKUP_DIR/$file" ]; then
    echo "ERROR: Required backup file is missing or empty: $file"
    exit 1
  fi
done

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-heavix}"
DB_NAME="${DB_NAME:-heavix}"
DB_PASSWORD="${DB_PASSWORD:-}"
STORE_DB_HOST="${STORE_DB_HOST:-localhost}"
STORE_DB_PORT="${STORE_DB_PORT:-5433}"
STORE_DB_USER="${STORE_DB_USER:-heavix}"
STORE_DB_NAME="${STORE_DB_NAME:-heavix_store}"
STORE_DB_PASSWORD="${STORE_DB_PASSWORD:-}"
MAIN_DB_CONTAINER="${MAIN_DB_CONTAINER:-heavix-db-1}"
STORE_DB_CONTAINER="${STORE_DB_CONTAINER:-heavix-store-db-1}"

# Keep SQL identifiers constrained; host/user/password values are never interpolated into SQL.
for name in "$DB_NAME" "$STORE_DB_NAME"; do
  if [[ ! "$name" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || (( ${#name} > 63 )); then
    echo "ERROR: Unsafe database identifier; use 1-63 ASCII letters, digits, and underscores, starting with a letter or underscore."
    exit 1
  fi
done

for port in "$DB_PORT" "$STORE_DB_PORT"; do
  if [[ ! "$port" =~ ^[0-9]{1,5}$ ]] || (( 10#$port < 1 || 10#$port > 65535 )); then
    echo "ERROR: Database ports must be integers between 1 and 65535."
    exit 1
  fi
done

# Restore transport is explicit. Never infer Docker mode from whichever
# containers happen to be running; that could silently override DB_HOST and
# redirect a requested remote restore into a local container (or vice versa).
RESTORE_MODE="${HEAVIX_RESTORE_MODE:-direct}"
DOCKER_MODE=0
case "$RESTORE_MODE" in
  direct)
    DOCKER_MODE=0
    ;;
  docker)
    if ! command -v docker >/dev/null 2>&1; then
      echo "ERROR: HEAVIX_RESTORE_MODE=docker requires the Docker CLI."
      exit 1
    fi
    DOCKER_MODE=1
    ;;
  *)
    echo "ERROR: HEAVIX_RESTORE_MODE must be either direct or docker."
    exit 1
    ;;
esac

# Docker contexts may target a remote daemon even when the database container
# names look local. Refuse remote Docker endpoints; restore is not allowed to
# bypass the explicit remote-target gate merely by using Docker.
if [ "$DOCKER_MODE" -eq 1 ]; then
  if [ -n "${DOCKER_CONTEXT:-}" ]; then
    DOCKER_ENDPOINT="$(docker context inspect "$DOCKER_CONTEXT" --format '{{(index .Endpoints "docker").Host}}' 2>/dev/null || true)"
  elif [ -n "${DOCKER_HOST:-}" ]; then
    DOCKER_ENDPOINT="$DOCKER_HOST"
  else
    DOCKER_CONTEXT_NAME="$(docker context show 2>/dev/null || true)"
    DOCKER_ENDPOINT=""
    if [ -n "$DOCKER_CONTEXT_NAME" ]; then
      DOCKER_ENDPOINT="$(docker context inspect "$DOCKER_CONTEXT_NAME" --format '{{(index .Endpoints "docker").Host}}' 2>/dev/null || true)"
    fi
  fi

  if [[ "$DOCKER_ENDPOINT" != unix://* ]]; then
    echo "BLOCKED: Docker restore requires a local Unix-socket Docker endpoint."
    exit 1
  fi
fi

is_local_host() {
  case "$1" in
    localhost|127.0.0.1|::1) return 0 ;;
    *) return 1 ;;
  esac
}

IS_PRODUCTION=0
if [[ "${HEAVIX_ENV:-}" == "production" || "${NODE_ENV:-}" == "production" || "${HEAVIX_RESTORE_TARGET:-}" == "PRODUCTION" ]]; then
  IS_PRODUCTION=1
fi

if [ "$IS_PRODUCTION" -eq 1 ] && [ "${HEAVIX_ALLOW_PRODUCTION_RESTORE:-}" != "I_UNDERSTAND_PRODUCTION_DATA_LOSS" ]; then
  echo "BLOCKED: Production restore requires HEAVIX_ALLOW_PRODUCTION_RESTORE=I_UNDERSTAND_PRODUCTION_DATA_LOSS."
  exit 1
fi

if [ "$DB_HOST" = "$STORE_DB_HOST" ] && [ "$DB_PORT" = "$STORE_DB_PORT" ] && [ "$DB_NAME" = "$STORE_DB_NAME" ]; then
  echo "ERROR: Main and Store restore targets must be distinct databases."
  exit 1
fi

if [ "$DOCKER_MODE" -eq 1 ]; then
  if [ "$MAIN_DB_CONTAINER" = "$STORE_DB_CONTAINER" ] && [ "$DB_NAME" = "$STORE_DB_NAME" ]; then
    echo "ERROR: Main and Store Docker restore targets must be distinct."
    exit 1
  fi
else
  if [ -z "$DB_PASSWORD" ] || [ -z "$STORE_DB_PASSWORD" ]; then
    echo "ERROR: DB_PASSWORD and STORE_DB_PASSWORD are required for non-Docker restore."
    exit 1
  fi
  if { ! is_local_host "$DB_HOST" || ! is_local_host "$STORE_DB_HOST"; }; then
    if [ "${HEAVIX_ALLOW_REMOTE_RESTORE:-}" != "1" ]; then
      echo "BLOCKED: remote restore requires HEAVIX_ALLOW_REMOTE_RESTORE=1."
      exit 1
    fi
    if [ "$IS_PRODUCTION" -eq 0 ] && [ "${HEAVIX_RESTORE_TARGET:-}" != "NON_PRODUCTION" ]; then
      echo "BLOCKED: remote non-production restore requires HEAVIX_RESTORE_TARGET=NON_PRODUCTION."
      exit 1
    fi
    if [ "$IS_PRODUCTION" -eq 1 ] && [ "${HEAVIX_ALLOW_PRODUCTION_RESTORE:-}" != "I_UNDERSTAND_PRODUCTION_DATA_LOSS" ]; then
      echo "BLOCKED: remote Production restore requires the explicit Production restore override."
      exit 1
    fi
  fi
fi

# The operator must stop/drain app traffic before databases are dropped.
if [ "${HEAVIX_RESTORE_TRAFFIC_DRAINED:-}" != "1" ]; then
  echo "BLOCKED: stop application traffic, then set HEAVIX_RESTORE_TRAFFIC_DRAINED=1."
  exit 1
fi

# The manifest must describe exactly the two expected dumps. sha256sum
# validates file bytes, but by itself it would also accept extra paths.
if ! awk '
  BEGIN {
    expected["main.sql"] = 0
    expected["store.sql"] = 0
    count = 0
    invalid = 0
  }
  NF != 2 { invalid = 1; next }
  {
    filename = $2
    sub(/^\*/, "", filename)
    if (!(filename in expected) || expected[filename] != 0) {
      invalid = 1
    } else {
      expected[filename] = 1
    }
    count++
  }
  END {
    if (invalid || count != 2 || expected["main.sql"] != 1 || expected["store.sql"] != 1) {
      exit 1
    }
  }
' "$BACKUP_DIR/checksums.txt"; then
  echo "Checksum manifest must contain exactly main.sql and store.sql"
  exit 1
fi

# Verify the complete paired backup before asking for destructive confirmation.
(
  cd "$BACKUP_DIR"
  sha256sum --strict -c checksums.txt
)

EXPECTED_CONFIRMATION="RESTORE $DB_HOST/$DB_NAME AND $STORE_DB_HOST/$STORE_DB_NAME"
if [ "$DOCKER_MODE" -eq 1 ]; then
  EXPECTED_CONFIRMATION="RESTORE docker:$MAIN_DB_CONTAINER/$DB_NAME AND docker:$STORE_DB_CONTAINER/$STORE_DB_NAME"
fi

echo "Restore target:"
if [ "$DOCKER_MODE" -eq 1 ]; then
  echo "  Main:  Docker container $MAIN_DB_CONTAINER / database $DB_NAME"
  echo "  Store: Docker container $STORE_DB_CONTAINER / database $STORE_DB_NAME"
else
  echo "  Main:  $DB_HOST:$DB_PORT / database $DB_NAME"
  echo "  Store: $STORE_DB_HOST:$STORE_DB_PORT / database $STORE_DB_NAME"
fi
echo "Backup: $BACKUP_DIR"
echo "WARNING: Both target databases will be dropped and recreated."
read -r -p "Type exactly '$EXPECTED_CONFIRMATION' to proceed: " CONFIRMATION
if [ "$CONFIRMATION" != "$EXPECTED_CONFIRMATION" ]; then
  echo "Aborted. Database restore cancelled."
  exit 1
fi

if [ "$DOCKER_MODE" -eq 1 ]; then
  docker inspect "$MAIN_DB_CONTAINER" >/dev/null
  docker inspect "$STORE_DB_CONTAINER" >/dev/null

  docker exec "$MAIN_DB_CONTAINER" psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d postgres \
    -c "DROP DATABASE IF EXISTS \"$DB_NAME\" WITH (FORCE);"
  docker exec "$MAIN_DB_CONTAINER" psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d postgres \
    -c "CREATE DATABASE \"$DB_NAME\";"
  docker exec -i "$MAIN_DB_CONTAINER" psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$DB_NAME" \
    < "$BACKUP_DIR/main.sql"

  docker exec "$STORE_DB_CONTAINER" psql -v ON_ERROR_STOP=1 -U "$STORE_DB_USER" -d postgres \
    -c "DROP DATABASE IF EXISTS \"$STORE_DB_NAME\" WITH (FORCE);"
  docker exec "$STORE_DB_CONTAINER" psql -v ON_ERROR_STOP=1 -U "$STORE_DB_USER" -d postgres \
    -c "CREATE DATABASE \"$STORE_DB_NAME\";"
  docker exec -i "$STORE_DB_CONTAINER" psql -v ON_ERROR_STOP=1 -U "$STORE_DB_USER" -d "$STORE_DB_NAME" \
    < "$BACKUP_DIR/store.sql"
else
  PGPASSWORD="$DB_PASSWORD" psql -v ON_ERROR_STOP=1 -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres \
    -c "DROP DATABASE IF EXISTS \"$DB_NAME\" WITH (FORCE);"
  PGPASSWORD="$DB_PASSWORD" psql -v ON_ERROR_STOP=1 -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres \
    -c "CREATE DATABASE \"$DB_NAME\";"
  PGPASSWORD="$DB_PASSWORD" psql -v ON_ERROR_STOP=1 -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
    < "$BACKUP_DIR/main.sql"

  PGPASSWORD="$STORE_DB_PASSWORD" psql -v ON_ERROR_STOP=1 -h "$STORE_DB_HOST" -p "$STORE_DB_PORT" -U "$STORE_DB_USER" -d postgres \
    -c "DROP DATABASE IF EXISTS \"$STORE_DB_NAME\" WITH (FORCE);"
  PGPASSWORD="$STORE_DB_PASSWORD" psql -v ON_ERROR_STOP=1 -h "$STORE_DB_HOST" -p "$STORE_DB_PORT" -U "$STORE_DB_USER" -d postgres \
    -c "CREATE DATABASE \"$STORE_DB_NAME\";"
  PGPASSWORD="$STORE_DB_PASSWORD" psql -v ON_ERROR_STOP=1 -h "$STORE_DB_HOST" -p "$STORE_DB_PORT" -U "$STORE_DB_USER" -d "$STORE_DB_NAME" \
    < "$BACKUP_DIR/store.sql"
fi

echo "Restore complete from $BACKUP_DIR"
echo "Next steps (review before executing):"
echo "  1. Verify both restored database identities and critical row counts."
echo "  2. Run: bunx prisma migrate status --schema=prisma/schema.prisma"
echo "  3. Run: bunx prisma migrate status --schema=prisma/store/schema.prisma"
echo "  4. Apply only reviewed pending migrations with prisma migrate deploy."
echo "  5. Run application smoke tests before allowing traffic."
