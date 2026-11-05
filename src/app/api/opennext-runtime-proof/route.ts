import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { storeDb } from "@/lib/store-db";
import {
  constantTimeEqual,
  extractBearerToken,
  isPostgres17,
} from "@/lib/opennext-proof-guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const EXPECTED = {
  app: {
    systemIdentifier: "7701427422680793119",
    migrations: [
      "20261025081255_init_postgresql_baseline",
      "20261025193000_add_auditlog_idempotency_key",
    ],
  },
  store: {
    systemIdentifier: "7701425043360235551",
    migrations: ["0001_init_store_baseline", "0002_add_audit_outbox"],
  },
} as const;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" },
  });
}

function safeError(error: unknown) {
  return {
    name: error instanceof Error ? error.name : "UnknownError",
    // Deliberately omit raw messages: Prisma/driver errors can contain URLs.
  };
}

async function probeApp() {
  const identity = await db.$queryRaw<Array<{
    system_identifier: string;
    database_name: string;
    schema_name: string;
    server_version: string;
  }>>`SELECT
    (SELECT system_identifier::text FROM pg_control_system()) AS system_identifier,
    current_database()::text AS database_name,
    current_schema()::text AS schema_name,
    current_setting('server_version') AS server_version`;
  const migrations = await db.$queryRaw<Array<{ migration_name: string }>>`
    SELECT migration_name FROM "_prisma_migrations"
    WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
    ORDER BY migration_name`;
  const transaction = await db.$transaction(async (tx) => {
    // STEP 18.2.7.3.11 (Finding RO-1, per senior-manager audit):
    // Previously we only READ current_setting('transaction_read_only') —
    // this observed the existing state but did NOT enforce read-only mode.
    // A misconfigured read-write database would pass that check.
    //
    // Now we explicitly SET TRANSACTION READ ONLY as the FIRST statement
    // in the transaction. If the database is already read-only, this is a
    // no-op. If it is read-write, PostgreSQL will either:
    //   - Set the transaction to read-only (if the role has permission), or
    //   - Throw an error (if the role lacks SET permission).
    // Either way, no write can occur in this transaction after this point.
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    const rows = await tx.$queryRaw<Array<{ read_only: boolean }>>`
      SELECT current_setting('transaction_read_only')::boolean AS read_only`;
    return rows[0]?.read_only === true;
  });
  const actual = identity[0];
  return {
    identityMatch: actual?.system_identifier === EXPECTED.app.systemIdentifier,
    schemaMatch: actual?.schema_name === "public",
    postgres17: isPostgres17(actual?.server_version),
    migrationsMatch:
      JSON.stringify(migrations.map((row) => row.migration_name)) ===
      JSON.stringify(EXPECTED.app.migrations),
    transactionReadOnly: transaction,
    transactionReadOnlyEnforced: transaction,
  };
}

async function probeStore() {
  const identity = await storeDb.$queryRaw<Array<{
    system_identifier: string;
    database_name: string;
    schema_name: string;
    server_version: string;
  }>>`SELECT
    (SELECT system_identifier::text FROM pg_control_system()) AS system_identifier,
    current_database()::text AS database_name,
    current_schema()::text AS schema_name,
    current_setting('server_version') AS server_version`;
  const migrations = await storeDb.$queryRaw<Array<{ migration_name: string }>>`
    SELECT migration_name FROM "_prisma_migrations"
    WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
    ORDER BY migration_name`;
  const transaction = await storeDb.$transaction(async (tx) => {
    // STEP 18.2.7.3.11 (Finding RO-1): see probeApp() above.
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    const rows = await tx.$queryRaw<Array<{ read_only: boolean }>>`
      SELECT current_setting('transaction_read_only')::boolean AS read_only`;
    return rows[0]?.read_only === true;
  });
  const actual = identity[0];
  return {
    identityMatch: actual?.system_identifier === EXPECTED.store.systemIdentifier,
    schemaMatch: actual?.schema_name === "public",
    postgres17: isPostgres17(actual?.server_version),
    migrationsMatch:
      JSON.stringify(migrations.map((row) => row.migration_name)) ===
      JSON.stringify(EXPECTED.store.migrations),
    transactionReadOnly: transaction,
    transactionReadOnlyEnforced: transaction,
  };
}

export async function GET(request: Request) {
  const mode = process.env.HEAVIX_OPENNEXT_PROOF_MODE;
  if (mode !== "SMOKE_ONLY" && mode !== "PREVIEW_ONLY") {
    return json({ error: "not_found" }, 404);
  }

  if (mode === "PREVIEW_ONLY") {
    const expectedToken = process.env.HEAVIX_OPENNEXT_PROOF_TOKEN;
    const suppliedToken = extractBearerToken(request.headers.get("authorization"));
    if (!expectedToken || !constantTimeEqual(suppliedToken, expectedToken)) {
      return json({ error: "not_found" }, 404);
    }
    if (!process.env.DATABASE_URL || !process.env.STORE_DATABASE_URL ||
        process.env.DATABASE_URL === process.env.STORE_DATABASE_URL) {
      return json({ error: "preview_targets_not_configured" }, 503);
    }
    try {
      const [app, store] = await Promise.all([probeApp(), probeStore()]);
      const passed = Object.values(app).every(Boolean) && Object.values(store).every(Boolean);
      return json({
        result: passed ? "PASS" : "FAIL",
        mode: "PREVIEW_ONLY",
        app,
        store,
        databaseNamesAreNotUsedAsResourceIdentity: true,
        identityProbeIsReadOnlyButDoesContactEachDatabase: true,
        writesPerformed: false,
      }, passed ? 200 : 503);
    } catch (error) {
      return json({ result: "FAIL", mode: "PREVIEW_ONLY", error: safeError(error) }, 503);
    }
  }

  // This branch is only enabled by the local test runner's temporary
  // Wrangler config. It invokes both real application proxies, but has no
  // database bindings; resolver failure must occur before any network I/O.
  // Defer proxy access into promise callbacks: the real Worker resolver may
  // throw synchronously while resolving a missing binding, before returning
  // a Prisma promise. Promise.allSettled only observes rejections, so each
  // access must first cross a promise boundary to capture both sync throws
  // and asynchronous query failures without allowing an unhandled 500.
  const [app, store] = await Promise.allSettled([
    Promise.resolve().then(() => db.$queryRaw`SELECT 1`),
    Promise.resolve().then(() => storeDb.$queryRaw`SELECT 1`),
  ]);
  const appClosed = app.status === "rejected" &&
    app.reason instanceof Error &&
    app.reason.message === "Missing Cloudflare Worker secret: DATABASE_URL";
  const storeClosed = store.status === "rejected" &&
    store.reason instanceof Error &&
    store.reason.message === "Missing Cloudflare Worker secret: STORE_DATABASE_URL";
  const passed = appClosed && storeClosed;
  return json({
    result: passed ? "PASS" : "FAIL",
    mode: "SMOKE_ONLY",
    realApplicationAliasesImported: true,
    appFailsClosedWithoutBinding: appClosed,
    storeFailsClosedWithoutBinding: storeClosed,
    databaseConnectionsAttempted: false,
    writesPerformed: false,
  }, passed ? 200 : 503);
}
