#!/bin/bash
# HEAVIX env loader - reads .env file and EXPORTS variables with high priority
# This overrides any system-set DATABASE_URL (e.g. the platform's default SQLite URL)
# Usage: ./scripts/with-env.sh <command...>

set -e

ENV_FILE="/home/z/my-project/.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "[with-env] Warning: $ENV_FILE not found, running with system env"
fi

# Read .env line by line and export each variable
# Comments (#) and empty lines are skipped
while IFS= read -r line || [ -n "$line" ]; do
  # Skip empty lines and comments
  case "$line" in
    ""|\#*) continue ;;
  esac
  # Only export lines that look like VAR=value
  if [[ "$line" =~ ^[A-Za-z_][A-Za-z0-9_]*= ]]; then
    # Strip any surrounding quotes from value
    var_name="${line%%=*}"
    var_value="${line#*=}"
    # Remove surrounding double quotes
    var_value="${var_value#\"}"
    var_value="${var_value%\"}"
    # Remove surrounding single quotes
    var_value="${var_value#\'}"
    var_value="${var_value%\'}"
    export "$var_name=$var_value"
  fi
done < "$ENV_FILE"

# Execute the rest of the command

# HARDCODED OVERRIDE: Platform's start.sh overwrites .env with SQLite URL.
# Always force PostgreSQL URL (user-space install at /home/z/pg).
export DATABASE_URL='postgresql://heavix@localhost:5432/heavix?schema=public'

exec "$@"
