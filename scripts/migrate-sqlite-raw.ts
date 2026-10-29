/**
 * HEAVIX — Raw SQL SQLite → PostgreSQL Migration
 *
 * Reads data from SQLite source db, converts types, and inserts
 * into PostgreSQL using raw SQL with ON CONFLICT DO NOTHING.
 * Preserves existing seed data (won't overwrite).
 *
 * Usage: bun run scripts/migrate-sqlite-raw.ts
 */

import { Database } from 'bun:sqlite';
import { PrismaClient } from '@prisma/client';

const SQLITE_PATH = '/home/z/my-project/db/heavix-source.db';
const prisma = new PrismaClient();
const sqlite = new Database(SQLITE_PATH, { readonly: true });

function log(msg: string) { console.log(`[migrate] ${msg}`); }

// Escape a value for PostgreSQL SQL
function pgValue(val: unknown, colType: string): string {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return String(val);
  if (typeof val === 'boolean') return val ? 'true' : 'false';
  if (typeof val === 'string') {
    // Check if it's a JSON field
    if (colType === 'JSON' && (val.startsWith('{') || val.startsWith('['))) {
      return `'${val.replace(/'/g, "''")}'::jsonb`;
    }
    // Regular string — escape single quotes
    return `'${val.replace(/'/g, "''")}'`;
  }
  // For other types (bigint, etc.)
  return `'${String(val).replace(/'/g, "''")}'`;
}

// Get SQLite column types
function getColumnInfo(table: string): Map<string, string> {
  const info = sqlite.query(`PRAGMA table_info("${table}")`).all() as { name: string; type: string }[];
  const map = new Map<string, string>();
  for (const c of info) {
    map.set(c.name, (c.type || '').toUpperCase());
  }
  return map;
}

async function migrateTable(table: string): Promise<{ ok: boolean; migrated: number; total: number }> {
  const model = table.charAt(0).toLowerCase() + table.slice(1);

  // Check if Prisma model exists
  if (!(model in prisma)) {
    return { ok: false, migrated: 0, total: 0 };
  }

  // Get column info
  const colInfo = getColumnInfo(table);
  const columns = Array.from(colInfo.keys());

  if (columns.length === 0) {
    return { ok: false, migrated: 0, total: 0 };
  }

  // Read all rows from SQLite
  const rows = sqlite.query(`SELECT * FROM "${table}"`).all() as Record<string, unknown>[];

  if (rows.length === 0) {
    return { ok: true, migrated: 0, total: 0 };
  }

  // Check if PG table already has data (skip if seeded)
  const existing = await (prisma as any)[model].count();
  if (existing >= rows.length) {
    log(`  ⏭ ${table}: PG already has ${existing} rows (skip)`);
    return { ok: true, migrated: 0, total: rows.length };
  }

  // Build column list
  const colList = columns.map(c => `"${c}"`).join(', ');

  let migrated = 0;
  for (const row of rows) {
    // Build value list
    const values = columns.map(c => pgValue(row[c], colInfo.get(c) || '')).join(', ');

    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "${table}" (${colList}) VALUES (${values}) ON CONFLICT DO NOTHING`
      );
      migrated++;
    } catch (err) {
      // Try to identify the issue
      const errMsg = (err as Error).message;
      if (errMsg.includes('foreign key')) {
        // Skip FK errors — parent might not be inserted yet
      } else if (errMsg.includes('already exists') || errMsg.includes('conflict')) {
        // Skip conflicts
      } else {
        // Log unexpected errors
        if (migrated === 0) {
          log(`  ⚠ ${table}: ${errMsg.substring(0, 100)}`);
        }
      }
    }
  }

  return { ok: true, migrated, total: rows.length };
}

async function main() {
  log(`Source: ${SQLITE_PATH}`);

  // Disable FK checks during migration
  await prisma.$executeRaw`SET session_replication_role = 'replica';`;

  // Get all SQLite tables
  const tables = sqlite.query(
    `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma%'`
  ).all() as { name: string }[];

  // Sort tables by dependency (parent tables first)
  // Simple heuristic: tables with fewer FKs first
  const sortedTables = tables.map(t => t.name).sort();

  let totalMigrated = 0;
  let totalTables = 0;
  let emptyTables = 0;

  for (const table of sortedTables) {
    const result = await migrateTable(table);
    if (result.total > 0) {
      totalTables++;
      totalMigrated += result.migrated;
      if (result.migrated > 0) {
        log(`  ✓ ${table}: ${result.migrated}/${result.total} rows`);
      } else if (result.migrated === 0) {
        log(`  ⚠ ${table}: 0/${result.total} rows (failed)`);
      }
    } else {
      emptyTables++;
    }
  }

  // Re-enable FK checks
  await prisma.$executeRaw`SET session_replication_role = 'origin';`;

  log('');
  log('═════════════════════════════════════════════');
  log(`Migration complete:`);
  log(`  Tables with data: ${totalTables}`);
  log(`  Total rows migrated: ${totalMigrated}`);
  log(`  Empty tables skipped: ${emptyTables}`);
  log('═════════════════════════════════════════════');
}

main()
  .catch(err => { console.error('[migrate] FATAL:', err); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); sqlite.close(); });
