import { PrismaClient as AppPrismaClient } from "./generated/worker-client/client";
import { PrismaClient as StorePrismaClient } from "./generated/store-worker-client/client";
import { PrismaPostgresAdapter } from "@prisma/adapter-ppg";
import { createRequestScopedClientResolver } from "./prisma-worker-proxy";

export type WorkerDatabaseEnv = {
  DATABASE_URL?: string;
  STORE_DATABASE_URL?: string;
  HEAVIX_APP_PREVIEW_DATABASE_OID?: string;
  HEAVIX_STORE_PREVIEW_DATABASE_OID?: string;
};

// ── STEP 18.2.7.3.10 (Finding S-3, extended to real app path) ──────────
// The isolated Workerd proof (tests/workerd/worker.ts) already verifies
// database identity before any other query. But the REAL app path (when
// OpenNext runs the Worker in production) uses these factory functions
// directly. If a secret is misconfigured to point at Production, the real
// app would execute queries against Production without any identity check.
//
// This module now wraps each PrismaClient in a Proxy that intercepts the
// FIRST query to verify database identity. If the identity check fails
// (system_identifier does not match the expected Preview value), the
// Proxy throws PreviewIdentityMismatchError and the query is never
// forwarded to the underlying client.
//
// The identity check runs ONCE per client instance (cached). Subsequent
// queries on the same client proceed without re-checking.
//
// The ONLY query that runs before identity verification is:
//   SELECT system_identifier::text FROM pg_control_system()
// This is a read-only system function that exposes no user data.

const EXPECTED_APP_SYSTEM_IDENTIFIER = "7701427422680793119";
const EXPECTED_STORE_SYSTEM_IDENTIFIER = "7701425043360235551";

function requireExpectedDatabaseOid(value: string | undefined, label: string): string {
  if (!value || !/^[1-9]\d{0,9}$/.test(value) || Number(value) > 4_294_967_295) {
    throw new Error(label + ": missing or invalid HEAVIX database OID; refusing to create a database client");
  }
  return value;
}

export class PreviewIdentityMismatchError extends Error {
  readonly expectedSystemIdentifier: string;
  readonly actualSystemIdentifier: string;
  readonly expectedDatabaseOid: string;
  readonly actualDatabaseOid: string;
  readonly databaseLabel: string;
  constructor(actual: string, expected: string, actualOid: string, expectedOid: string, label: string) {
    super(`${label} database identity mismatch; refusing to execute queries.`);
    this.name = "PreviewIdentityMismatchError";
    this.expectedSystemIdentifier = expected;
    this.actualSystemIdentifier = actual;
    this.expectedDatabaseOid = expectedOid;
    this.actualDatabaseOid = actualOid;
    this.databaseLabel = label;
  }
}

async function verifyDatabaseIdentity(
  client: { $queryRaw: <T = unknown>(strings: TemplateStringsArray, ...values: unknown[]) => Promise<T> },
  expectedSystemIdentifier: string,
  expectedDatabaseOid: string,
  label: string,
): Promise<void> {
  const rows = await client.$queryRaw<
    Array<{ system_identifier: string; database_oid: string }>
  >`SELECT
    (SELECT system_identifier::text FROM pg_control_system()) AS system_identifier,
    (SELECT oid::text FROM pg_database WHERE datname = current_database()) AS database_oid`;
  const actual = rows[0]?.system_identifier ?? "";
  const actualOid = rows[0]?.database_oid ?? "";
  if (actual !== expectedSystemIdentifier || actualOid !== expectedDatabaseOid) {
    throw new PreviewIdentityMismatchError(actual, expectedSystemIdentifier, actualOid, expectedDatabaseOid, label);
  }
}

/**
 * Wraps a PrismaClient in a Proxy that verifies database identity before
 * the FIRST query. If the identity check fails, all subsequent queries
 * also throw (the check result is cached as a failed promise).
 */
