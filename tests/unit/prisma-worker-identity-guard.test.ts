import { describe, expect, it, vi } from "vitest";
import { withIdentityGuard } from "@/lib/prisma-worker-clients";
import { createRequestScopedPrismaProxy } from "@/lib/prisma-worker-proxy";

describe("Prisma Worker database identity guard", () => {
  it("verifies identity before invoking a nested model delegate", async () => {
    const calls: string[] = [];
    const client = {
      $queryRaw: vi.fn(async (strings: TemplateStringsArray) => {
        calls.push("identity");
        expect(strings[0]).toContain("pg_control_system()");
        return [{ system_identifier: "preview-app-id" }];
      }),
      user: {
        findMany: vi.fn(async () => {
          calls.push("findMany");
          return [{ id: "preview-user" }];
        }),
      },
    };

    const guardedClient = withIdentityGuard(client, "preview-app-id", "App");
    const db = createRequestScopedPrismaProxy(() => guardedClient);
    await expect(db.user.findMany()).resolves.toEqual([
      { id: "preview-user" },
    ]);

    expect(calls).toEqual(["identity", "findMany"]);
    expect(client.$queryRaw).toHaveBeenCalledTimes(1);
    expect(client.user.findMany).toHaveBeenCalledTimes(1);
  });

  it("blocks nested model queries after an identity mismatch and caches failure", async () => {
    const client = {
      $queryRaw: vi.fn(async () => [
        { system_identifier: "production-system-id" },
      ]),
      listing: {
        findMany: vi.fn(async () => [{ id: "must-not-be-read" }]),
      },
    };

    const guardedClient = withIdentityGuard(client, "preview-system-id", "App");
    const db = createRequestScopedPrismaProxy(() => guardedClient);

    await expect(db.listing.findMany()).rejects.toMatchObject({
      name: "PreviewIdentityMismatchError",
      expectedSystemIdentifier: "preview-system-id",
      actualSystemIdentifier: "production-system-id",
    });
    await expect(db.listing.findMany()).rejects.toMatchObject({
      name: "PreviewIdentityMismatchError",
    });

    expect(client.$queryRaw).toHaveBeenCalledTimes(1);
    expect(client.listing.findMany).not.toHaveBeenCalled();
  });

  it("shares one identity check across concurrent model queries", async () => {
    let releaseIdentity!: () => void;
    const identityGate = new Promise<void>((resolve) => {
      releaseIdentity = resolve;
    });
    const client = {
      $queryRaw: vi.fn(async () => {
        await identityGate;
        return [{ system_identifier: "preview-store-id" }];
      }),
      product: {
        findMany: vi.fn(async () => ["products"]),
        count: vi.fn(async () => 3),
      },
    };

    const guarded = withIdentityGuard(client, "preview-store-id", "Store");
    const first = guarded.product.findMany();
    const second = guarded.product.count();

    await Promise.resolve();
    expect(client.$queryRaw).toHaveBeenCalledTimes(1);
    expect(client.product.findMany).not.toHaveBeenCalled();
    expect(client.product.count).not.toHaveBeenCalled();

    releaseIdentity();
    await expect(Promise.all([first, second])).resolves.toEqual([
      ["products"],
      3,
    ]);
    expect(client.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("guards direct raw queries before forwarding them", async () => {
    const client = {
      $queryRaw: vi.fn(async (strings: TemplateStringsArray) => {
        if (strings[0].includes("pg_control_system()")) {
          return [{ system_identifier: "preview-app-id" }];
        }
        return [{ result: 1 }];
      }),
      user: {
        findMany: vi.fn(async () => []),
      },
    };

    const guarded = withIdentityGuard(client, "preview-app-id", "App");
    const query = ["SELECT 1 AS result"] as unknown as TemplateStringsArray;
    const rows = await guarded.$queryRaw(query);

    expect(rows).toEqual([{ result: 1 }]);
    expect(client.$queryRaw).toHaveBeenCalledTimes(2);
  });
});
