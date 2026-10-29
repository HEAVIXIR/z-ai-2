/**
 * HEAVIX — Issue #112: exercise the real admin-guard implementation.
 *
 * Unlike auction-end-rbac.test.ts, this suite does not mock requireAdmin
 * or adminGuard. It isolates only session identity and RBAC persistence
 * boundaries, then executes the actual guard and HTTP response mapping.
 *
 * This is a guard-contract test, NOT a database-backed session integration
 * test. The latter remains a separate acceptance gate before claiming
 * end-to-end authentication is proven.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUser = vi.hoisted(() => vi.fn());
const isAdmin = vi.hoisted(() => vi.fn());
const can = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({ getCurrentUser }));
vi.mock("@/lib/authorization", () => ({ isAdmin, can }));

import { adminGuard, requireAdmin } from "@/lib/admin-guard";

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue(null);
  isAdmin.mockResolvedValue(false);
  can.mockResolvedValue(false);
});

describe("Issue #112 — real requireAdmin/adminGuard contract", () => {
  it("returns 401 for an anonymous request", async () => {
    const [user, error] = await requireAdmin("auction.manage");

    expect(user).toBeNull();
    expect(error?.status).toBe(401);
    expect(isAdmin).not.toHaveBeenCalled();
    expect(can).not.toHaveBeenCalled();
  });

  it("returns 403 for an authenticated buyer without the permission", async () => {
    getCurrentUser.mockResolvedValue({ id: "buyer-1", firstName: "Buyer" });
    isAdmin.mockResolvedValue(false);
    can.mockResolvedValue(false);

    const [user, error] = await requireAdmin("auction.manage");

    expect(user).toBeNull();
    expect(error?.status).toBe(403);
    expect(isAdmin).toHaveBeenCalledWith("buyer-1");
    expect(can).toHaveBeenCalledWith("buyer-1", "auction.manage");
  });

  it("does not give an ADMIN role an implicit permission bypass", async () => {
    getCurrentUser.mockResolvedValue({ id: "admin-1", firstName: "Admin" });
    isAdmin.mockResolvedValue(true);
    can.mockResolvedValue(false);

    const [user, error] = await requireAdmin("auction.manage");

    expect(user).toBeNull();
    expect(error?.status).toBe(403);
    expect(can).toHaveBeenCalledWith("admin-1", "auction.manage");
  });

  it("returns the verified identity only when the requested permission is present", async () => {
    getCurrentUser.mockResolvedValue({ id: "admin-2", firstName: "Authorized" });
    isAdmin.mockResolvedValue(true);
    can.mockResolvedValue(true);

    const [user, error] = await requireAdmin("auction.manage");

    expect(error).toBeNull();
    expect(user).toEqual({ id: "admin-2", firstName: "Authorized" });
    expect(can).toHaveBeenCalledWith("admin-2", "auction.manage");
  });

  it("permits a non-admin only when the explicit permission is granted", async () => {
    getCurrentUser.mockResolvedValue({ id: "operator-1", firstName: "Operator" });
    isAdmin.mockResolvedValue(false);
    can.mockResolvedValue(true);

    const result = await adminGuard("auction.manage");

    expect(result).toEqual({ id: "operator-1", firstName: "Operator" });
    expect(can).toHaveBeenCalledWith("operator-1", "auction.manage");
  });
});
