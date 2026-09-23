#!/bin/bash
# PostgreSQL user-space startup script
# This script starts the user-space PostgreSQL server used by HEAVIX
# PostgreSQL is installed in /home/z/pg (extracted from .deb without sudo)

set -e

PG_HOME=/home/z/pg/usr/lib/postgresql/17/bin
export PGDATA=/home/z/pgdata
export PGHOST=/home/z/pgdata/socket
export LD_LIBRARY_PATH=/home/z/pg/usr/lib/postgresql/17/lib:${LD_LIBRARY_PATH:-}
export PATH="$PG_HOME:$PATH"

# If server is already running, just exit
if "$PG_HOME/pg_ctl" -D "$PGDATA" status >/dev/null 2>&1; then
  echo "[pg-start] PostgreSQL is already running."
  "$PG_HOME/pg_ctl" -D "$PGDATA" status
  exit 0
fi

echo "[pg-start] Starting PostgreSQL 17 server..."
"$PG_HOME/pg_ctl" -D "$PGDATA" -l /home/z/pgdata/postgresql.log -w start
"$PG_HOME/pg_ctl" -D "$PGDATA" status
