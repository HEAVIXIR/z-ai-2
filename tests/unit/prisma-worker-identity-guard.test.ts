import { describe, expect, it, vi } from "vitest";
import { withIdentityGuard } from "@/lib/prisma-worker-clients";
import { createRequestScopedPrismaProxy } from "@/lib/prisma-worker-proxy";

function fakePrismaPromise<T>(execute: () => T) {
  return {
    then(
      onFulfilled?: (value: T) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) {
      return Promise.resolve()
        .then(execute)
        .then(onFulfilled, onRejected);
    },
    requestTransaction: vi.fn(() => fakePrismaPromise(execute)),
    [Symbol.toStringTag]: "PrismaPromise",
  };
}

describe("Prisma Worker database identity guard", () => {
  it("verifies identity before executing a nested model query", async () => {
    const calls: string[] = [];
    const client = {
      $queryRaw: vi.fn(async (strings: TemplateStringsArray) => {
        calls.push("identity");
        expect(strings[0]).toContain("pg_control_system()");
        return [{ system_identifier: "preview-app-id" }];
      }),
      user: {
        findMany: vi.fn(() =>
          fakePrismaPromise(() => {
            calls.push("findMany");
            return [{ id: "preview-user" }];
          }),
        ),
      },
    };

    const guardedClient = withIdentityGuard(client, "preview-app-id", "App");
    const db = createRequestScopedPrismaProxy(() => guardedClient);
    const query = db.user.findMany();

    expect(calls).toEqual([]);
    await expect(query).resolves.toEqual([{ id: "preview-user" }]);

    expect(calls).toEqual(["identity", "findMany"]);
    expect(client.$queryRaw).toHaveBeenCalledTimes(1);
    expect(client.user.findMany).toHaveBeenCalledTimes(1);
  });

  it("blocks nested model query execution after an identity mismatch and caches failure", async () => {
    const execute = vi.fn(() => [{ id: "must-not-be-read" }]);
    const client = {
      $queryRaw: vi.fn(async () => [
        { system_identifier: "production-system-id" },
      ]),
      listing: {
        findMany: vi.fn(() => fakePrismaPromise(execute)),
      },
    };

    const guardedClient = withIdentityGuard(client, "preview-system-id", "App");
    const db = createRequestScopedPrismaProxy(() => guardedClient);
    const query = db.listing.findMany();

    await expect(query).rejects.toMatchObject({
      name: "PreviewIdentityMismatchError",
      expectedSystemIdentifier: "preview-system-id",
      actualSystemIdentifier: "production-system-id",
    });
    await expect(query).rejects.toMatchObject({
      name: "PreviewIdentityMismatchError",
    });

    expect(client.$queryRaw).toHaveBeenCalledTimes(1);
    expect(client.listing.findMany).toHaveBeenCalledTimes(1);
    expect(execute).not.toHaveBeenCalled();
  });

  it("shares one identity check across concurrent model queries", async () => {
    let releaseIdentity!: () => void;
    let markIdentityStarted!: () => void;
    const identityGate = new Promise<void>((resolve) => {
      releaseIdentity = resolve;
    });
    const identityStarted = new Promise<void>((resolve) => {
      markIdentityStarted = resolve;
    });
    const client = {
      $queryRaw: vi.fn(async () => {
        markIdentityStarted();
        await identityGate;
        return [{ system_identifier: "preview-store-id" }];
      }),
      product: {
        findMany: vi.fn(() =>
          fakePrismaPromise(() => ["products"]),
        ),
        count: vi.fn(() =>
          fakePrismaPromise(() => 3),
        ),
      },
    };

    const guarded = withIdentityGuard(client, "preview-store-id", "Store");
    const first = guarded.product.findMany();
    const second = guarded.product.count();

    await identityStarted;
    expect(client.$queryRaw).toHaveBeenCalledTimes(1);

    releaseIdentity();
    await expect(Promise.all([first, second])).resolves.toEqual([
      ["products"],
      3,
    ]);
    expect(client.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("preserves PrismaPromise requestTransaction for array transactions", async () => {
    const calls: string[] = [];
    const client = {
      $queryRaw: vi.fn(async () => {
        calls.push("identity");
        return [{ system_identifier: "preview-app-id" }];
      }),
      user: {
        update: vi.fn(() =>
          fakePrismaPromise(() => {
            calls.push("update");
            return { id: "updated-user" };
          }),
        ),
      },
      $transaction: vi.fn(async (queries: Array<{
        requestTransaction: (...args: unknown[]) => unknown;
      }>) => {
        calls.push("transaction");
        expect(typeof queries[0]?.requestTransaction).toBe("function");
        const transactional = queries.map((query) =>
          query.requestTransaction({ kind: "batch", id: "batch-1" }),
        );
        return Promise.all(transactional as PromiseLike<unknown>[]);
      }),
    };

    const guarded = withIdentityGuard(client, "preview-app-id", "App");
    const query = guarded.user.update();
    expect(typeof (query as { requestTransaction?: unknown }).requestTransaction)
      .toBe("function");

    await expect(guarded.$transaction([query])).resolves.toEqual([
      { id: "updated-user" },
    ]);

    expect(calls).toEqual(["identity", "transaction", "update"]);
    expect(client.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("preserves the raw-query PrismaPromise contract", async () => {
    const calls: string[] = [];
    const rawQuery = fakePrismaPromise(() => {
      calls.push("raw-query");
      return [{ result: 1 }];
    });
    const client = {
      $queryRaw: vi.fn((strings: TemplateStringsArray) => {
        if (strings[0].includes("pg_control_system()")) {
          calls.push("identity");
          return Promise.resolve([
            { system_identifier: "preview-app-id" },
          ]);
        }
        return rawQuery;
      }),
    };

    const guarded = withIdentityGuard(client, "preview-app-id", "App");
    const query = ["SELECT 1 AS result"] as unknown as TemplateStringsArray;
    const promise = guarded.$queryRaw(query);

    expect(typeof (promise as { requestTransaction?: unknown }).requestTransaction)
      .toBe("function");
    await expect(promise).resolves.toEqual([{ result: 1 }]);

    expect(calls).toEqual(["identity", "raw-query"]);
    expect(client.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it("blocks direct raw queries before forwarding them", async () => {
    const client = {
      $queryRaw: vi.fn((strings: TemplateStringsArray) => {
        if (strings[0].includes("pg_control_system()")) {
          return Promise.resolve([
            { system_identifier: "production-system-id" },
          ]);
        }
        return fakePrismaPromise(() => [{ result: 1 }]);
      }),
    };

    const guarded = withIdentityGuard(client, "preview-app-id", "App");
    const query = ["SELECT 1 AS result"] as unknown as TemplateStringsArray;

    await expect(guarded.$queryRaw(query)).rejects.toMatchObject({
      name: "PreviewIdentityMismatchError",
    });
    expect(client.$queryRaw).toHaveBeenCalledTimes(1);
  });
});
