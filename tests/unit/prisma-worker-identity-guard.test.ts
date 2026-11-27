import { describe, expect, it, vi } from "vitest";
import { createAppWorkerClientResolver, createStoreWorkerClientResolver, withIdentityGuard } from "@/lib/prisma-worker-clients";
import { createRequestScopedPrismaProxy } from "@/lib/prisma-worker-proxy";

function lazyPrismaPromise<T>(execute: () => T | Promise<T>) {
  let execution: Promise<T> | undefined;
  const run = () => execution ??= Promise.resolve().then(execute);
  const promise = {
    then(onFulfilled?: (value: T) => unknown, onRejected?: (reason: unknown) => unknown) {
      return run().then(onFulfilled, onRejected);
    },
    catch(onRejected?: (reason: unknown) => unknown) {
      return promise.then(undefined, onRejected);
    },
    finally(onFinally?: () => unknown) {
      return promise.then(
        (value) => Promise.resolve(onFinally?.()).then(() => value),
        (reason) => Promise.resolve(onFinally?.()).then(() => { throw reason; }),
      );
    },
    requestTransaction(_transaction: unknown) {
      return lazyPrismaPromise(execute);
    },
    [Symbol.toStringTag]: "PrismaPromise",
  };
  return promise;
}


describe("Prisma Worker expected database OID configuration", () => {
  const invalidOids = ["", "0", "4294967296", "01", "1.2", "-1", " 123"];

  it("fails closed for App when the trusted database OID is missing", () => {
    const resolveApp = createAppWorkerClientResolver();
    expect(() => resolveApp({}, { DATABASE_URL: "postgresql://unused" }))
      .toThrow(/missing or invalid HEAVIX database OID/);
  });

  it("fails closed for Store when the trusted database OID is missing", () => {
    const resolveStore = createStoreWorkerClientResolver();
    expect(() => resolveStore({}, { STORE_DATABASE_URL: "postgresql://unused" }))
      .toThrow(/missing or invalid HEAVIX database OID/);
  });

  it.each(invalidOids)("rejects malformed App database OID %j before client creation", (oid) => {
    const resolveApp = createAppWorkerClientResolver();
    expect(() => resolveApp({}, {
      DATABASE_URL: "postgresql://unused",
      HEAVIX_APP_PREVIEW_DATABASE_OID: oid,
    })).toThrow(/missing or invalid HEAVIX database OID/);
  });

  it.each(invalidOids)("rejects malformed Store database OID %j before client creation", (oid) => {
    const resolveStore = createStoreWorkerClientResolver();
    expect(() => resolveStore({}, {
      STORE_DATABASE_URL: "postgresql://unused",
      HEAVIX_STORE_PREVIEW_DATABASE_OID: oid,
    })).toThrow(/missing or invalid HEAVIX database OID/);
  });
});

