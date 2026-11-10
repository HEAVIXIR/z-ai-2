import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUser,
  requirePermission,
  getUserPermissions,
  findGroups,
  findStandalone,
} = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  requirePermission: vi.fn(),
  getUserPermissions: vi.fn(),
  findGroups: vi.fn(),
  findStandalone: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser }));
vi.mock("@/lib/authorization", () => ({ requirePermission }));
vi.mock("@/lib/rbac", () => ({ getUserPermissions }));
vi.mock("@/lib/db", () => ({
  db: {
    adminNavigationGroup: { findMany: findGroups },
    adminNavigationItem: { findMany: findStandalone },
  },
}));

import { GET } from "@/app/api/admin/navigation/route";

describe("GET /api/admin/navigation — canonical RBAC", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUser.mockResolvedValue({ id: "admin-1" });
    requirePermission.mockResolvedValue(undefined);
    getUserPermissions.mockResolvedValue(["admin.navigation.read", "order.read", "store.read"]);
    findGroups.mockResolvedValue([
      {
        key: "store",
        titleFa: "فروشگاه",
        titleEn: "Store",
        icon: "store",
        sortOrder: 1,
        items: [
          { key: "orders", titleFa: "سفارش‌ها", titleEn: "Orders", href: "/admin/store/orders", icon: null, permissionKey: "order.read" },
          { key: "procurement", titleFa: "تأمین", titleEn: "Procurement", href: "/admin/resources/procurement", icon: null, permissionKey: "procurement.read" },
          { key: "general", titleFa: "عمومی", titleEn: "General", href: "/admin/general", icon: null, permissionKey: null },
        ],
      },
      {
        key: "system",
        titleFa: "سیستم",
        titleEn: "System",
        icon: "settings",
        sortOrder: 2,
        items: [
          { key: "danger", titleFa: "سیستم", titleEn: "System", href: "/admin/system", icon: null, permissionKey: "system.manage" },
        ],
      },
    ]);
    findStandalone.mockResolvedValue([
      { key: "audit", titleFa: "گزارش ممیزی", titleEn: "Audit", href: "/admin/audit", icon: null, permissionKey: "audit.read" },
      { key: "help", titleFa: "راهنما", titleEn: "Help", href: "/admin/help", icon: null, permissionKey: null },
    ]);
  });

  it("rejects unauthenticated requests before querying navigation", async () => {
    getCurrentUser.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(findGroups).not.toHaveBeenCalled();
    expect(findStandalone).not.toHaveBeenCalled();
  });

  it("requires admin.navigation.read", async () => {
    requirePermission.mockRejectedValue(new Error("forbidden"));

    const response = await GET();

    expect(response.status).toBe(403);
    expect(findGroups).not.toHaveBeenCalled();
  });

  it("denies users with no permissions", async () => {
    getUserPermissions.mockResolvedValue([]);

    const response = await GET();

    expect(response.status).toBe(403);
    expect(findGroups).not.toHaveBeenCalled();
  });

  it("filters grouped and standalone items by exact permissions with no legacy bypass", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(requirePermission).toHaveBeenCalledWith("admin-1", "admin.navigation.read");
    expect(body.data.mode).toBe("rbac");
    expect(body.data.groups).toHaveLength(1);
    expect(body.data.groups[0].items.map((item: { key: string }) => item.key)).toEqual(["orders", "general"]);
    expect(body.data.standalone.map((item: { key: string }) => item.key)).toEqual(["help"]);
  });
});
