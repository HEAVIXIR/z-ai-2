#!/bin/bash
# PostgreSQL status check + database listing

set -e

PG_HOME=/home/z/pg/usr/lib/postgresql/17/bin
export PGDATA=/home/z/pgdata
export PGHOST=/home/z/pgdata/socket
export LD_LIBRARY_PATH=/home/z/pg/usr/lib/postgresql/17/lib:${LD_LIBRARY_PATH:-}
export PATH="$PG_HOME:$PATH"

echo "[pg-status] Cluster status:"
"$PG_HOME/pg_ctl" -D "$PGDATA" status
echo ""
echo "[pg-status] Databases:"
"$PG_HOME/psql" -h "$PGHOST" -U heavix -d heavix -c "\l" 2>&1 | head -15
echo ""
echo "[pg-status] Tables in heavix db:"
"$PG_HOME/psql" -h "$PGHOST" -U heavix -d heavix -c "\dt" 2>&1
