import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { storeDb } from "@/lib/store-db";
import { getAsset } from "@/lib/media-service";
import { getB2MediaConfig } from "@/lib/b2-media-storage";
import { optimizeImageBuffer } from "@/lib/media-image-optimizer";
import {
  constantTimeEqual,
  extractBearerToken,
  isPostgres17,
  isPostgresDatabaseOid,
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

async function probeApp(expectedDatabaseOid: string) {
  const identity = await db.$queryRaw<Array<{
    system_identifier: string;
    database_oid: string;
    database_name: string;
    schema_name: string;
    server_version: string;
  }>>`SELECT
    (SELECT system_identifier::text FROM pg_control_system()) AS system_identifier,
    (SELECT oid::text FROM pg_database WHERE datname = current_database()) AS database_oid,
    current_database()::text AS database_name,
    current_schema()::text AS schema_name,
    current_setting('server_version') AS server_version`;
  const actual = identity[0];
  const clusterMatch = actual?.system_identifier === EXPECTED.app.systemIdentifier;
  const databaseMatch = actual?.database_oid === expectedDatabaseOid;

  // Fail closed before reading schema metadata or opening a transaction.
  if (!clusterMatch || !databaseMatch) {
    return {
      clusterMatch,
      databaseMatch,
      identityMatch: false,
      schemaMatch: actual?.schema_name === "public",
      postgres17: isPostgres17(actual?.server_version),
      migrationsMatch: false,
      transactionReadOnly: false,
      transactionReadOnlyEnforced: false,
    };
  }

  const migrations = await db.$queryRaw<Array<{ migration_name: string }>>`
    SELECT migration_name FROM "_prisma_migrations"
    WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
    ORDER BY migration_name`;
  const transaction = await db.$transaction(async (tx) => {
    // Transaction-local, prepared-statement-safe read-only enforcement.
    // This must be the first statement in the transaction.
    const configured = await tx.$queryRaw<Array<{ read_only: string }>>`
      SELECT set_config('transaction_read_only', 'on', true) AS read_only`;
    if (configured[0]?.read_only !== "on") return false;
    const rows = await tx.$queryRaw<Array<{ read_only: boolean }>>`
      SELECT current_setting('transaction_read_only')::boolean AS read_only`;
    return rows[0]?.read_only === true;
  });
  return {
    clusterMatch,
    databaseMatch,
    identityMatch: clusterMatch && databaseMatch,
    schemaMatch: actual?.schema_name === "public",
    postgres17: isPostgres17(actual?.server_version),
    migrationsMatch:
      JSON.stringify(migrations.map((row) => row.migration_name)) ===
      JSON.stringify(EXPECTED.app.migrations),
    transactionReadOnly: transaction,
    transactionReadOnlyEnforced: transaction,
  };
}

async function probeStore(expectedDatabaseOid: string) {
  const identity = await storeDb.$queryRaw<Array<{
    system_identifier: string;
    database_oid: string;
    database_name: string;
    schema_name: string;
    server_version: string;
  }>>`SELECT
    (SELECT system_identifier::text FROM pg_control_system()) AS system_identifier,
    (SELECT oid::text FROM pg_database WHERE datname = current_database()) AS database_oid,
    current_database()::text AS database_name,
    current_schema()::text AS schema_name,
    current_setting('server_version') AS server_version`;
  const actual = identity[0];
  const clusterMatch = actual?.system_identifier === EXPECTED.store.systemIdentifier;
  const databaseMatch = actual?.database_oid === expectedDatabaseOid;

  // Fail closed before reading schema metadata or opening a transaction.
  if (!clusterMatch || !databaseMatch) {
    return {
      clusterMatch,
      databaseMatch,
      identityMatch: false,
      schemaMatch: actual?.schema_name === "public",
      postgres17: isPostgres17(actual?.server_version),
      migrationsMatch: false,
      transactionReadOnly: false,
      transactionReadOnlyEnforced: false,
    };
  }

  const migrations = await storeDb.$queryRaw<Array<{ migration_name: string }>>`
    SELECT migration_name FROM "_prisma_migrations"
    WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
    ORDER BY migration_name`;
  const transaction = await storeDb.$transaction(async (tx) => {
    // Transaction-local, prepared-statement-safe read-only enforcement.
    // This must be the first statement in the transaction.
    const configured = await tx.$queryRaw<Array<{ read_only: string }>>`
      SELECT set_config('transaction_read_only', 'on', true) AS read_only`;
    if (configured[0]?.read_only !== "on") return false;
    const rows = await tx.$queryRaw<Array<{ read_only: boolean }>>`
      SELECT current_setting('transaction_read_only')::boolean AS read_only`;
    return rows[0]?.read_only === true;
  });
  return {
    clusterMatch,
    databaseMatch,
    identityMatch: clusterMatch && databaseMatch,
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
    const appDatabaseOid = process.env.HEAVIX_APP_PREVIEW_DATABASE_OID;
    const storeDatabaseOid = process.env.HEAVIX_STORE_PREVIEW_DATABASE_OID;
    if (!process.env.DATABASE_URL || !process.env.STORE_DATABASE_URL ||
        process.env.DATABASE_URL === process.env.STORE_DATABASE_URL ||
        !isPostgresDatabaseOid(appDatabaseOid) ||
        !isPostgresDatabaseOid(storeDatabaseOid)) {
      return json({ error: "preview_targets_or_database_identity_not_configured" }, 503);
    }
    try {
      const [app, store] = await Promise.all([
        probeApp(appDatabaseOid), probeStore(storeDatabaseOid),
      ]);
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
  // Import and exercise the media service in Workerd without B2 credentials.
  // An invalid opaque id must be rejected before any object-storage request.
  const invalidMediaAsset = await getAsset("not-a-valid-media-id");
  const mediaServiceModuleLoaded = invalidMediaAsset === null;
  const b2Config = getB2MediaConfig();
  const b2MediaConfigWorks =
    b2Config.bucket === "heavix-dev-assets" &&
    b2Config.prefix === "heavix-media/" &&
    b2Config.region === "us-east-005" &&
    b2Config.endpoint === "https://s3.us-east-005.backblazeb2.com";
  const tinyPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/5ZkAAAAASUVORK5CYII=",
    "base64",
  );
  const optimizedMedia = await optimizeImageBuffer(tinyPng, "png");
  const mediaImageOptimizerWorks =
    optimizedMedia.buffer.length > 0 &&
    optimizedMedia.type === "png" &&
    optimizedMedia.mime === "image/png";
  const passed = appClosed && storeClosed && mediaServiceModuleLoaded && b2MediaConfigWorks && mediaImageOptimizerWorks;
  return json({
    result: passed ? "PASS" : "FAIL",
    mode: "SMOKE_ONLY",
    realApplicationAliasesImported: true,
    appFailsClosedWithoutBinding: appClosed,
    storeFailsClosedWithoutBinding: storeClosed,
    mediaServiceModuleLoaded,
    b2MediaConfigWorks,
    mediaReadGateRejectsInvalidId: invalidMediaAsset === null,
    mediaImageOptimizerWorks,
    databaseConnectionsAttempted: false,
    writesPerformed: false,
  }, passed ? 200 : 503);
}
