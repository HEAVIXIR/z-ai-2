/**
 * HEAVIX — PostgreSQL Data Reconciliation Migration
 *
 * STEP 01: Properly migrates ALL data from SQLite source to PostgreSQL
 * with correct type handling based on PostgreSQL column types.
 *
 * Key fix: queries information_schema.columns to get the EXACT
 * PostgreSQL type for each column, then converts values accordingly
 * and uses parameterized queries ($1, $2, ...) so PostgreSQL handles
 * type casting automatically.
 *
 * Type handling:
 *   boolean     → Boolean(0/1)
 *   bigint      → BigInt(value) or pass as string
 *   jsonb/json  → string (PostgreSQL casts automatically)
 *   timestamp   → string ISO format (PostgreSQL casts automatically)
 *   enum (USER-DEFINED) → string (PostgreSQL casts automatically)
 *   text/varchar → string
 *   integer     → number
 *   double/real → number
 *
 * Usage: bun run scripts/migrate-pg-reconcile.ts
 */

import { Database } from 'bun:sqlite';
import { PrismaClient } from '@prisma/client';

const SQLITE_PATH = '/home/z/my-project/db/heavix-source.db';
const prisma = new PrismaClient();
const sqlite = new Database(SQLITE_PATH, { readonly: true });

function log(msg: string) { console.log(msg); }

// ── Get PostgreSQL column types from information_schema ────
async function getPGColumnTypes(tableName: string): Promise<Map<string, string>> {
  const result = await prisma.$queryRaw<{ column_name: string; data_type: string; udt_name: string }[]>`
    SELECT column_name, data_type, udt_name::text
    FROM information_schema.columns
    WHERE table_name = ${tableName} AND table_schema = 'public'
    ORDER BY ordinal_position
  `;
  const map = new Map<string, string>();
  for (const col of result) {
    // For USER-DEFINED (enums), use udt_name; otherwise use data_type
    if (col.data_type === 'USER-DEFINED') {
      map.set(col.column_name, 'enum');
    } else {
      map.set(col.column_name, col.data_type);
    }
  }
  return map;
}

// ── Convert a SQLite value based on PostgreSQL column type ──
function convertValue(value: unknown, pgType: string): unknown {
  if (value === null || value === undefined) return null;

  switch (pgType) {
    case 'boolean':
      // SQLite stores as 0/1 — keep as 0/1, let PG cast handle it
      if (typeof value === 'number') return value; // 0 or 1
      if (typeof value === 'string') return value === '1' ? 1 : 0;
      return value ? 1 : 0;

    case 'bigint':
    case 'int8':
      // Keep as number — PostgreSQL parameterized query handles bigint
      if (typeof value === 'string') return parseInt(value, 10);
      return value;

    case 'jsonb':
    case 'json':
      // Keep as string — PostgreSQL casts parameterized string to jsonb
      if (typeof value === 'string') return value;
      return JSON.stringify(value);

    case 'timestamp without time zone':
    case 'timestamp with time zone':
    case 'timestamp':
      // SQLite stores DateTime as epoch (int) or ISO string
      // If number, convert to ISO string for PostgreSQL
      if (typeof value === 'number') {
        // Epoch ms if > 1e12, epoch seconds if < 1e12
        const ms = value > 1e12 ? value : value * 1000;
        return new Date(ms).toISOString();
      }
      return String(value); // already ISO string


    case 'enum':
      // Keep as string — PostgreSQL casts parameterized string to enum
      return value;

    case 'text':
    case 'character varying':
    case 'character':
      return String(value);

    case 'integer':
    case 'int4':
    case 'int2':
    case 'smallint':
      if (typeof value === 'string') return parseInt(value, 10);
      return value;

    case 'double precision':
    case 'real':
    case 'numeric':
      if (typeof value === 'string') return parseFloat(value);
      return value;

    default:
      // For any other type, pass as-is
      return value;
  }
}

