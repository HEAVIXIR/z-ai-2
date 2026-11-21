import { describe, expect, it, vi } from "vitest";
import {
  createRequestScopedClientResolver,
  createRequestScopedPrismaProxy,
} from "@/lib/prisma-worker-proxy";

describe("request-scoped Prisma proxy", () => {
  it("reuses one client for a request key and isolates other request keys", async () => {
    let nextId = 0;
    const createClient = vi.fn(() => {
      const id = ++nextId;
      return {
        id,
        user: {
          findMany: vi.fn(() => id),
          fields: { id: "id" },
        },
        $transaction: vi.fn(async (callback: (tx: unknown) => unknown) =>
          callback({ user: { findMany: () => id } }),
        ),
      };
    });
    const resolveClient = createRequestScopedClientResolver(
      (_requestKey: object, _env: undefined) => createClient(),
    );
    const dbFor = (requestKey: object) =>
      createRequestScopedPrismaProxy(() => resolveClient(requestKey, undefined)) as any;

    const firstKey = {};
    const secondKey = {};
    const firstDb = dbFor(firstKey);
    const secondDb = dbFor(secondKey);
    expect(await firstDb.user.findMany()).toBe(1);
    expect(await firstDb.user.findMany()).toBe(1);
    expect(await secondDb.user.findMany()).toBe(2);
    expect(await firstDb.user.findMany()).toBe(1);
    expect(createClient).toHaveBeenCalledTimes(2);
  });

  it("does not resolve a request client until a Prisma method is invoked", async () => {
    const getClient = vi.fn(() => ({
      user: { findMany: vi.fn().mockResolvedValue([{ id: "ok" }]) },
    }));
    const db = createRequestScopedPrismaProxy(getClient) as any;
    const delegate = db.user;
    const findMany = delegate.findMany;
    expect(getClient).not.toHaveBeenCalled();
    await expect(findMany()).resolves.toEqual([{ id: "ok" }]);
    expect(getClient).toHaveBeenCalledTimes(1);
  });

  it("routes transactions through the current request client", async () => {
    const resolveClient = createRequestScopedClientResolver(
      (_requestKey: object, _env: undefined) => ({
        $transaction: vi.fn(async (callback: (tx: unknown) => unknown) =>
          callback({ user: { findMany: () => "request-result" } }),
        ),
      }),
    );
    const dbFor = (requestKey: object) =>
      createRequestScopedPrismaProxy(() => resolveClient(requestKey, undefined)) as any;
    await expect(dbFor({}).$transaction((tx: any) => tx.user.findMany())).resolves.toBe("request-result");
    await expect(dbFor({}).$transaction((tx: any) => tx.user.findMany())).resolves.toBe("request-result");
  });
});