export function withIdentityGuard<TClient extends object>(
  client: TClient,
  expectedSystemIdentifier: string,
  expectedDatabaseOid: string,
  label: string,
): TClient {
  let identityCheckPromise: Promise<void> | null = null;
  const delegateProxyCache = new WeakMap<object, object>();
  const identitySql =
    "SELECT (SELECT system_identifier::text FROM pg_control_system()) AS system_identifier, (SELECT oid::text FROM pg_database WHERE datname = current_database()) AS database_oid";

  const ensureIdentity = (): Promise<void> => {
    if (!identityCheckPromise) {
      identityCheckPromise = (async () => {
        const rawMethod = Reflect.get(client, "$queryRaw", client) as
          | ((strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>)
          | undefined;
        if (typeof rawMethod !== "function") {
          throw new Error(label + ": $queryRaw not available on client — cannot verify identity");
        }

        // Prisma's tagged-template API expects a TemplateStringsArray with
        // its raw member. Invoke the underlying client directly so this
        // bootstrap query does not recursively enter the guard.
        const strings = Object.assign([identitySql], {
          raw: [identitySql],
        }) as unknown as TemplateStringsArray;
        const rows = (await Reflect.apply(rawMethod, client, [strings])) as
          | Array<{ system_identifier: string; database_oid: string }>
          | undefined;
        const actual = rows?.[0]?.system_identifier ?? "";
        const actualOid = rows?.[0]?.database_oid ?? "";
        if (actual !== expectedSystemIdentifier || actualOid !== expectedDatabaseOid) {
          throw new PreviewIdentityMismatchError(
            actual, expectedSystemIdentifier, actualOid, expectedDatabaseOid, label,
          );
        }
      })();
    }
    return identityCheckPromise;
  };

  // Prisma model APIs are nested delegates (client.user.findMany()), not
  // root-level client functions. Proxy every delegate method so ORM queries
  // cannot bypass the identity check.
  const wrapDelegate = (delegate: object): object => {
    const cached = delegateProxyCache.get(delegate);
    if (cached) return cached;

    const guardedDelegate = new Proxy(delegate, {
      get(target, property) {
        const value = Reflect.get(target, property, target);
        if (typeof value !== "function") return value;

        return async (...args: unknown[]) => {
          await ensureIdentity();
          return Reflect.apply(value, target, args);
        };
      },
    });
    delegateProxyCache.set(delegate, guardedDelegate);
    return guardedDelegate;
  };

  const guardedClient = new Proxy(client, {
    get(target, property) {
      const value = Reflect.get(target, property, target);

      if (
        typeof property === "string" &&
        (property === "$queryRaw" ||
          property === "$queryRawUnsafe" ||
          property === "$executeRaw" ||
          property === "$executeRawUnsafe" ||
          property === "$transaction") &&
        typeof value === "function"
      ) {
        return async (...args: unknown[]) => {
          await ensureIdentity();
          return Reflect.apply(value, target, args);
        };
      }

      // Preserve Prisma extensions while ensuring the returned client is
      // guarded independently. The common application path does not need
      // extensions, but this prevents an accidental guard escape.
      if (property === "$extends" && typeof value === "function") {
        return (...args: unknown[]) =>
          withIdentityGuard(
            Reflect.apply(value, target, args) as object,
            expectedSystemIdentifier,
            expectedDatabaseOid,
            label,
          );
      }

      if (
        value !== null &&
        typeof value === "object" &&
        typeof property === "string" &&
        !property.startsWith("$")
      ) {
        return wrapDelegate(value);
      }

      return value;
    },
  });

  return guardedClient;
}

/** Shared factories used by OpenNext and the isolated local Workerd proof. */
export function createAppWorkerClientResolver() {
  return createRequestScopedClientResolver<AppPrismaClient, WorkerDatabaseEnv>(
    (_requestKey, env) => {
      const connectionString = env.DATABASE_URL;
      if (!connectionString) {
        throw new Error("Missing Cloudflare Worker secret: DATABASE_URL");
      }
      const expectedDatabaseOid = requireExpectedDatabaseOid(env.HEAVIX_APP_PREVIEW_DATABASE_OID, "App");
      const client = new AppPrismaClient({
        adapter: new PrismaPostgresAdapter({ connectionString }),
        log: ["error", "warn"],
      });
      return withIdentityGuard(client, EXPECTED_APP_SYSTEM_IDENTIFIER, expectedDatabaseOid, "App");
    },
  );
}

export function createStoreWorkerClientResolver() {
  return createRequestScopedClientResolver<StorePrismaClient, WorkerDatabaseEnv>(
    (_requestKey, env) => {
      const connectionString = env.STORE_DATABASE_URL;
      if (!connectionString) {
        throw new Error("Missing Cloudflare Worker secret: STORE_DATABASE_URL");
      }
      const expectedDatabaseOid = requireExpectedDatabaseOid(env.HEAVIX_STORE_PREVIEW_DATABASE_OID, "Store");
      const client = new StorePrismaClient({
        adapter: new PrismaPostgresAdapter({ connectionString }),
        log: ["error", "warn"],
      });
      return withIdentityGuard(client, EXPECTED_STORE_SYSTEM_IDENTIFIER, expectedDatabaseOid, "Store");
    },
  );
}

export type { AppPrismaClient, StorePrismaClient };
