import { createRequestScopedClientResolver } from "../../src/lib/prisma-worker-proxy";
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

type ReadOnlyRoleEvidence = {
  roleName: string;
  isSuperuser: boolean;
  canCreateRole: boolean;
  canCreateDatabase: boolean;
  canReplicate: boolean;
  canBypassRls: boolean;
  defaultTransactionReadOnlyOn: boolean;
  memberPgWriteAllData: boolean;
  inheritsPgWriteAllData: boolean;
  memberPgWriteServerFiles: boolean;
  memberPgExecuteServerProgram: boolean;
  hasEffectiveTableWrite: boolean;
  hasEffectiveSequenceWrite: boolean;
  canCreateInUserSchemas: boolean;
  canCreateDatabaseObjects: boolean;
  proven: boolean;
};

/**
 * transaction_read_only=true alone is not a least-privilege proof: a writable
 * role can set it for one transaction. Inspect role attributes, inherited
 * predefined write roles, and effective object privileges using SELECT only.
 */
async function inspectReadOnlyRole(
  client: AppPrismaClient | StorePrismaClient,
): Promise<ReadOnlyRoleEvidence> {
  const rows = await client.$queryRaw<Array<{
    role_name: string;
    is_superuser: boolean;
    can_create_role: boolean;
    can_create_database: boolean;
    can_replicate: boolean;
    can_bypass_rls: boolean;
    default_transaction_read_only_on: boolean;
    member_pg_write_all_data: boolean;
    inherits_pg_write_all_data: boolean;
    member_pg_write_server_files: boolean;
    member_pg_execute_server_program: boolean;
    has_effective_table_write: boolean;
    has_effective_sequence_write: boolean;
    can_create_in_user_schemas: boolean;
    can_create_database_objects: boolean;
  }>>`
    SELECT
      r.rolname::text AS role_name,
      r.rolsuper AS is_superuser,
      r.rolcreaterole AS can_create_role,
      r.rolcreatedb AS can_create_database,
      r.rolreplication AS can_replicate,
      r.rolbypassrls AS can_bypass_rls,
      COALESCE('default_transaction_read_only=on' = ANY(r.rolconfig), false) AS default_transaction_read_only_on,
      pg_has_role(current_user, 'pg_write_all_data', 'MEMBER') AS member_pg_write_all_data,
      pg_has_role(current_user, 'pg_write_all_data', 'USAGE') AS inherits_pg_write_all_data,
      pg_has_role(current_user, 'pg_write_server_files', 'MEMBER') AS member_pg_write_server_files,
      pg_has_role(current_user, 'pg_execute_server_program', 'MEMBER') AS member_pg_execute_server_program,
      EXISTS (
        SELECT 1
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname NOT IN ('information_schema')
          AND n.nspname NOT LIKE 'pg_%'
          AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
          AND (
            has_table_privilege(current_user, c.oid, 'INSERT')
            OR has_table_privilege(current_user, c.oid, 'UPDATE')
            OR has_table_privilege(current_user, c.oid, 'DELETE')
            OR has_table_privilege(current_user, c.oid, 'TRUNCATE')
            OR has_table_privilege(current_user, c.oid, 'REFERENCES')
            OR has_table_privilege(current_user, c.oid, 'TRIGGER')
            OR has_table_privilege(current_user, c.oid, 'MAINTAIN')
          )
      ) AS has_effective_table_write,
      EXISTS (
        SELECT 1
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname NOT IN ('information_schema')
          AND n.nspname NOT LIKE 'pg_%'
          AND c.relkind = 'S'
          AND (
            has_sequence_privilege(current_user, c.oid, 'USAGE')
            OR has_sequence_privilege(current_user, c.oid, 'UPDATE')
          )
      ) AS has_effective_sequence_write,
      EXISTS (
        SELECT 1
        FROM pg_namespace n
        WHERE n.nspname NOT IN ('information_schema')
          AND n.nspname NOT LIKE 'pg_%'
          AND has_schema_privilege(current_user, n.oid, 'CREATE')
      ) AS can_create_in_user_schemas,
      has_database_privilege(current_user, current_database(), 'CREATE') AS can_create_database_objects
    FROM pg_roles r
    WHERE r.rolname = current_user
  `;
  const row = rows[0];
  if (!row) throw new Error("Could not inspect the active PostgreSQL role.");
  const proven = !(
    row.is_superuser ||
    row.can_create_role ||
    row.can_create_database ||
    row.can_replicate ||
    row.can_bypass_rls ||
    row.member_pg_write_all_data ||
    row.inherits_pg_write_all_data ||
    row.member_pg_write_server_files ||
    row.member_pg_execute_server_program ||
    row.has_effective_table_write ||
    row.has_effective_sequence_write ||
    row.can_create_in_user_schemas ||
    row.can_create_database_objects
  );
  return {
    roleName: row.role_name,
    isSuperuser: row.is_superuser,
    canCreateRole: row.can_create_role,
    canCreateDatabase: row.can_create_database,
    canReplicate: row.can_replicate,
    canBypassRls: row.can_bypass_rls,
    defaultTransactionReadOnlyOn: row.default_transaction_read_only_on,
    memberPgWriteAllData: row.member_pg_write_all_data,
    inheritsPgWriteAllData: row.inherits_pg_write_all_data,
    memberPgWriteServerFiles: row.member_pg_write_server_files,
    memberPgExecuteServerProgram: row.member_pg_execute_server_program,
    hasEffectiveTableWrite: row.has_effective_table_write,
    hasEffectiveSequenceWrite: row.has_effective_sequence_write,
    canCreateInUserSchemas: row.can_create_in_user_schemas,
    canCreateDatabaseObjects: row.can_create_database_objects,
    proven,
  };
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

    if (path === "/resolver/lifecycle") {
      let syntheticClientId = 0;
      const resolve = createRequestScopedClientResolver<
        { id: number },
        WorkerDatabaseEnv
      >(() => ({ id: ++syntheticClientId }));
      const requestKey = {};
      const first = resolve(requestKey, env);
      const sameRequest = resolve(requestKey, env);
      const otherRequest = resolve({}, env);
      return json({
        sameRequestClientReused: first === sameRequest,
        isolatedAcrossRequests: first !== otherRequest,
        distinctClientIds: first.id !== otherRequest.id,
      });
    }

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
      // The correct approach is to query the runtime GUC directly:
      //   SELECT current_setting('transaction_read_only')::boolean
      // This returns the actual state of the transaction_read_only GUC
      // for the current transaction. If the Preview database is
      // configured with transaction_read_only=on (either at the role
      // level or the session level), this returns true.
      //
      // We also verify that the SELECT itself succeeded (transactionOk)
      // to prove the connection works.
      //
      // STEP 18.2.7.3.10 (Finding S-3): verify identity BEFORE opening the
      // transaction. If the secret points at Production, the transaction
      // is never opened.
      try {
        const client = getAppClient(ctx, env);
        await verifyDatabaseIdentity(client, EXPECTED_APP_SYSTEM_IDENTIFIER, "App");
        const roleEvidence = await inspectReadOnlyRole(client);
        const result = await client.$transaction(async (tx) => {
          const [selectRows, settingRows] = await Promise.all([
            tx.$queryRaw<Array<{ ok: number }>>`SELECT 1 AS ok`,
            tx.$queryRaw<Array<{ transaction_read_only: boolean | string }>>`SELECT current_setting('transaction_read_only')::boolean AS transaction_read_only`,
          ]);
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
          readOnlyProven: readOnlyProven && roleEvidence.proven,
          readOnlyCheckMethod: "current_setting('transaction_read_only')::boolean",
          readOnlyRoleEvidence: roleEvidence,
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
        const roleEvidence = await inspectReadOnlyRole(client);
        const result = await client.$transaction(async (tx) => {
          const [selectRows, settingRows] = await Promise.all([
            tx.$queryRaw<Array<{ ok: number }>>`SELECT 1 AS ok`,
            tx.$queryRaw<Array<{ transaction_read_only: boolean | string }>>`SELECT current_setting('transaction_read_only')::boolean AS transaction_read_only`,
          ]);
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
          readOnlyProven: readOnlyProven && roleEvidence.proven,
          readOnlyCheckMethod: "current_setting('transaction_read_only')::boolean",
          readOnlyRoleEvidence: roleEvidence,
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
