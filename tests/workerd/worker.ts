import {
  createAppWorkerClientResolver,
  createStoreWorkerClientResolver,
  type WorkerDatabaseEnv,
  type AppPrismaClient,
  type StorePrismaClient,
} from "../../src/lib/prisma-worker-clients";

const getAppClient = createAppWorkerClientResolver();
const getStoreClient = createStoreWorkerClientResolver();
const clientIds = new WeakMap<object, number>();
let nextClientId = 0;

function getClientId(client: object): number {
  let id = clientIds.get(client);
  if (id === undefined) {
    id = ++nextClientId;
    clientIds.set(client, id);
  }
  return id;
}

// STEP 18.2.7.3.10 (Finding S-3, per senior-manager audit):
// The expected PostgreSQL system_identifier values for the App and Store
// Preview databases. These are the ONLY values that the runtime proof is
// permitted to connect to. If a secret is misconfigured to point at a
// different database (e.g. Production), the proof MUST fail-closed BEFORE
// any other query (migrations, transaction tests, etc.) is executed —
// otherwise read access to Production would occur before the mismatch
// is detected.
const EXPECTED_APP_SYSTEM_IDENTIFIER = "7701427422680793119";
const EXPECTED_STORE_SYSTEM_IDENTIFIER = "7701425043360235551";

class PreviewIdentityMismatchError extends Error {
  readonly expectedSystemIdentifier: string;
  readonly actualSystemIdentifier: string;
  constructor(actual: string, expected: string, label: string) {
    super(`${label} system_identifier mismatch: expected ${expected}, got ${actual}`);
    this.name = "PreviewIdentityMismatchError";
    this.expectedSystemIdentifier = expected;
    this.actualSystemIdentifier = actual;
  }
}

/**
 * Verify the connected database's system_identifier BEFORE any other query.
 * This is the fail-closed gate: if the secret points at the wrong database
 * (e.g. Production), this function throws PreviewIdentityMismatchError
 * before migrations or transaction tests are read.
 */
async function verifyDatabaseIdentity(
  client: AppPrismaClient | StorePrismaClient,
  expectedSystemIdentifier: string,
  label: string,
): Promise<void> {
  const rows = await client.$queryRaw<
    Array<{ system_identifier: string }>
  >`SELECT system_identifier::text AS system_identifier FROM pg_control_system()`;
  const actual = rows[0]?.system_identifier ?? "";
  if (actual !== expectedSystemIdentifier) {
    throw new PreviewIdentityMismatchError(actual, expectedSystemIdentifier, label);
  }
}

async function appFingerprint(client: AppPrismaClient): Promise<{
  identity: { database_name: string; schema_name: string; server_version: string; system_identifier: string };
  migrationNames: string[];
}> {
  // STEP 18.2.7.3.10 (Finding S-3): verify identity FIRST, before reading migrations.
  // If this throws, the caller returns 502 immediately — migrations are never read.
  await verifyDatabaseIdentity(client, EXPECTED_APP_SYSTEM_IDENTIFIER, "App");
  const identity = await client.$queryRaw<
    Array<{ database_name: string; schema_name: string; server_version: string; system_identifier: string }>
  >`SELECT current_database()::text AS database_name, current_schema()::text AS schema_name, current_setting('server_version') AS server_version, (SELECT system_identifier::text FROM pg_control_system()) AS system_identifier`;
  const migrations = await client.$queryRaw<Array<{ migration_name: string }>>`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name`;
  return { identity: identity[0], migrationNames: migrations.map((row) => row.migration_name) };
}

