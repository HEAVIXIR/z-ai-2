# HEAVIX — PostgreSQL Backup Guide

## Backup
```bash
export PG_HOME=/home/z/pg/usr/lib/postgresql/17/bin
export PGHOST=/home/z/pgdata/socket
BACKUP_DIR="/home/z/my-project/db/backups"
mkdir -p "$BACKUP_DIR"
BACKUP_FILE="$BACKUP_DIR/heavix-$(date +%Y%m%d-%H%M%S).sql"
"$PG_HOME/pg_dump" -h "$PGHOST" -U heavix -d heavix --clean --if-exists > "$BACKUP_FILE"
```

## Latest Backup
- File: db/backups/heavix-20260924-110650.sql
- Size: 616KB
- Tables: 120
- Data COPY statements: 120

## CRITICAL
- Backups are in db/backups/ which is EXCLUDED from Git (.gitignore)
- Backups are NOT in Git (binary, large, changes frequently)
- Download backups from the sandbox manually if needed
