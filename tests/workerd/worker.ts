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

async function appFingerprint(client: AppPrismaClient) {
  const identity = await client.$queryRaw<
    Array<{ database_name: string; schema_name: string; server_version: string; system_identifier: string }>
  >`SELECT current_database()::text AS database_name, current_schema()::text AS schema_name, current_setting('server_version') AS server_version, (SELECT system_identifier::text FROM pg_control_system()) AS system_identifier`;
  const migrations = await client.$queryRaw<Array<{ migration_name: string }>>`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name`;
  return { identity: identity[0], migrationNames: migrations.map((row) => row.migration_name) };
}

async function storeFingerprint(client: StorePrismaClient) {
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
      // STEP 18.2.7.3.10 (Finding T-1): a successful `SELECT 1` inside a
      // transaction only proves the connection works — it does NOT prove the
      // transaction is read-only. A misconfigured read-write database would
      // also pass that test. To actually prove READ ONLY mode, we attempt a
      // write (CREATE TEMP TABLE) inside the transaction. PostgreSQL
      // returns `ERROR: cannot execute CREATE TABLE in a read-only
      // transaction` (SQLSTATE 25006) when transaction_read_only=on.
      // The proof PASSES only if the write is REJECTED with that exact code.
      try {
        const client = getAppClient(ctx, env);
        const result = await client.$transaction(async (tx) => {
          const rows = await tx.$queryRaw<Array<{ ok: number }>>`SELECT 1 AS ok`;
          let writeRejected = false;
          let writeError: { code?: string; message?: string } | null = null;
          try {
            await tx.$executeRaw`CREATE TEMP TABLE __readonly_proof (id int)`;
          } catch (writeErr: unknown) {
            writeRejected = true;
            const code = (writeErr as { code?: string } | null)?.code;
            const message = (writeErr as { message?: string } | null)?.message ?? "";
            writeError = { code, message };
          }
          return {
            selectOk: Number(rows[0]?.ok) === 1,
            writeRejected,
            writeError,
          };
        });
        const readOnlyProven =
          result.selectOk === true &&
          result.writeRejected === true &&
          typeof result.writeError?.code === "string" &&
          result.writeError.code === "25006";
        return json({
          clientId: getClientId(client),
          transactionOk: result.selectOk,
          readOnlyProven,
          writeAttempted: true,
          writeRejected: result.writeRejected,
          writeErrorCode: result.writeError?.code ?? null,
        });
      } catch (error) {
        return json({
          error: "app_preview_readonly_transaction_failed",
          diagnostic: safeDiagnostic(error, env),
        }, 502);
      }
    }
    if (path === "/store/transaction") {
      // STEP 18.2.7.3.10 (Finding T-1): same as /app/transaction above.
      try {
        const client = getStoreClient(ctx, env);
        const result = await client.$transaction(async (tx) => {
          const rows = await tx.$queryRaw<Array<{ ok: number }>>`SELECT 1 AS ok`;
          let writeRejected = false;
          let writeError: { code?: string; message?: string } | null = null;
          try {
            await tx.$executeRaw`CREATE TEMP TABLE __readonly_proof (id int)`;
          } catch (writeErr: unknown) {
            writeRejected = true;
            const code = (writeErr as { code?: string } | null)?.code;
            const message = (writeErr as { message?: string } | null)?.message ?? "";
            writeError = { code, message };
          }
          return {
            selectOk: Number(rows[0]?.ok) === 1,
            writeRejected,
            writeError,
          };
        });
        const readOnlyProven =
          result.selectOk === true &&
          result.writeRejected === true &&
          typeof result.writeError?.code === "string" &&
          result.writeError.code === "25006";
        return json({
          clientId: getClientId(client),
          transactionOk: result.selectOk,
          readOnlyProven,
          writeAttempted: true,
          writeRejected: result.writeRejected,
          writeErrorCode: result.writeError?.code ?? null,
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
