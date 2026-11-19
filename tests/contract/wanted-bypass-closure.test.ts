import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) =>
  readFileSync(path.join(process.cwd(), file), "utf8");

/**
 * P0 audit (D1 + B1-B4 + D2-D3): all BuyRequest status-mutation + delete
 * paths must go through the canonical wanted-service state machine. No
 * path may write status directly or physically delete a row.
 *
 * This contract test pins the closure of the bypass paths found in the
 * independent audit:
 * - D1: single-row DELETE → soft-close (no db.buyRequest.delete)
 * - B1: universal PATCH → status removed from buyRequestConfig.fields
 * - D2/D3/B2/B3: universal routes 409-blocked for buy-requests
 *   (DEDICATED_MUTATION_RESOURCES)
 * - B4: RequestsClient edit modal → status read-only (not in PATCH payload)
 */
describe("WANTED status-mutation bypass closure (P0 audit D1-B4)", () => {
  it("D1: single-row DELETE uses closeWantedByAdmin (no physical delete)", () => {
    const route = read("src/app/api/admin/requests/[id]/route.ts");
    // The DELETE handler must delegate to closeWantedByAdmin, NOT db.buyRequest.delete.
    expect(route).toContain("closeWantedByAdmin(id, sessionUser.id)");
    expect(route).not.toContain("db.buyRequest.delete");
    // The audit records the legacy "delete" intent mapped to soft-close.
    expect(route).toContain("admin.buyRequests.delete");
    expect(route).toContain("mappedAction: \"soft-close\"");
  });

  it("B1: buyRequestConfig.fields does NOT include status (removed)", () => {
    const config = read("src/lib/admin/resources/marketplace-resources.ts");
    // Isolate the buyRequestConfig block, then check its fields list.
    const buyRequestSection = config.split("export const buyRequestConfig")[1] ?? "";
    const fieldsSection = buyRequestSection.split("fields: [")[1]?.split("],")[0] ?? "";
    // The buyRequestConfig fields list must not contain a status field entry.
    expect(fieldsSection).not.toContain("{ key: 'status'");
  });

  it("D2/D3/B2/B3: universal [id] route 409-blocks buy-requests", () => {
    const route = read("src/app/api/admin/resources/[resource]/[id]/route.ts");
    expect(route).toContain("'buy-requests'");
    // The DEDICATED_MUTATION_RESOURCES set must include buy-requests.
    expect(route).toContain("DEDICATED_MUTATION_RESOURCES.has(resourceKey)");
  });

  it("B3: universal bulk route 409-blocks buy-requests", () => {
    const route = read("src/app/api/admin/resources/[resource]/bulk/route.ts");
    expect(route).toContain("'buy-requests'");
    expect(route).toContain("DEDICATED_MUTATION_RESOURCES.has(resourceKey)");
    expect(route).toContain("DEDICATED_RESOURCE_BULK_DISABLED");
  });

  it("B2: universal action route 409-blocks buy-requests", () => {
    const route = read("src/app/api/admin/resources/[resource]/[id]/action/route.ts");
    expect(route).toContain("'buy-requests'");
    expect(route).toContain("DEDICATED_MUTATION_RESOURCES.has(resourceKey)");
    expect(route).toContain("DEDICATED_RESOURCE_ACTION_DISABLED");
  });

  it("B4: RequestsClient edit modal does NOT send status in PATCH payload", () => {
    const client = read("src/components/admin/RequestsClient.tsx");
    // The save body must NOT include `status: r.status`.
    const saveSection = client.split("const save = async")[1]?.split("} catch")[0] ?? "";
    expect(saveSection).not.toContain("status: r.status");
    // The status <select> must be replaced with a read-only badge.
    expect(client).toContain("وضعیت (تنها از طریق دکمه‌های عملیات)");
    // The editable <select> with onChange for status must NOT be present.
    expect(client).not.toContain('onChange={(e) => setForm({ ...form, status: e.target.value })');
  });

  it("canonical single-row PATCH allowed list excludes status (P0-2)", () => {
    const route = read("src/app/api/admin/requests/[id]/route.ts");
    const allowedSection = route.split("const allowed = [")[1]?.split("]")[0] ?? "";
    expect(allowedSection).not.toContain('"status"');
  });

  it("canonical bulk POST delegates approve/close/fulfill to bulkTransitionWanted", () => {
    const route = read("src/app/api/admin/requests/route.ts");
    expect(route).toContain("bulkTransitionWanted(");
    // Legacy 'delete' = bulkTransitionWanted('close') (soft-close).
    expect(route).toContain('bulkTransitionWanted("close"');
  });
});
