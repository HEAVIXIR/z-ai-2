# HEAVIX — PostgreSQL Setup Guide

## Architecture
- PostgreSQL 17.11 (user-space install, no sudo)
- Installed at: /home/z/pg (extracted from .deb)
- Data directory: /home/z/pgdata
- Socket: /home/z/pgdata/socket
- Port: 5432
- Database: heavix
- User: heavix (trust auth)

## Starting PostgreSQL
```bash
# Ensure binaries exist (may need re-extraction after platform reset)
if [ ! -f /home/z/pg/usr/lib/postgresql/17/bin/pg_ctl ]; then
  cd /home/z/my-project
  for deb in pgsrc/*.deb; do dpkg-deb -x "$deb" /home/z/pg; done
fi

# Start server
export PGDATA=/home/z/pgdata
export LD_LIBRARY_PATH=/home/z/pg/usr/lib/postgresql/17/lib
/home/z/pg/usr/lib/postgresql/17/bin/pg_ctl -D $PGDATA -l /home/z/pgdata/postgresql.log start

# Create database (if missing)
/home/z/pg/usr/lib/postgresql/17/bin/psql -h /home/z/pgdata/socket -U heavix -d postgres -c "CREATE DATABASE heavix;" 2>/dev/null || true
```

## Schema + Seeds
```bash
# Push schema (creates all tables)
DATABASE_URL=postgresql://heavix@localhost:5432/heavix?schema=public bunx prisma db push --accept-data-loss

# Run seeds
DATABASE_URL=postgresql://heavix@localhost:5432/heavix?schema=public bunx tsx prisma/seed-taxonomy-v11.ts
DATABASE_URL=postgresql://heavix@localhost:5432/heavix?schema=public bunx tsx prisma/seed-brands-a.ts
DATABASE_URL=postgresql://heavix@localhost:5432/heavix?schema=public bunx tsx prisma/seed-brands-b.ts
DATABASE_URL=postgresql://heavix@localhost:5432/heavix?schema=public bunx tsx prisma/seed-rbac.ts
DATABASE_URL=postgresql://heavix@localhost:5432/heavix?schema=public bunx tsx prisma/seed-permission-matrix.ts
DATABASE_URL=postgresql://heavix@localhost:5432/heavix?schema=public bunx tsx prisma/seed-services.ts
DATABASE_URL=postgresql://heavix@localhost:5432/heavix?schema=public bunx tsx prisma/seed-site-stats.ts
DATABASE_URL=postgresql://heavix@localhost:5432/heavix?schema=public bunx tsx prisma/seed-ai-policies.ts
DATABASE_URL=postgresql://heavix@localhost:5432/heavix?schema=public bunx tsx prisma/seed-admin-navigation.ts
DATABASE_URL=postgresql://heavix@localhost:5432/heavix?schema=public bunx tsx prisma/seed-attributes.ts
DATABASE_URL=postgresql://heavix@localhost:5432/heavix?schema=public bunx tsx prisma/seed.ts
```

## Starting Next.js
```bash
# CRITICAL: Platform overwrites .env with SQLite URL.
# The dev script in package.json has hardcoded DATABASE_URL override.
# To start manually:
export DATABASE_URL=postgresql://heavix@localhost:5432/heavix?schema=public
export LD_LIBRARY_PATH=/home/z/pg/usr/lib/postgresql/17/lib
node_modules/.bin/next dev -p 3000
```

## Known Issues
1. Platform's /start.sh overwrites .env with SQLite URL — dev script has hardcoded override
2. PostgreSQL binaries at /home/z/pg may be wiped on platform reset — .deb files in pgsrc/ for re-extraction
3. Data directory at /home/z/pgdata may be wiped — backup in db/backups/
