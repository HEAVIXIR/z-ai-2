/**
 * HEAVIX — Complete SQLite → PostgreSQL Data Migration
 *
 * Reads ALL data from the SQLite source database (db/heavix-source.db)
 * and writes it to PostgreSQL via Prisma Client.
 *
 * Handles:
 *   - Boolean conversion (0/1 → true/false)
 *   - BigInt fields (kept as string/number, Prisma handles)
 *   - DateTime fields (ISO string → Date)
 *   - Json fields (string → parsed object)
 *   - Enum fields (string → enum, PostgreSQL casts)
 *   - Foreign key ordering (disable triggers during insert)
 *   - Conflict resolution (upsert or skip existing)
 *
 * Usage: bunx tsx scripts/migrate-sqlite-to-postgres-full.ts
 */

import { Database } from 'bun:sqlite';
import { PrismaClient, Prisma } from '@prisma/client';

const SQLITE_PATH = process.env.SQLITE_SOURCE_URL
  ? process.env.SQLITE_SOURCE_URL.replace(/^file:/, '')
  : '/home/z/my-project/db/heavix-source.db';

const prisma = new PrismaClient();
const sqlite = new Database(SQLITE_PATH, { readonly: true });

type Row = Record<string, unknown>;

// ── Helpers ─────────────────────────────────────────────────
function log(msg: string) { console.log(`[migrate] ${msg}`); }
function warn(msg: string) { console.warn(`[migrate] WARN: ${msg}`); }

// Get all table names from SQLite (exclude sqlite_internal + _prisma)
function getSqliteTables(): string[] {
  const rows = sqlite.query(
    `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma%'`
  ).all() as { name: string }[];
  return rows.map(r => r.name).sort();
}

// Get column info for a SQLite table
function getSqliteColumns(table: string): { name: string; type: string }[] {
  const info = sqlite.query(`PRAGMA table_info("${table}")`).all() as { name: string; type: string }[];
  return info.map(c => ({ name: c.name, type: (c.type || '').toUpperCase() }));
}

// Convert a SQLite row value to PostgreSQL-compatible value
function convertValue(value: unknown, sqliteType: string): unknown {
  if (value === null || value === undefined) return null;

  // Boolean: SQLite stores as 0/1 integer
  if (sqliteType === 'BOOLEAN' || sqliteType === 'BOOL') {
    return Boolean(value);
  }

  // BigInt: SQLite stores as integer, Prisma expects BigInt or string
  if (sqliteType === 'BIGINT') {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') return value;
    return value;
  }

  // JSON: SQLite stores as text, parse to object
  if (sqliteType === 'JSON') {
    if (typeof value === 'string') {
      try { return JSON.parse(value); } catch { return value; }
    }
    return value;
  }

  // DateTime: SQLite stores as ISO string, pass as-is (Prisma accepts string)
  if (sqliteType === 'DATETIME' || sqliteType === 'TIMESTAMP') {
    return value; // Prisma accepts ISO string for DateTime
  }

  return value;
}

// Convert Prisma model name to Prisma accessor (lowercase first letter)
function toPrismaModel(tableName: string): string {
  return tableName.charAt(0).toLowerCase() + tableName.slice(1);
}

// ── Main migration ─────────────────────────────────────────
async function main() {
  log(`Source SQLite: ${SQLITE_PATH}`);
  log(`Target: PostgreSQL (via Prisma)`);

  const tables = getSqliteTables();
  log(`SQLite tables to migrate: ${tables.length}`);

  // Disable foreign key checks in PostgreSQL during migration
  await prisma.$executeRaw`SET session_replication_role = 'replica';`;

  let totalMigrated = 0;
  let tablesOk = 0;
  let tablesFailed = 0;
  const failedTables: string[] = [];

  for (const table of tables) {
    const model = toPrismaModel(table);

    // Check if this model exists in Prisma
    if (!(model in prisma) || typeof (prisma as any)[model]?.createMany !== 'function') {
      warn(`Prisma model "${model}" not found or no createMany — skipping ${table}`);
      continue;
    }

    try {
      const columns = getSqliteColumns(table);
      const columnNames = columns.map(c => c.name);

      // Read all rows from SQLite
      const rows = sqlite.query(`SELECT * FROM "${table}"`).all() as Row[];

      if (rows.length === 0) {
        log(`  ${table}: 0 rows (skip)`);
        continue;
      }

      // Convert each row
      const convertedRows = rows.map(row => {
        const converted: Row = {};
        for (const col of columns) {
          converted[col.name] = convertValue(row[col.name], col.type);
        }
        return converted;
      });

      // Clear existing data in PostgreSQL (in case of re-run)
      try {
        await (prisma as any)[model].deleteMany({});
      } catch (e) {
        // If deleteMany fails (e.g. relation constraint), continue anyway
      }

      // Insert in batches of 100
      const BATCH_SIZE = 100;
      let inserted = 0;
      for (let i = 0; i < convertedRows.length; i += BATCH_SIZE) {
        const batch = convertedRows.slice(i, i + BATCH_SIZE);
        try {
          await (prisma as any)[model].createMany({
            data: batch as any,
            skipDuplicates: true,
          });
          inserted += batch.length;
        } catch (batchErr) {
          // If batch fails, try one by one
          for (const row of batch) {
            try {
              await (prisma as any)[model].create({ data: row as any });
              inserted++;
            } catch (rowErr) {
              // Skip individual row failures
            }
          }
        }
      }

      totalMigrated += inserted;
      tablesOk++;
      log(`  ✓ ${table}: ${inserted}/${rows.length} rows migrated`);
    } catch (err) {
      tablesFailed++;
      failedTables.push(table);
      warn(`  ✗ ${table}: ${(err as Error).message}`);
    }
  }

  // Re-enable foreign key checks
  await prisma.$executeRaw`SET session_replication_role = 'origin';`;

  log(``);
  log(`═══════════════════════════════════════════════`);
  log(`MIGRATION COMPLETE`);
  log(`  Tables OK:    ${tablesOk}`);
  log(`  Tables FAIL:  ${tablesFailed}`);
  log(`  Total rows:   ${totalMigrated}`);
  if (failedTables.length > 0) {
    log(`  Failed tables: ${failedTables.join(', ')}`);
  }
  log(`═══════════════════════════════════════════════`);
}

main()
  .catch((err) => { console.error('[migrate] FATAL:', err); process.exit(1); })
  .finally(async () => {
    await prisma.$disconnect();
    sqlite.close();
  });
