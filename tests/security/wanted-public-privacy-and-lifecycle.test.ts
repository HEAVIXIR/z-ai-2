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

  it("records the actual user as the close actor", () => {
    const source = read("src/lib/wanted-service.ts");
    const closeSection = source.split("// ── closeWanted ──")[1]?.split("// ── getWantedMatches ──")[0] ?? "";
    expect(closeSection).toContain('actorType: "USER"');
  });

  it("maps legacy admin bulk delete to audited soft-close, never hard delete", () => {
    const source = read("src/app/api/admin/requests/route.ts");
    expect(source).toContain('data: { status: "CLOSED" }');
    expect(source).toContain("admin.buyRequests.closeMany");
    expect(source).not.toContain("db.buyRequest.deleteMany");
  });
});