describe("Prisma Worker database identity guard", () => {
  it("verifies identity before invoking a nested model delegate", async () => {
    const calls: string[] = [];
    const client = {
      $queryRaw: vi.fn(async (strings: TemplateStringsArray) => {
        calls.push("identity");
        expect(strings[0]).toContain("pg_control_system()");
        expect(strings[0]).toContain("pg_database");
        return [{ system_identifier: "preview-app-id", database_oid: "101" }];
      }),
      user: {
        findMany: vi.fn(() => lazyPrismaPromise(() => {
          calls.push("findMany");
          return [{ id: "preview-user" }];
        })),
      },
    };

    const guardedClient = withIdentityGuard(client, "preview-app-id", "101", "App");
    const db = createRequestScopedPrismaProxy(() => guardedClient);
    await expect(db.user.findMany()).resolves.toEqual([
      { id: "preview-user" },
    ]);

    expect(calls).toEqual(["identity", "findMany"]);
    expect(client.$queryRaw).toHaveBeenCalledTimes(1);
    expect(client.user.findMany).toHaveBeenCalledTimes(1);
  });

  it("blocks nested model queries after an identity mismatch and caches failure", async () => {
    let queryExecutions = 0;
    const client = {
      $queryRaw: vi.fn(async () => [
        { system_identifier: "production-system-id", database_oid: "202" },
      ]),
      listing: {
        findMany: vi.fn(() => lazyPrismaPromise(() => {
          queryExecutions += 1;
          return [{ id: "must-not-be-read" }];
        })),
      },
    };

    const guardedClient = withIdentityGuard(client, "preview-system-id", "101", "App");
    const db = createRequestScopedPrismaProxy(() => guardedClient);

    await expect(db.listing.findMany()).rejects.toMatchObject({
      name: "PreviewIdentityMismatchError",
      expectedSystemIdentifier: "preview-system-id",
      actualSystemIdentifier: "production-system-id",
      expectedDatabaseOid: "101",
      actualDatabaseOid: "202",
    });
    await expect(db.listing.findMany()).rejects.toMatchObject({
      name: "PreviewIdentityMismatchError",
    });

    expect(client.$queryRaw).toHaveBeenCalledTimes(1);
    // Two lazy PrismaPromises may be created; neither executor may run after a mismatch.
    expect(client.listing.findMany).toHaveBeenCalledTimes(2);
    expect(queryExecutions).toBe(0);
  });

  it("blocks a different database on the expected cluster", async () => {
    const client = {
      $queryRaw: vi.fn(async () => [
        { system_identifier: "preview-system-id", database_oid: "wrong-database-oid" },
      ]),
      listing: { findMany: vi.fn(() => lazyPrismaPromise(() => [{ id: "must-not-be-read" }])) },
    };
    const guarded = withIdentityGuard(client, "preview-system-id", "expected-database-oid", "App");
    await expect(guarded.listing.findMany()).rejects.toMatchObject({
      name: "PreviewIdentityMismatchError",
      expectedDatabaseOid: "expected-database-oid",
      actualDatabaseOid: "wrong-database-oid",
    });
    expect(client.listing.findMany).toHaveBeenCalledTimes(1);
  });

  it("shares one identity check across concurrent model queries", async () => {
    let releaseIdentity!: () => void;
    const identityGate = new Promise<void>((resolve) => {
      releaseIdentity = resolve;
    });
    const client = {
      $queryRaw: vi.fn(async () => {
        await identityGate;
        return [{ system_identifier: "preview-store-id", database_oid: "303" }];
      }),
      product: {
        findMany: vi.fn(() => lazyPrismaPromise(() => ["products"])),
        count: vi.fn(() => lazyPrismaPromise(() => 3)),
      },
    };

    const guarded = withIdentityGuard(client, "preview-store-id", "303", "Store");
    const first = guarded.product.findMany();
    const second = guarded.product.count();
    expect(client.product.findMany).toHaveBeenCalledTimes(1);
    expect(client.product.count).toHaveBeenCalledTimes(1);
    const combined = Promise.all([first, second]);

    await Promise.resolve();
    expect(client.$queryRaw).toHaveBeenCalledTimes(1);

    releaseIdentity();
    await expect(combined).resolves.toEqual([
      ["products"],
      3,
    ]);
    expect(client.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("preserves lazy PrismaPromise requestTransaction for array transactions", async () => {
    const events: string[] = [];
    const client = {
      $queryRaw: vi.fn(async () => {
        events.push("identity");
        return [{ system_identifier: "preview-app-id", database_oid: "101" }];
      }),
      user: {
        findMany: vi.fn(() => lazyPrismaPromise(() => {
          events.push("array-query");
          return [{ id: "preview-user" }];
        })),
      },
      $transaction: vi.fn(async (queries: Array<{ requestTransaction: (tx: unknown) => unknown }>) => {
        events.push("transaction");
        return Promise.all(queries.map((query) => query.requestTransaction({ kind: "batch" })));
      }),
    };
    const guarded = withIdentityGuard(client, "preview-app-id", "101", "App");
    const query = guarded.user.findMany();

    expect(events).toEqual([]);
    expect(typeof query.requestTransaction).toBe("function");

    await expect(guarded.$transaction([query])).resolves.toEqual([
      [{ id: "preview-user" }],
    ]);
    expect(events).toEqual(["identity", "transaction", "array-query"]);
  });

  it("guards direct raw queries before forwarding them", async () => {
    const client = {
      $queryRaw: vi.fn((strings: TemplateStringsArray) => {
        if (strings[0].includes("pg_control_system()")) {
          return Promise.resolve([{ system_identifier: "preview-app-id", database_oid: "101" }]);
        }
        return lazyPrismaPromise(() => [{ result: 1 }]);
      }),
      user: {
        findMany: vi.fn(async () => []),
      },
    };

    const guarded = withIdentityGuard(client, "preview-app-id", "101", "App");
    const query = ["SELECT 1 AS result"] as unknown as TemplateStringsArray;
    const rows = await guarded.$queryRaw(query);

    expect(rows).toEqual([{ result: 1 }]);
    expect(client.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it("guards the interactive transaction client on its own transaction connection", async () => {
    const events: string[] = [];
    const transactionClient = {
      $queryRaw: vi.fn(async () => {
        events.push("transaction-identity");
        return [{ system_identifier: "preview-app-id", database_oid: "101" }];
      }),
      user: {
        findMany: vi.fn(() => lazyPrismaPromise(() => {
          events.push("transaction-query");
          return [{ id: "inside-transaction" }];
        })),
      },
    };
    const client = {
      $queryRaw: vi.fn(async () => {
        events.push("root-identity");
        return [{ system_identifier: "preview-app-id", database_oid: "101" }];
      }),
      $transaction: vi.fn(async (callback: (tx: typeof transactionClient) => Promise<unknown>) =>
        callback(transactionClient)),
    };

    const guarded = withIdentityGuard(client, "preview-app-id", "101", "App");
    await expect(guarded.$transaction(async (tx) => tx.user.findMany())).resolves.toEqual([
      { id: "inside-transaction" },
    ]);

    expect(events).toEqual(["root-identity", "transaction-identity", "transaction-query"]);
    expect(client.$queryRaw).toHaveBeenCalledTimes(1);
    expect(transactionClient.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("rejects an interactive transaction whose transaction connection has the wrong database", async () => {
    let transactionQueryExecutions = 0;
    const transactionClient = {
      $queryRaw: vi.fn(async () => [
        { system_identifier: "preview-app-id", database_oid: "wrong-oid" },
      ]),
      user: {
        findMany: vi.fn(() => lazyPrismaPromise(() => {
          transactionQueryExecutions += 1;
          return [{ id: "must-not-run" }];
        })),
      },
    };
    const client = {
      $queryRaw: vi.fn(async () => [
        { system_identifier: "preview-app-id", database_oid: "101" },
      ]),
      $transaction: vi.fn(async (callback: (tx: typeof transactionClient) => Promise<unknown>) =>
        callback(transactionClient)),
    };

    const guarded = withIdentityGuard(client, "preview-app-id", "101", "App");
    await expect(
      guarded.$transaction(async (tx) => tx.user.findMany()),
    ).rejects.toMatchObject({
      name: "PreviewIdentityMismatchError",
      expectedDatabaseOid: "101",
      actualDatabaseOid: "wrong-oid",
    });

    expect(client.$queryRaw).toHaveBeenCalledTimes(1);
    expect(transactionClient.$queryRaw).toHaveBeenCalledTimes(1);
    expect(transactionQueryExecutions).toBe(0);
  });

  it("reuses a successful identity proof across request-scoped clients in one Worker isolate", async () => {
    const cacheKey = "test://app-preview/same-target";
    const firstClient = {
      $queryRaw: vi.fn(async () => [
        { system_identifier: "preview-app-id", database_oid: "101" },
      ]),
      user: { findMany: vi.fn(() => lazyPrismaPromise(() => ["first"])) },
    };
    const secondClient = {
      $queryRaw: vi.fn(async () => [
        { system_identifier: "preview-app-id", database_oid: "101" },
      ]),
      user: { findMany: vi.fn(() => lazyPrismaPromise(() => ["second"])) },
    };

    const first = withIdentityGuard(firstClient, "preview-app-id", "101", "App", cacheKey);
    const second = withIdentityGuard(secondClient, "preview-app-id", "101", "App", cacheKey);
    await expect(first.user.findMany()).resolves.toEqual(["first"]);
    await expect(second.user.findMany()).resolves.toEqual(["second"]);

    expect(firstClient.$queryRaw).toHaveBeenCalledTimes(1);
    expect(secondClient.$queryRaw).not.toHaveBeenCalled();
    expect(firstClient.user.findMany).toHaveBeenCalledTimes(1);
    expect(secondClient.user.findMany).toHaveBeenCalledTimes(1);
  });

  it("shares one in-flight identity proof across concurrent request clients", async () => {
    const cacheKey = "test://app-preview/concurrent-requests";
    let releaseIdentity!: () => void;
    const identityGate = new Promise<void>((resolve) => {
      releaseIdentity = resolve;
    });
    const firstClient = {
      $queryRaw: vi.fn(async () => {
        await identityGate;
        return [{ system_identifier: "preview-app-id", database_oid: "101" }];
      }),
      user: { findMany: vi.fn(() => lazyPrismaPromise(() => ["first"])) },
    };
    const secondClient = {
      $queryRaw: vi.fn(async () => [
        { system_identifier: "preview-app-id", database_oid: "101" },
      ]),
      user: { findMany: vi.fn(() => lazyPrismaPromise(() => ["second"])) },
    };

    const first = withIdentityGuard(firstClient, "preview-app-id", "101", "App", cacheKey);
    const second = withIdentityGuard(secondClient, "preview-app-id", "101", "App", cacheKey);
    const firstResult = first.user.findMany();
    const secondResult = second.user.findMany();
    // Prisma promises are lazy: consume them before waiting for the guard.
    const combined = Promise.all([firstResult, secondResult]);

    // Wait for the asynchronous lazy-PrismaPromise guard to start its identity
    // query before asserting that the second request joined the in-flight proof.
    await vi.waitFor(() => {
      expect(firstClient.$queryRaw).toHaveBeenCalledTimes(1);
    });
    expect(secondClient.$queryRaw).not.toHaveBeenCalled();
    releaseIdentity();
    await expect(combined).resolves.toEqual([
      ["first"],
      ["second"],
    ]);
  });

  it("does not reuse identity proof across different expected database identities", async () => {
    const cacheKey = "test://app-preview/same-connection";
    const firstClient = {
      $queryRaw: vi.fn(async () => [
        { system_identifier: "preview-app-id", database_oid: "101" },
      ]),
      user: { findMany: vi.fn(() => lazyPrismaPromise(() => ["first"])) },
    };
    const secondClient = {
      $queryRaw: vi.fn(async () => [
        { system_identifier: "preview-app-id", database_oid: "202" },
      ]),
      user: { findMany: vi.fn(() => lazyPrismaPromise(() => ["second"])) },
    };

    const first = withIdentityGuard(firstClient, "preview-app-id", "101", "App", cacheKey);
    const second = withIdentityGuard(secondClient, "preview-app-id", "202", "App", cacheKey);
    await expect(first.user.findMany()).resolves.toEqual(["first"]);
    await expect(second.user.findMany()).resolves.toEqual(["second"]);

    expect(firstClient.$queryRaw).toHaveBeenCalledTimes(1);
    expect(secondClient.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("does not cache a failed identity query for later requests", async () => {
    const cacheKey = "test://app-preview/retry-after-error";
    const failedClient = {
      $queryRaw: vi.fn(async () => { throw new Error("temporary identity query failure"); }),
      user: { findMany: vi.fn(() => lazyPrismaPromise(() => ["must-not-run"])) },
    };
    const recoveredClient = {
      $queryRaw: vi.fn(async () => [
        { system_identifier: "preview-app-id", database_oid: "101" },
      ]),
      user: { findMany: vi.fn(() => lazyPrismaPromise(() => ["recovered"])) },
    };

    const failed = withIdentityGuard(failedClient, "preview-app-id", "101", "App", cacheKey);
    await expect(failed.user.findMany()).rejects.toThrow("temporary identity query failure");
    const recovered = withIdentityGuard(recoveredClient, "preview-app-id", "101", "App", cacheKey);
    await expect(recovered.user.findMany()).resolves.toEqual(["recovered"]);

    expect(failedClient.$queryRaw).toHaveBeenCalledTimes(1);
    expect(recoveredClient.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("revalidates a successful identity proof after the isolate cache TTL", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-27T00:00:00.000Z"));
    try {
      const cacheKey = "test://app-preview/ttl-expiry";
      const firstClient = {
        $queryRaw: vi.fn(async () => [
          { system_identifier: "preview-app-id", database_oid: "101" },
        ]),
        user: { findMany: vi.fn(() => lazyPrismaPromise(() => ["first"])) },
      };
      const secondClient = {
        $queryRaw: vi.fn(async () => [
          { system_identifier: "production-system-id", database_oid: "202" },
        ]),
        user: { findMany: vi.fn(() => lazyPrismaPromise(() => ["must-not-run"])) },
      };

      await expect(
        withIdentityGuard(firstClient, "preview-app-id", "101", "App", cacheKey).user.findMany(),
      ).resolves.toEqual(["first"]);
      vi.setSystemTime(new Date("2026-11-27T00:01:01.000Z"));
      await expect(
        withIdentityGuard(secondClient, "preview-app-id", "101", "App", cacheKey).user.findMany(),
      ).rejects.toMatchObject({
        name: "PreviewIdentityMismatchError",
        expectedDatabaseOid: "101",
        actualDatabaseOid: "202",
      });

      expect(firstClient.$queryRaw).toHaveBeenCalledTimes(1);
      expect(secondClient.$queryRaw).toHaveBeenCalledTimes(1);
      expect(secondClient.user.findMany).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps identity checks request-local when no isolate cache key is supplied", async () => {
    const firstClient = {
      $queryRaw: vi.fn(async () => [
        { system_identifier: "preview-app-id", database_oid: "101" },
      ]),
      user: { findMany: vi.fn(() => lazyPrismaPromise(() => ["first"])) },
    };
    const secondClient = {
      $queryRaw: vi.fn(async () => [
        { system_identifier: "preview-app-id", database_oid: "101" },
      ]),
      user: { findMany: vi.fn(() => lazyPrismaPromise(() => ["second"])) },
    };

    await expect(
      withIdentityGuard(firstClient, "preview-app-id", "101", "App").user.findMany(),
    ).resolves.toEqual(["first"]);
    await expect(
      withIdentityGuard(secondClient, "preview-app-id", "101", "App").user.findMany(),
    ).resolves.toEqual(["second"]);

    expect(firstClient.$queryRaw).toHaveBeenCalledTimes(1);
    expect(secondClient.$queryRaw).toHaveBeenCalledTimes(1);
  });

});