// ── Migrate a single table ──────────────────────────────────
async function migrateTable(tableName: string): Promise<{ migrated: number; total: number; skipped: boolean }> {
  const model = tableName.charAt(0).toLowerCase() + tableName.slice(1);

  // Check if Prisma model exists
  if (!(model in prisma) || typeof (prisma as any)[model]?.count !== 'function') {
    return { migrated: 0, total: 0, skipped: true };
  }

  // Read all rows from SQLite
  const rows = sqlite.query(`SELECT * FROM "${tableName}"`).all() as Record<string, unknown>[];

  if (rows.length === 0) {
    return { migrated: 0, total: 0, skipped: true };
  }

  // Get PostgreSQL column types
  const pgTypes = await getPGColumnTypes(tableName);
  if (pgTypes.size === 0) {
    log(`  ⚠ ${tableName}: no PG columns found (table might not exist)`);
    return { migrated: 0, total: rows.length, skipped: true };
  }

  // Get SQLite column names (in order)
  const sqliteInfo = sqlite.query(`PRAGMA table_info("${tableName}")`).all() as { name: string }[];
  const columns = sqliteInfo.map(c => c.name).filter(c => pgTypes.has(c));

  if (columns.length === 0) {
    log(`  ⚠ ${tableName}: no matching columns between SQLite and PG`);
    return { migrated: 0, total: rows.length, skipped: true };
  }

  // Check if PG already has enough data
  const pgCount = await (prisma as any)[model].count();
  if (pgCount >= rows.length) {
    return { migrated: 0, total: rows.length, skipped: true };
  }

  // Build INSERT with parameterized placeholders + type casts
  // For timestamp columns: $1::timestamp (SQLite stores as text, PG needs cast)
  // For boolean: $1::boolean (SQLite 0/1 → PG true/false)
  // For jsonb: $1::jsonb
  // For enum: $1::"EnumType"
  const colList = columns.map(c => `"${c}"`).join(', ');
  const placeholders = columns.map((c, i) => {
    const pgType = pgTypes.get(c) || 'text';
    const param = `$${i + 1}`;
    switch (pgType) {
      case 'timestamp without time zone':
      case 'timestamp with time zone':
      case 'timestamp':
        // Cast to text first, then timestamp (SQLite may store as int epoch)
        return `${param}::text::timestamp`;
      case 'boolean':
        // Cast to text first, then boolean (bigint→boolean fails directly)
        return `${param}::text::boolean`;
      case 'jsonb':
      case 'json':
        return `${param}::text::jsonb`;
      case 'bigint':
      case 'int8':
        return `${param}::text::bigint`;
      case 'double precision':
      case 'real':
      case 'numeric':
        return `${param}::text::numeric`;
      case 'integer':
      case 'int4':
        return `${param}::text::integer`;
      case 'smallint':
      case 'int2':
        return `${param}::text::smallint`;
      case 'text':
      case 'character varying':
      case 'character':
        return `${param}::text`;
      default:
        // For enum (USER-DEFINED) — cast to text, PG casts text→enum
        return `${param}::text`;
    }
  }).join(', ');
  const insertSql = `INSERT INTO "${tableName}" (${colList}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;

  let migrated = 0;
  let firstError = '';

  for (const row of rows) {
    // Convert values based on PG column types
    const params = columns.map(c => convertValue(row[c], pgTypes.get(c) || 'text'));

    try {
      await prisma.$executeRawUnsafe(insertSql, ...params);
      migrated++;
    } catch (err) {
      if (!firstError) {
        firstError = (err as Error).message.substring(0, 150);
      }
      // Continue — don't stop on individual row errors
    }
  }

  if (migrated === 0 && rows.length > 0 && firstError) {
    log(`  ⚠ ${tableName}: 0/${rows.length} — ${firstError}`);
  } else if (migrated < rows.length) {
    log(`  ~ ${tableName}: ${migrated}/${rows.length} (${rows.length - migrated} skipped)`);
  } else if (migrated > 0) {
    log(`  ✓ ${tableName}: ${migrated}/${rows.length}`);
  }

  return { migrated, total: rows.length, skipped: false };
}

// ── Main ────────────────────────────────────────────────────
async function main() {
  log('═══════════════════════════════════════════════════════');
  log('HEAVIX — PostgreSQL Data Reconciliation (STEP 01)');
  log('═══════════════════════════════════════════════════════');
  log('');

  // Disable FK checks during migration
  await prisma.$executeRaw`SET session_replication_role = 'replica';`;

  // Get all SQLite tables
  const tables = sqlite.query(
    `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma%' ORDER BY name`
  ).all() as { name: string }[];

  log(`Tables to process: ${tables.length}`);
  log('');

  let totalMigrated = 0;
  let tablesWithData = 0;
  let tablesSkipped = 0;
  let tablesEmpty = 0;

  for (const { name } of tables) {
    const result = await migrateTable(name);
    if (result.skipped) {
      if (result.total === 0) tablesEmpty++;
      else tablesSkipped++;
    } else {
      tablesWithData++;
      totalMigrated += result.migrated;
    }
  }

  // Re-enable FK checks
  await prisma.$executeRaw`SET session_replication_role = 'origin';`;

  log('');
  log('═══════════════════════════════════════════════════════');
  log('RECONCILIATION COMPLETE');
  log(`  Tables with new data:  ${tablesWithData}`);
  log(`  Tables skipped (full): ${tablesSkipped}`);
  log(`  Tables empty in SQLite: ${tablesEmpty}`);
  log(`  Total rows migrated:    ${totalMigrated}`);
  log('═══════════════════════════════════════════════════════');
}

main()
  .catch(err => { console.error('[reconcile] FATAL:', err); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); sqlite.close(); });
