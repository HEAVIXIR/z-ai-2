import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  requirePermission: vi.fn(),
  getUserPermissions: vi.fn(),
  findGroups: vi.fn(),
  findStandalone: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

vi.mock("@/lib/authorization", () => ({
  requirePermission: mocks.requirePermission,
}));

vi.mock("@/lib/rbac", () => ({
  getUserPermissions: mocks.getUserPermissions,
}));

vi.mock("@/lib/db", () => ({
  db: {
    adminNavigationGroup: { findMany: mocks.findGroups },
    adminNavigationItem: { findMany: mocks.findStandalone },
  },
}));

const { GET } = await import("@/app/api/admin/navigation/route");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue({ id: "admin-1", status: "ACTIVE" });
  mocks.requirePermission.mockResolvedValue(undefined);
  mocks.getUserPermissions.mockResolvedValue([
    "admin.navigation.read",
    "listing.read",
  ]);
  mocks.findGroups.mockResolvedValue([
    {
      key: "market",
      titleFa: "بازار",
      titleEn: null,
      icon: null,
      sortOrder: 1,
      items: [
        {
          key: "listings",
          titleFa: "آگهی‌ها",
          titleEn: null,
          href: "/admin/listings",
          icon: null,
          permissionKey: "listing.read",
        },
        {
          key: "payments",
          titleFa: "پرداخت‌ها",
          titleEn: null,
          href: "/admin/payments",
          icon: null,
          permissionKey: "payment.read",
        },
        {
          key: "general",
          titleFa: "عمومی",
          titleEn: null,
          href: "/admin/general",
          icon: null,
          permissionKey: null,
        },
      ],
    },
    {
      key: "hidden",
      titleFa: "پنهان",
      titleEn: null,
      icon: null,
      sortOrder: 2,
      items: [
        {
          key: "users",
          titleFa: "کاربران",
          titleEn: null,
          href: "/admin/users",
          icon: null,
          permissionKey: "user.read",
        },
      ],
    },
  ]);
  mocks.findStandalone.mockResolvedValue([
    {
      key: "dashboard",
      titleFa: "داشبورد",
      titleEn: null,
      href: "/admin/dashboard",
      icon: null,
      permissionKey: "admin.dashboard.read",
    },
    {
      key: "listings",
      titleFa: "آگهی‌ها",
      titleEn: null,
      href: "/admin/listings",
      icon: null,
      permissionKey: "listing.read",
    },
  ]);
});

describe("GET /api/admin/navigation authorization boundary", () => {
  it("returns 401 and performs no permission or database lookup without a user", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(mocks.requirePermission).not.toHaveBeenCalled();
    expect(mocks.getUserPermissions).not.toHaveBeenCalled();
    expect(mocks.findGroups).not.toHaveBeenCalled();
    expect(mocks.findStandalone).not.toHaveBeenCalled();
  });

  it("returns 403 for non-active accounts before permission lookup", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "suspended-1", status: "SUSPENDED" });

    const response = await GET();

    expect(response.status).toBe(403);
    expect(mocks.requirePermission).not.toHaveBeenCalled();
    expect(mocks.findGroups).not.toHaveBeenCalled();
  });

  it("returns 403 when the canonical navigation permission is denied", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("Forbidden"));

    const response = await GET();

    expect(response.status).toBe(403);
    expect(mocks.getUserPermissions).not.toHaveBeenCalled();
    expect(mocks.findGroups).not.toHaveBeenCalled();
    expect(mocks.findStandalone).not.toHaveBeenCalled();
  });

  it("fails closed if the resolved permission set no longer contains the gate permission", async () => {
    mocks.getUserPermissions.mockResolvedValue(["listing.read"]);

    const response = await GET();

    expect(response.status).toBe(403);
    expect(mocks.findGroups).not.toHaveBeenCalled();
    expect(mocks.findStandalone).not.toHaveBeenCalled();
  });

  it("returns only items allowed by the user's permissions", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.requirePermission).toHaveBeenCalledWith(
      "admin-1",
      "admin.navigation.read",
    );
    expect(body.data.mode).toBe("rbac");
    expect(body.data.groups).toHaveLength(1);
    expect(body.data.groups[0].items.map((item: { key: string }) => item.key))
      .toEqual(["listings", "general"]);
    expect(body.data.standalone.map((item: { key: string }) => item.key))
      .toEqual(["listings"]);
    expect(JSON.stringify(body)).not.toContain("/admin/payments");
    expect(JSON.stringify(body)).not.toContain("/admin/users");
    expect(JSON.stringify(body)).not.toContain("/admin/dashboard");
  });
});
