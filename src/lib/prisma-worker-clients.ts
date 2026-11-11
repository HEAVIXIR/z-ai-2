import { PrismaClient as AppPrismaClient } from "./generated/worker-client/client";
import { PrismaClient as StorePrismaClient } from "./generated/store-worker-client/client";
import { PrismaPostgresAdapter } from "@prisma/adapter-ppg";
import { createRequestScopedClientResolver } from "./prisma-worker-proxy";

export type WorkerDatabaseEnv = {
  DATABASE_URL?: string;
  STORE_DATABASE_URL?: string;
};

const EXPECTED_APP_SYSTEM_IDENTIFIER = "7701427422680793119";
const EXPECTED_STORE_SYSTEM_IDENTIFIER = "7701425043360235551";

export class PreviewIdentityMismatchError extends Error {
  readonly expectedSystemIdentifier: string;
  readonly actualSystemIdentifier: string;
  readonly databaseLabel: string;
  constructor(actual: string, expected: string, label: string) {
    super(
      `${label} system_identifier mismatch: expected ${expected}, got ${actual}. The configured connection string does not point at the expected Preview database — refusing to execute queries.`,
    );
    this.name = "PreviewIdentityMismatchError";
    this.expectedSystemIdentifier = expected;
    this.actualSystemIdentifier = actual;
    this.databaseLabel = label;
  }
}

/**
 * Preserve PrismaPromise's lazy execution and requestTransaction contract.
 *
 * Prisma's array form of $transaction requires PrismaPromise objects, not
 * native Promises. An async delegate wrapper would erase requestTransaction
 * and make otherwise-valid db.$transaction([db.model.update(...)]) calls fail.
 * Identity is therefore checked when the PrismaPromise is consumed, while
 * the original promise's transaction methods and symbols remain available.
 */
function wrapPrismaPromise<T>(
  candidate: T,
  ensureIdentity: () => Promise<void>,
): T {
  if (
    candidate === null ||
    (typeof candidate !== "object" && typeof candidate !== "function")
  ) {
    return candidate;
  }

  const originalThen = Reflect.get(candidate as object, "then", candidate);
  if (typeof originalThen !== "function") return candidate;

  return new Proxy(candidate as object, {
    get(target, property) {
      const value = Reflect.get(target, property, target);

      if (property === "then" && typeof value === "function") {
        return (...args: unknown[]) =>
          ensureIdentity().then(
            () => Reflect.apply(value, target, args),
            (error: unknown) => {
              // Promise/thenable assimilation ignores the return value of
              // its then method. Forward identity failures to the supplied
              // rejection callback or an awaiting consumer would remain
              // pending forever even though the identity check had rejected.
              const onRejected = args[1];
              if (typeof onRejected === "function") {
                return Reflect.apply(onRejected, undefined, [error]);
              }
              throw error;
            },
          );
      }

      if (property === "requestTransaction" && typeof value === "function") {
        return (...args: unknown[]) =>
          wrapPrismaPromise(
            Reflect.apply(value, target, args),
            ensureIdentity,
          );
      }

      if (property === "catch" && typeof value === "function") {
        return (onRejected: (reason: unknown) => unknown) =>
          ensureIdentity().then(() =>
            Reflect.apply(value, target, [onRejected]),
          );
      }

      if (property === "finally" && typeof value === "function") {
        return (onFinally: (() => unknown) | undefined) =>
          ensureIdentity().then(() =>
            Reflect.apply(value, target, [onFinally]),
          );
      }

      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as T;
}

/**
 * Wraps a PrismaClient so its first executed query verifies database identity.
 * The check is cached per client instance; failures remain fail-closed.
 */
export function withIdentityGuard<TClient extends object>(
  client: TClient,
  expectedSystemIdentifier: string,
  label: string,
): TClient {
  let identityCheckPromise: Promise<void> | null = null;
  const delegateProxyCache = new WeakMap<object, object>();
  const identitySql =
    "SELECT system_identifier::text AS system_identifier FROM pg_control_system()";

  const ensureIdentity = (): Promise<void> => {
    if (!identityCheckPromise) {
      identityCheckPromise = (async () => {
        const rawMethod = Reflect.get(client, "$queryRaw", client) as
          | ((
              strings: TemplateStringsArray,
              ...values: unknown[]
            ) => Promise<unknown>)
          | undefined;
        if (typeof rawMethod !== "function") {
          throw new Error(
            label +
              ": $queryRaw not available on client — cannot verify identity",
          );
        }

        // Invoke the underlying client directly to avoid recursively entering
        // this guard. Prisma's tagged-template API requires the raw member.
        const strings = Object.assign([identitySql], {
          raw: [identitySql],
        }) as unknown as TemplateStringsArray;
        const rows = (await Reflect.apply(rawMethod, client, [strings])) as
          | Array<{ system_identifier: string }>
          | undefined;
        const actual = rows?.[0]?.system_identifier ?? "";
        if (actual !== expectedSystemIdentifier) {
          throw new PreviewIdentityMismatchError(
            actual,
            expectedSystemIdentifier,
            label,
          );
        }
      })();
    }
    return identityCheckPromise;
  };

  // Prisma model APIs are nested delegates (client.user.findMany()). Keep
  // their returned PrismaPromise lazy and preserve requestTransaction so the
  // array form of $transaction remains supported.
  const wrapDelegate = (delegate: object): object => {
    const cached = delegateProxyCache.get(delegate);
    if (cached) return cached;

    const guardedDelegate = new Proxy(delegate, {
      get(target, property) {
        const value = Reflect.get(target, property, target);
        if (typeof value !== "function") return value;

        return (...args: unknown[]) =>
          wrapPrismaPromise(
            Reflect.apply(value, target, args),
            ensureIdentity,
          );
      },
    });
    delegateProxyCache.set(delegate, guardedDelegate);
    return guardedDelegate;
  };

  const guardedClient = new Proxy(client, {
    get(target, property) {
      const value = Reflect.get(target, property, target);

      if (property === "$transaction" && typeof value === "function") {
        return (...args: unknown[]) =>
          ensureIdentity().then(() => Reflect.apply(value, target, args));
      }

      if (
        typeof property === "string" &&
        (property === "$queryRaw" ||
          property === "$queryRawUnsafe" ||
          property === "$executeRaw" ||
          property === "$executeRawUnsafe") &&
        typeof value === "function"
      ) {
        return (...args: unknown[]) =>
          wrapPrismaPromise(
            Reflect.apply(value, target, args),
            ensureIdentity,
          );
      }

      // Preserve Prisma extensions while ensuring the returned client is
      // guarded independently.
      if (property === "$extends" && typeof value === "function") {
        return (...args: unknown[]) =>
          withIdentityGuard(
            Reflect.apply(value, target, args) as object,
            expectedSystemIdentifier,
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
      const client = new AppPrismaClient({
        adapter: new PrismaPostgresAdapter({ connectionString }),
        log: ["error", "warn"],
      });
      return withIdentityGuard(
        client,
        EXPECTED_APP_SYSTEM_IDENTIFIER,
        "App",
      );
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
      const client = new StorePrismaClient({
        adapter: new PrismaPostgresAdapter({ connectionString }),
        log: ["error", "warn"],
      });
      return withIdentityGuard(
        client,
        EXPECTED_STORE_SYSTEM_IDENTIFIER,
        "Store",
      );
    },
  );
}

export type { AppPrismaClient, StorePrismaClient };
