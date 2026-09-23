/**
 * HEAVIX - SQLite to PostgreSQL Migration Script
 *
 * This script reads all data from the source SQLite database and writes it
 * to the target PostgreSQL database using Prisma Client.
 *
 * Usage:
 *   bun run scripts/migrate-sqlite-to-postgres.ts
 *
 * Source: SQLITE_SOURCE_URL (defaults to db/custom.db)
 * Target: DATABASE_URL (must point to PostgreSQL)
 *
 * The script is idempotent-ish: it uses upserts so re-running won't duplicate rows
 * (assuming primary keys are stable across both DBs).
 */

import { Database } from 'bun:sqlite';
import { PrismaClient } from '@prisma/client';
import { existsSync } from 'node:fs';
import path from 'node:path';

// ---- Configuration ---------------------------------------------------------
const SQLITE_PATH = process.env.SQLITE_SOURCE_URL
  ? process.env.SQLITE_SOURCE_URL.replace(/^file:/, '')
  : '/home/z/my-project/db/custom.db';

const TABLES_TO_MIGRATE = ['User', 'Post'] as const;

// ---- Helpers --------------------------------------------------------------
function log(msg: string) {
  console.log(`[migrate] ${msg}`);
}

function warn(msg: string) {
  console.warn(`[migrate] WARN: ${msg}`);
}

// ---- Main migration -------------------------------------------------------
async function main() {
  log(`Source SQLite: ${SQLITE_PATH}`);
  if (!existsSync(SQLITE_PATH)) {
    warn(`SQLite file not found at ${SQLITE_PATH} - nothing to migrate.`);
    log('Creating empty PostgreSQL schema only (already done via db:push).');
    process.exit(0);
  }

  log(`Opening SQLite database...`);
  const sqliteDb = new Database(SQLITE_PATH, { readonly: true });

  // Inspect what tables actually exist in the SQLite db
  const sqliteTables = sqliteDb
    .query(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma%'`)
    .all() as { name: string }[];
  log(`SQLite tables found: ${sqliteTables.map(t => t.name).join(', ') || '(none)'}`);

  log(`Connecting to PostgreSQL via Prisma...`);
  const prisma = new PrismaClient();

  let totalMigrated = 0;

  for (const table of TABLES_TO_MIGRATE) {
    if (!sqliteTables.some(t => t.name === table)) {
      log(`Table ${table} not present in SQLite - skipping.`);
      continue;
    }

    // Read all rows from SQLite
    const rows = sqliteDb.query(`SELECT * FROM "${table}"`).all() as Record<string, unknown>[];
    log(`Read ${rows.length} row(s) from SQLite.${table}`);

    if (rows.length === 0) {
      continue;
    }

    // Write to PostgreSQL using upsert (idempotent)
    // @ts-expect-error - dynamic model access
    const model = prisma[table];
    if (!model || typeof model.upsert !== 'function') {
      warn(`Prisma model ${table} not found or has no upsert() - skipping.`);
      continue;
    }

    let inserted = 0;
    for (const row of rows) {
      // Convert SQLite boolean-like values (0/1) to actual booleans for PG
      const converted: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(row)) {
        // Heuristic: published/active/enabled columns store booleans as 0/1 in SQLite
        if (['published', 'active', 'enabled', 'isDeleted', 'isPublic'].includes(k) && (v === 0 || v === 1)) {
          converted[k] = Boolean(v);
        } else {
          converted[k] = v;
        }
      }

      try {
        await model.upsert({
          where: { id: String(row.id) },
          create: converted as never,
          update: converted as never,
        });
        inserted++;
      } catch (err) {
        warn(`Failed to upsert ${table} id=${row.id}: ${(err as Error).message}`);
      }
    }
    log(`Migrated ${inserted}/${rows.length} row(s) into PostgreSQL.${table}`);
    totalMigrated += inserted;
  }

  log(`Migration complete. Total rows migrated: ${totalMigrated}`);
  await prisma.$disconnect();
  sqliteDb.close();
}

main().catch((err) => {
  console.error('[migrate] FATAL:', err);
  process.exit(1);
});