async function storeFingerprint(client: StorePrismaClient): Promise<{
  identity: { database_name: string; schema_name: string; server_version: string; system_identifier: string };
  migrationNames: string[];
}> {
  // STEP 18.2.7.3.10 (Finding S-3): verify identity FIRST, before reading migrations.
  await verifyDatabaseIdentity(client, EXPECTED_STORE_SYSTEM_IDENTIFIER, "Store");
  const identity = await client.$queryRaw<
    Array<{ database_name: string; schema_name: string; server_version: string; system_identifier: string }>
  >`SELECT current_database()::text AS database_name, current_schema()::text AS schema_name, current_setting('server_version') AS server_version, (SELECT system_identifier::text FROM pg_control_system()) AS system_identifier`;
  const migrations = await client.$queryRaw<Array<{ migration_name: string }>>`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name`;
  return { identity: identity[0], migrationNames: migrations.map((row) => row.migration_name) };
}

function safeDiagnostic(error: unknown, env: WorkerDatabaseEnv) {
  const name = error instanceof Error ? error.name : "UnknownError";
  const code = error && typeof error === "object" && "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
    ? (error as { code: string }).code.slice(0, 64)
    : undefined;
  let message = error instanceof Error ? error.message : String(error);
  for (const secret of [env.DATABASE_URL, env.STORE_DATABASE_URL]) {
    if (secret) message = message.split(secret).join("[redacted]");
  }
  message = message
    .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, "[redacted connection URL]")
    .replace(/\b(password|token|secret)\s*[:=]\s*[^,\s;]+/gi, "$1=[redacted]")
    .slice(0, 240);
  return { name, ...(code ? { code } : {}), message };
}

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

