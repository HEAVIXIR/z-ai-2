# HEAVIX — PostgreSQL Restore Guide

## Full Restore (after data loss)
```bash
# 1. Ensure PostgreSQL is running (see POSTGRES-SETUP.md)
# 2. Drop and recreate database
psql -h /home/z/pgdata/socket -U heavix -d postgres -c "DROP DATABASE IF EXISTS heavix;"
psql -h /home/z/pgdata/socket -U heavix -d postgres -c "CREATE DATABASE heavix;"

# 3. Restore from backup
BACKUP_FILE="db/backups/heavix-20260924-110650.sql"
psql -h /home/z/pgdata/socket -U heavix -d heavix < "$BACKUP_FILE"

# 4. Verify
psql -h /home/z/pgdata/socket -U heavix -d heavix -c "SELECT count(*) FROM \"Brand\";"
```

## Partial Restore (specific table)
```bash
# Extract specific table from backup
pg_restore -t "Brand" -d heavix < backup.sql
```
