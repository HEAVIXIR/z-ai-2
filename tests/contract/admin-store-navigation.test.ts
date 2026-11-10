import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (relative: string) =>
  readFileSync(path.join(process.cwd(), relative), "utf8");

describe("Store Control Plane navigation contract", () => {
  const navigation = read("prisma/seed-admin-navigation.ts");
  const permissions = read("src/lib/authorization/permissions.ts");
  const resources = read("src/lib/admin/resources/store-domain-resources.ts");

  it("exposes Store procurement, rentals and service providers in the Admin menu", () => {
    expect(navigation).toContain("href: '/admin/resources/procurement'");
    expect(navigation).toContain("href: '/admin/resources/rentals'");
    expect(navigation).toContain("href: '/admin/resources/services'");
  });

  it("uses permission keys that exist in the canonical permission catalog", () => {
    expect(navigation).toContain("permissionKey: 'procurement.read'");
    expect(navigation).toContain("permissionKey: 'store.read'");
    expect(permissions).toContain("'procurement.read'");
    expect(permissions).toContain("'store.read'");
    expect(permissions).toContain("'store.manage'");
  });

  it("keeps the Rentals universal resource aligned with the Store API permission contract", () => {
    const rentalsStart = resources.indexOf("export const rentalsConfig");
    const rentalsEnd = resources.indexOf("};", rentalsStart);
    const rentalsConfig = resources.slice(rentalsStart, rentalsEnd);
    expect(rentalsConfig).toContain("read: 'store.read'");
    expect(rentalsConfig).toContain("create: 'store.manage'");
    expect(rentalsConfig).not.toContain("rentals.read");
    expect(rentalsConfig).not.toContain("rentals.manage");
  });
});
