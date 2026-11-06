import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");

describe("admin inspection assignee eligibility", () => {
  it("uses active users with the canonical ADMIN role", () => {
    const source = fs.readFileSync(
      path.join(ROOT, "src/app/admin/inspections/page.tsx"),
      "utf8",
    );
    expect(source).toContain('status: "ACTIVE"');
    expect(source).toContain('userRoles: { some: { role: { key: "ADMIN" } } }');
    expect(source).not.toContain('OR: [{ role: "ADMIN" }, { role: "SELLER" }]');
  });

  it("rate-limits inspection creation and validates related deal-room ownership", () => {
    const source = fs.readFileSync(
      path.join(ROOT, "src/app/api/inspections/route.ts"),
      "utf8",
    );
    expect(source).toContain("enforceRateLimit(user.id, INSPECTION_CREATE)");
    expect(source).toContain("dealRoom.listingId !== listingId");
    expect(source).toContain("dealRoom.buyerId !== user.id && dealRoom.sellerId !== user.id");
    expect(source).toContain("notes.length > 1000");
    expect(source).toContain("MAX_INSPECTION_REQUEST_BYTES = 16 * 1024");
    expect(source).toContain("reader.cancel()");
    expect(source).toContain('typeof body.listingId !== "string"');
    const post = source.slice(
      source.indexOf("export async function POST"),
      source.indexOf("/* GET /api/inspections"),
    );
    expect(post).toContain('listing.status !== "PUBLISHED"');
    expect(post).not.toContain("include: { listing: true }");
  });

  it("rejects inactive or non-admin inspector IDs at the API boundary", () => {
    const source = fs.readFileSync(
      path.join(ROOT, "src/app/api/inspections/[id]/route.ts"),
      "utf8",
    );
    expect(source).toContain('status: "ACTIVE"');
    expect(source).toContain('userRoles: { some: { role: { key: "ADMIN" } } }');
    expect(source).toContain('error: "Inspector must be an active admin"');
  });

  it("bounds and validates admin inspection PATCH payloads", () => {
    const source = fs.readFileSync(
      path.join(ROOT, "src/app/api/inspections/[id]/route.ts"),
      "utf8",
    );
    expect(source).toContain("const MAX_PATCH_BYTES = 64 * 1024");
    expect(source).toContain("readBoundedPatchJson");
    expect(source).toContain("INSPECTION_STATUSES");
    expect(source).toContain("allowedKeys");
    expect(source).toContain('error: "Invalid inspection status"');
    expect(source).toContain('error: `Invalid ${field}`');
    expect(source).toContain("notes.length > 1000");
    expect(source).toContain("photos.length > 20");
    expect(source).toContain("checklist.length > 200");
    expect(source).toContain("isHttpUrl");
    expect(source).toContain("9223372036854775807n");
    expect(source).toContain("replace(/[۰-۹]/g");
    expect(source).toContain('error: "Inspection not found"');
    expect(source).toContain('error: "Unable to update inspection"');
    expect(source).not.toContain("e?.message ?? \"Server error\"");
  });
});
