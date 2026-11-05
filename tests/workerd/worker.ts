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
    Array<{ database_name: string; schema_name: string; server_version: string }>
  >`SELECT current_database() AS database_name, current_schema() AS schema_name, current_setting('server_version') AS server_version`;
  const migrations = await client.$queryRaw<Array<{ migration_name: string }>>`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name`;
  return { identity: identity[0], migrationNames: migrations.map((row) => row.migration_name) };
}

async function storeFingerprint(client: StorePrismaClient) {
  const identity = await client.$queryRaw<
    Array<{ database_name: string; schema_name: string; server_version: string }>
  >`SELECT current_database() AS database_name, current_schema() AS schema_name, current_setting('server_version') AS server_version`;
  const migrations = await client.$queryRaw<Array<{ migration_name: string }>>`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name`;
  return { identity: identity[0], migrationNames: migrations.map((row) => row.migration_name) };
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
      } catch {
        return json({ error: "app_preview_probe_failed" }, 502);
      }
    }
    if (path === "/store/fingerprint") {
      try {
        const client = getStoreClient(ctx, env);
        const sameRequestClientReused = client === getStoreClient(ctx, env);
        return json({ clientId: getClientId(client), sameRequestClientReused, ...(await storeFingerprint(client)) });
      } catch {
        return json({ error: "store_preview_probe_failed" }, 502);
      }
    }
    if (path === "/app/transaction") {
      try {
        const client = getAppClient(ctx, env);
        const rows = await client.$transaction((tx) =>
          tx.$queryRaw<Array<{ ok: number }>>`SELECT 1 AS ok`,
        );
        return json({ clientId: getClientId(client), transactionOk: Number(rows[0]?.ok) === 1 });
      } catch {
        return json({ error: "app_preview_readonly_transaction_failed" }, 502);
      }
    }
    if (path === "/store/transaction") {
      try {
        const client = getStoreClient(ctx, env);
        const rows = await client.$transaction((tx) =>
          tx.$queryRaw<Array<{ ok: number }>>`SELECT 1 AS ok`,
        );
        return json({ clientId: getClientId(client), transactionOk: Number(rows[0]?.ok) === 1 });
      } catch {
        return json({ error: "store_preview_readonly_transaction_failed" }, 502);
      }
    }
    return json({ error: "not_found" }, 404);
  },
};
