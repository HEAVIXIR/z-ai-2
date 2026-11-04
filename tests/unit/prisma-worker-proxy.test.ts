import { describe, expect, it, vi } from "vitest";
import {
  createRequestScopedClientResolver,
  createRequestScopedPrismaProxy,
} from "@/lib/prisma-worker-proxy";

describe("request-scoped Prisma proxy", () => {
  it("reuses one client within a request and isolates the next request", async () => {
    let requestKey: object = {};
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
    const getClient = createRequestScopedClientResolver(
      () => requestKey,
      createClient,
    );
    const db = createRequestScopedPrismaProxy(getClient) as any;

    expect(await db.user.findMany()).toBe(1);
    expect(await db.user.findMany()).toBe(1);
    expect(createClient).toHaveBeenCalledTimes(1);

    requestKey = {};
    expect(await db.user.findMany()).toBe(2);
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
    let requestKey: object = {};
    const getClient = createRequestScopedClientResolver(
      () => requestKey,
      () => ({
        $transaction: vi.fn(async (callback: (tx: unknown) => unknown) =>
          callback({ user: { findMany: () => "request-result" } }),
        ),
      }),
    );
    const db = createRequestScopedPrismaProxy(getClient) as any;

    await expect(db.$transaction((tx: any) => tx.user.findMany())).resolves.toBe(
      "request-result",
    );
    requestKey = {};
    await expect(db.$transaction((tx: any) => tx.user.findMany())).resolves.toBe(
      "request-result",
    );
  });
});
