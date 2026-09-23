#!/bin/bash
# PostgreSQL user-space shutdown script

set -e

PG_HOME=/home/z/pg/usr/lib/postgresql/17/bin
export PGDATA=/home/z/pgdata
export LD_LIBRARY_PATH=/home/z/pg/usr/lib/postgresql/17/lib:${LD_LIBRARY_PATH:-}
export PATH="$PG_HOME:$PATH"

echo "[pg-stop] Stopping PostgreSQL server..."
"$PG_HOME/pg_ctl" -D "$PGDATA" -w stop
echo "[pg-stop] PostgreSQL stopped."
