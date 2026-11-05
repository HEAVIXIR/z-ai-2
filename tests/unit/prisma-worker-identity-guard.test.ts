import { describe, expect, it, vi } from "vitest";
import { withIdentityGuard } from "@/lib/prisma-worker-clients";
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

});
