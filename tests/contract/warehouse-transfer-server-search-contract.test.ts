import { describe, expect, it } from "vitest";
import fs from "node:fs";

const route = fs.readFileSync(
  "src/app/api/admin/store/inventory/transfer-parts/route.ts",
  "utf8",
);
const page = fs.readFileSync(
  "src/app/admin/store/inventory/transfers/page.tsx",
  "utf8",
);
const form = fs.readFileSync(
  "src/app/admin/store/inventory/warehouse-transfer-form.tsx",
  "utf8",
);

describe("Warehouse transfer server-side part search", () => {
  it("protects the read endpoint with authentication and both inventory permissions", () => {
    expect(route).toContain("getCurrentUser()");
    expect(route).toContain('requirePermission(user.id, 'inventory.read')');
    expect(route).toContain('requirePermission(user.id, 'inventory.manage')');
    expect(route).toContain('{ status: 401 }');
    expect(route).toContain('{ status: 403 }');
  });

  it("searches the complete active catalog with bounded case-insensitive database filters", () => {
    expect(route).toContain("active: true");
    expect(route).toContain('name: { contains: query, mode: "insensitive"');
    expect(route).toContain('nameFa: { contains: query, mode: "insensitive"');
    expect(route).toContain('sku: { contains: query, mode: "insensitive"');
    expect(route).toContain("MAX_LIMIT = 100");
    expect(route).toContain("take: limit + 1");
    expect(route).toContain('orderBy: [{ sku: "asc" }, { id: "asc" }]');
  });

  it("uses stable cursor pagination and returns explicit continuation metadata", () => {
    expect(route).toContain("cursor: { id: cursor }");
    expect(route).toContain("skip: 1");
    expect(route).toContain("hasMore");
    expect(route).toContain("nextCursor");
    expect(route).toContain("inventoryBalances");
  });

  it("loads only the first bounded page on the server and exposes continuation to the client", () => {
    expect(page).toContain("TRANSFER_PART_PAGE_SIZE = 100");
    expect(page).toContain("take: TRANSFER_PART_PAGE_SIZE + 1");
    expect(page).toContain("initialHasMore={initialHasMore}");
    expect(page).toContain("initialCursor={initialCursor}");
    expect(page).not.toContain("take: 1000");
  });

  it("searches remotely, aborts stale requests and offers explicit load-more behavior", () => {
    expect(form).toContain("/api/admin/store/inventory/transfer-parts?");
    expect(form).toContain("AbortController");
    expect(form).toContain("async function loadMore()");
    expect(form).toContain("setPartId");
    expect(form).toContain("بارگذاری قطعات بیشتر");
    expect(form).not.toContain("parts.filter(");
  });
});