export default {
  async fetch(request: Request, env: WorkerDatabaseEnv, ctx: ExecutionContext): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path === "/health") return json({ ok: true, runtime: "workerd" });

    if (path === "/failure/missing-app-secret") {
      try {
        createAppWorkerClientResolver()(ctx, { ...env, DATABASE_URL: undefined });
        return json({ expectedFailure: false }, 500);
      } catch (error) {
        return json({ expectedFailure: error instanceof Error &&
          error.message === "Missing Cloudflare Worker secret: DATABASE_URL" });
      }
    }
    if (path === "/failure/missing-store-secret") {
      try {
        createStoreWorkerClientResolver()(ctx, { ...env, STORE_DATABASE_URL: undefined });
        return json({ expectedFailure: false }, 500);
      } catch (error) {
        return json({ expectedFailure: error instanceof Error &&
          error.message === "Missing Cloudflare Worker secret: STORE_DATABASE_URL" });
      }
    }

    if (path === "/app/fingerprint") {
      try {
        const client = getAppClient(ctx, env);
        const sameRequestClientReused = client === getAppClient(ctx, env);
        return json({ clientId: getClientId(client), sameRequestClientReused, ...(await appFingerprint(client)) });
      } catch (error) {
        return json({
          error: "app_preview_probe_failed",
          diagnostic: safeDiagnostic(error, env),
        }, 502);
      }
    }
    if (path === "/store/fingerprint") {
      try {
        const client = getStoreClient(ctx, env);
        const sameRequestClientReused = client === getStoreClient(ctx, env);
        return json({ clientId: getClientId(client), sameRequestClientReused, ...(await storeFingerprint(client)) });
      } catch (error) {
        return json({
          error: "store_preview_probe_failed",
          diagnostic: safeDiagnostic(error, env),
        }, 502);
      }
    }
    if (path === "/app/transaction") {
      // STEP 18.2.7.3.10 (Finding T-1, revised per review comment #6657226686):
      // The previous approach attempted CREATE TEMP TABLE inside the
      // transaction. Per PostgreSQL documentation, CREATE TEMP TABLE is
      // ALLOWED in a read-only transaction (only DML writes to permanent
      // tables are blocked). So a successful CREATE TEMP TABLE did NOT
      // prove read-only, and a failed one (25006) would have been even
      // less meaningful.
      //
      // The proof explicitly issues SET TRANSACTION READ ONLY as the first
      // statement inside the interactive transaction, then queries the
      // transaction_read_only GUC. This proves transaction-scoped read-only
      // execution without requiring the entire Preview database to be read-only.
      //
      // We also verify that SELECT 1 succeeds (transactionOk) to prove the
      // connection works.
      //
      // STEP 18.2.7.3.10 (Finding S-3): verify identity BEFORE opening the
      // transaction. If the secret points at Production, the transaction
      // is never opened.
      try {
        const client = getAppClient(ctx, env);
        await verifyDatabaseIdentity(client, EXPECTED_APP_SYSTEM_IDENTIFIER, "App");
        const result = await client.$transaction(async (tx) => {
          // Explicitly mark this one proof transaction read-only. The Preview
          // application database itself remains writable for normal app use;
          // this test proves the Worker/adapter can execute a read-only
          // transaction without relying on a database-wide read-only setting.
          await tx.$executeRaw`SET TRANSACTION READ ONLY`;
          const settingRows = await tx.$queryRaw<
            Array<{ transaction_read_only: boolean | string }>
          >`SELECT current_setting('transaction_read_only')::boolean AS transaction_read_only`;
          const selectRows = await tx.$queryRaw<Array<{ ok: number }>>`SELECT 1 AS ok`;
          const rawSetting = settingRows[0]?.transaction_read_only;
          const isReadOnly = rawSetting === true || rawSetting === "true" || rawSetting === "t" || rawSetting === 1 || rawSetting === "1";
          return {
            selectOk: Number(selectRows[0]?.ok) === 1,
            transactionReadOnlySetting: String(rawSetting),
            isReadOnly,
          };
        });
        const readOnlyProven = result.selectOk === true && result.isReadOnly === true;
        return json({
          clientId: getClientId(client),
          transactionOk: result.selectOk,
          readOnlyProven,
          readOnlyCheckMethod: "current_setting('transaction_read_only')::boolean",
          transactionReadOnlySetting: result.transactionReadOnlySetting,
          writesPerformed: false,
        });
      } catch (error) {
        return json({
          error: "app_preview_readonly_transaction_failed",
          diagnostic: safeDiagnostic(error, env),
        }, 502);
      }
    }
    if (path === "/store/transaction") {
      // STEP 18.2.7.3.10 (Finding T-1, revised): see /app/transaction above.
      // STEP 18.2.7.3.10 (Finding S-3): verify identity BEFORE opening the
      // transaction.
      try {
        const client = getStoreClient(ctx, env);
        await verifyDatabaseIdentity(client, EXPECTED_STORE_SYSTEM_IDENTIFIER, "Store");
        const result = await client.$transaction(async (tx) => {
          // Explicitly mark this one proof transaction read-only. The Store
          // Preview database remains writable for normal app use.
          await tx.$executeRaw`SET TRANSACTION READ ONLY`;
          const settingRows = await tx.$queryRaw<
            Array<{ transaction_read_only: boolean | string }>
          >`SELECT current_setting('transaction_read_only')::boolean AS transaction_read_only`;
          const selectRows = await tx.$queryRaw<Array<{ ok: number }>>`SELECT 1 AS ok`;
          const rawSetting = settingRows[0]?.transaction_read_only;
          const isReadOnly = rawSetting === true || rawSetting === "true" || rawSetting === "t" || rawSetting === 1 || rawSetting === "1";
          return {
            selectOk: Number(selectRows[0]?.ok) === 1,
            transactionReadOnlySetting: String(rawSetting),
            isReadOnly,
          };
        });
        const readOnlyProven = result.selectOk === true && result.isReadOnly === true;
        return json({
          clientId: getClientId(client),
          transactionOk: result.selectOk,
          readOnlyProven,
          readOnlyCheckMethod: "current_setting('transaction_read_only')::boolean",
          transactionReadOnlySetting: result.transactionReadOnlySetting,
          writesPerformed: false,
        });
      } catch (error) {
        return json({
          error: "store_preview_readonly_transaction_failed",
          diagnostic: safeDiagnostic(error, env),
        }, 502);
      }
    }
    return json({ error: "not_found" }, 404);
  },
};
