import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "..", "..");
const read = (relative: string) => fs.readFileSync(path.join(ROOT, relative), "utf8");

describe("administrative mutation CSRF contracts", () => {
  const protectedRoutes = [
    "src/app/api/admin/store/orders/[id]/route.ts",
    "src/app/api/admin/store/categories/route.ts",
    "src/app/api/admin/store/categories/[id]/route.ts",
    "src/app/api/admin/store/brands/[id]/route.ts",
    "src/app/api/admin/store/car-models/route.ts",
    "src/app/api/admin/store/car-models/[id]/route.ts",
    "src/app/api/admin/store/rentals/[id]/route.ts",
    "src/app/api/admin/store/rentals/[id]/bookings/[bookingId]/route.ts",
    "src/app/api/admin/store/rentals/[id]/bookings/route.ts",
    "src/app/api/admin/store/services/requests/[id]/route.ts",
    "src/app/api/admin/store/services/providers/route.ts",
    "src/app/api/admin/store/services/providers/[id]/route.ts",
    "src/app/api/admin/store/mechanics/route.ts",
    "src/app/api/admin/store/mechanics/[id]/route.ts",
    "src/app/api/admin/store/currency/route.ts",
    "src/app/api/admin/resources/[resource]/route.ts",
    "src/app/api/admin/resources/[resource]/[id]/route.ts",
    "src/app/api/admin/resources/[resource]/[id]/action/route.ts",
    "src/app/api/admin/resources/[resource]/bulk/route.ts",
    "src/app/api/admin/listings/route.ts",
    "src/app/api/admin/listings/[id]/route.ts",
    "src/app/api/admin/attachments/route.ts",
    "src/app/api/admin/upload/route.ts",
    "src/app/api/admin/users/[id]/route.ts",
    "src/app/api/admin/payments/[id]/route.ts",
    "src/app/api/admin/verifications/[id]/review/route.ts",
    "src/app/api/admin/verifications/[id]/revoke/route.ts",
    "src/app/api/admin/companies/[id]/route.ts",
    "src/app/api/admin/products/[id]/route.ts",
    "src/app/api/admin/parts/[id]/route.ts",
    "src/app/api/admin/requests/[id]/route.ts",
    "src/app/api/admin/auctions/[id]/route.ts",
    "src/app/api/admin/listings/[id]/reject/route.ts",
  ];

  it.each(protectedRoutes)("requires CSRF validation in %s", (routePath) => {
    const route = read(routePath);
    expect(route).toMatch(/import \{ checkCsrf \} from ["']@\/lib\/csrf["']/);
    expect(route).toMatch(/checkCsrf\(req\)/);
  });

  it("keeps paid AI scraper calls disabled under the free-infrastructure policy", () => {
    for (const routePath of [
      "src/app/api/admin/ai-scraper/route.ts",
      "src/app/api/admin/store/ai-scraper/route.ts",
    ]) {
      const route = read(routePath);
      expect(route).toMatch(/AI_SCRAPER_DISABLED_BY_FREE_INFRA_POLICY/);
      expect(route).toMatch(/checkCsrf\(req\)/);
    }
  });
});
