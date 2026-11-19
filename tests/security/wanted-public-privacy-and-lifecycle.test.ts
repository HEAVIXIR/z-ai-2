import { describe, expect, it } from "vitest";
import fs from "node:fs";

const read = (path: string) => fs.readFileSync(path, "utf8");

describe("WANTED public privacy and lifecycle safety", () => {
  it("does not select or return owner IDs in the public list service", () => {
    const source = read("src/lib/wanted-service.ts");
    const listSection = source.split("// ── listWanted ──")[1]?.split("// ── getWanted ──")[0] ?? "";
    expect(listSection).not.toContain("userId: true");
    expect(listSection).not.toMatch(/userId:\s*string\s*\|\s*null/);
  });

  it("strips owner ID from the public detail response", () => {
    const source = read("src/app/api/wanted/[id]/route.ts");
    expect(source).toContain("const { userId: _ownerId, ...publicRequest } = request");
    expect(source).toContain("data: publicRequest");
  });

  it("requires exact ownership, including rejecting ownerless legacy rows", () => {
    const source = read("src/lib/wanted-service.ts");
    expect(source).toContain("if (before.userId !== userId)");
    expect(source).toContain("WantedServiceError(403");
  });

  it("limits the public wanted feed to active, published and unexpired requests", () => {
    const route = read("src/app/api/wanted/route.ts");
    const service = read("src/lib/wanted-service.ts");
    const listSection = service.split("// ── listWanted ──")[1]?.split("// ── getWanted ──")[0] ?? "";
    expect(route).toContain('const status = "ACTIVE"');
    expect(listSection).toContain("where.publishedAt = { lte: now }");
    expect(listSection).toContain("{ expiresAt: null }");
    expect(listSection).toContain("{ expiresAt: { gt: now } }");
  });

  it("hides closed, unpublished and expired requests from public detail", () => {
    const route = read("src/app/api/wanted/[id]/route.ts");
    expect(route).toContain('request.status !== "ACTIVE"');
    expect(route).toContain("request.publishedAt.getTime() > now");
    expect(route).toContain("request.expiresAt.getTime() <= now");
    expect(route).toContain("{ status: 404 }");
  });

  it("filters public homepage, profile, brand, company, detail and recommendation feeds to supply", () => {
    const sources = [
      read("src/app/page.tsx"),
      read("src/app/sellers/[id]/page.tsx"),
      read("src/app/brands/[slug]/page.tsx"),
      read("src/app/companies/[slug]/page.tsx"),
      read("src/app/listings/[slug]/page.tsx"),
      read("src/lib/recommendations.ts"),
    ];
    for (const source of sources) {
      expect(source).toContain("SUPPLY_LISTING_TYPES");
    }
  });

  it("filters both public listing search paths to supply-side transaction types", () => {
    const search = read("src/lib/search.ts");
    const route = read("src/app/api/listings/route.ts");
    expect(search).toContain("listingType: { in: [...SUPPLY_LISTING_TYPES] }");
    expect(route).toContain("listingType: { in: [...SUPPLY_LISTING_TYPES] }");
  });

  it("routes the WANTED wizard through the canonical BuyRequest API", () => {
    const page = read("src/app/listings/new/page.tsx");
    expect(page).toContain('const isDemandSubmission = transactionType === "WANTED" || transactionType === "SERVICE_REQUEST"');
    expect(page).toContain('const endpoint = isDemandSubmission ? "/api/wanted" : "/api/listings"');
    expect(page).toContain("body.deadline");
    expect(page).toContain("body.quantity");
  });

  it("passes validated deadline and taxonomy location names into createWanted", () => {
    const route = read("src/app/api/wanted/route.ts");
    expect(route).toContain("normalizedDeadline");
    expect(route).toContain("deadline: normalizedDeadline");
    expect(route).toContain("selectedProvince?.name");
    expect(route).toContain("selectedCity?.name");
  });

  it("records model and typed-attribute snapshot in audit until schema migration", () => {
    const service = read("src/lib/wanted-service.ts");
    expect(service).toContain("modelId: modelId ?? null");
    expect(service).toContain("serviceTypeId: serviceTypeId ?? null");
    expect(service).toContain("attributeValues: Array.isArray(attributeValues)");
  });

  it("records the actual user as the close actor", () => {
    const source = read("src/lib/wanted-service.ts");
    const closeSection = source.split("// ── closeWanted ──")[1]?.split("// ── getWantedMatches ──")[0] ?? "";
    expect(closeSection).toContain('actorType: "USER"');
  });



  it("limits the legacy public feed to a safe DTO", () => {
    const source = read("src/app/api/requests/route.ts");
    const publicGet = source.split("/* POST /api/requests")[0];
    expect(publicGet).toContain("select: {");
    expect(publicGet).not.toContain("userId: true");
    expect(publicGet).not.toContain("requesterPhone: true");
    expect(publicGet).not.toContain("requesterName: true");
    expect(publicGet).not.toContain("adminNotes: true");
  });

  it("routes the legacy request form through the authenticated canonical service", () => {
    const source = read("src/app/api/requests/route.ts");
    expect(source).toContain("const userId = await getCurrentUserId()");
    expect(source).toContain("createWanted({");
    expect(source).not.toContain("db.buyRequest.create");
    expect(source).toContain("return NextResponse.json({ ok: true, id: created.id, status: created.status })");
  });

  it("maps legacy admin bulk delete to audited soft-close, never hard delete", () => {
    const source = read("src/app/api/admin/requests/route.ts");
    // P0-D: the legacy "delete" action delegates to bulkTransitionWanted("close")
    // so the state machine applies. The audit records the closeMany action.
    expect(source).toContain('bulkTransitionWanted("close"');
    expect(source).toContain("admin.buyRequests.closeMany");
    expect(source).not.toContain("db.buyRequest.deleteMany");
  });
});
