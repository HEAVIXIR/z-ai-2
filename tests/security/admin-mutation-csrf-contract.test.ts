import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "..", "..");
const read = (relative: string) => fs.readFileSync(path.join(ROOT, relative), "utf8");

describe("administrative mutation CSRF contracts", () => {
  const protectedRoutes = [
    "src/app/api/admin/store/orders/[id]/route.ts",
    "src/app/api/admin/payments/route.ts",
    "src/app/api/admin/store/returns/route.ts",
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

  it("blocks bulk mutations against the payment ledger", () => {
    const route = read("src/app/api/admin/resources/[resource]/bulk/route.ts");
    // P0 audit: the bulk route now uses a DEDICATED_MUTATION_RESOURCES set
    // (which includes payments + buy-requests) instead of an inline
    // payments-only check. The set gate 409-blocks bulk mutations.
    expect(route).toMatch(/DEDICATED_MUTATION_RESOURCES\.has\(resourceKey\)/);
    expect(route).toMatch(/DEDICATED_RESOURCE_BULK_DISABLED/);
    expect(route).toMatch(/resourceKey === 'payments' \? 'payment\.manage'/);
    expect(route).toMatch(/checkCsrf\(req\)/);
  });

  it("routes universal payment mutations through the dedicated financial ledger API", () => {
    const collection = read("src/app/api/admin/resources/[resource]/route.ts");
    const detail = read("src/app/api/admin/resources/[resource]/[id]/route.ts");
    // P0 audit: the DEDICATED_MUTATION_RESOURCES set now includes buy-requests
    // (in addition to procurement/suppliers/payments).
    expect(collection).toMatch(/new Set\(\['procurement', 'suppliers', 'payments', 'buy-requests'\]\)/);
    expect(detail).toMatch(/new Set\(\['procurement', 'suppliers', 'payments', 'buy-requests'\]\)/);
    expect(collection).toMatch(/resourceKey === 'payments' \? 'payment\.manage'/);
    expect(detail).toMatch(/resourceKey === 'payments' \? 'payment\.manage'/);
  });

  it("keeps scraper authorization and CSRF ahead of AI preflight without an artificial activation flag", () => {
    const marketplace = read("src/app/api/admin/ai-scraper/route.ts");
    expect(marketplace).toContain('requirePermission(user.id, "ai.execute")');
    const navigation = read("src/lib/admin/navigation-defaults.ts");
    expect(navigation).toContain("href: '/admin/ai-scraper', permissionKey: 'ai.execute'");
    expect(marketplace).toContain("checkCsrf(req)");
    expect(marketplace).not.toContain("HEAVIX_AI_SCRAPER_ENABLED");
    expect(marketplace.indexOf("getCurrentUser()")).toBeLessThan(marketplace.indexOf("checkCsrf(req)"));
    expect(marketplace.indexOf("checkCsrf(req)")).toBeLessThan(marketplace.indexOf("preflightAIRequest({"));
    expect(marketplace).toContain("isAllowedSourceUrl");

    const store = read("src/app/api/admin/store/ai-scraper/route.ts");
    expect(store).toContain("requirePermission(user.id, 'store.manage')");
    expect(store).toContain("checkCsrf(req)");
    expect(store).not.toContain("HEAVIX_STORE_SCRAPER_ENABLED");
    expect(store).toContain("!isManualImport");
    expect(store.indexOf("getCurrentUser()")).toBeLessThan(store.indexOf("checkCsrf(req)"));
    expect(store.indexOf("checkCsrf(req)")).toBeLessThan(store.indexOf("preflightAIRequest({"));
    expect(store).toContain('process.env[STORE_SOURCE_DNS_ALLOWLIST_ENV]');
    expect(store).toContain("fetchAllowedSourcePage(url, signal, undefined, allowedHosts)");
    expect(store).toContain("isAllowedStoreSourceUrl(url)");
    expect(store).not.toContain('zai.functions.invoke("page_reader"');
  });
});
