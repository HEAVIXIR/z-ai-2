import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");

function read(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

const source = read("src/app/sellers/[id]/page.tsx");

describe("public seller profile reputation integrity", () => {
  it("exposes only active seller accounts on public profiles", () => {
    expect(source).toContain('where: { id, role: "SELLER", status: "ACTIVE" }');
    const trust = read("src/app/api/sellers/[id]/trust/route.ts");
    const reputation = read("src/app/api/sellers/[id]/reputation/route.ts");
    expect(trust).toContain('where: { id, role: "SELLER", status: "ACTIVE" }');
    expect(reputation).toContain('where: { id, role: "SELLER", status: "ACTIVE" }');
  });

  it("does not fabricate trust scores or star ratings from listing counts", () => {
    expect(source).not.toContain("trustScore");
    expect(source).not.toContain("امتیاز اعتماد");
    expect(source).not.toContain("seller._count.listings > 0 ? 5 : 0");
    expect(source).not.toContain("<Star");
  });

  it("shows only factual company verification state", () => {
    expect(source).toContain("وضعیت شرکت");
    expect(source).toContain("seller.company?.verified");
  });

  it("aggregates public views from published listings only", () => {
    expect(source).toContain('where: { sellerId: seller.id, status: "PUBLISHED" }');
  });

  it("does not expose draft or hidden listing counts in public trust/reputation APIs", () => {
    const trust = read("src/app/api/sellers/[id]/trust/route.ts");
    const reputation = read("src/app/api/sellers/[id]/reputation/route.ts");
    expect(trust).toContain('where: { sellerId: id, status: "PUBLISHED" }');
    expect(trust).toContain('where: { sellerId: id, status: "PUBLISHED", verified: true }');
    expect(trust).toContain('checkPublicApiRateLimit(req, "seller-trust")');
    expect(trust).toContain('"Cache-Control": "private, no-store"');
    expect(reputation).toContain('where: { sellerId: id, status: "PUBLISHED" }');
    expect(reputation).toContain('where: { sellerId: id, status: "PUBLISHED", verified: true }');
    expect(reputation).toContain('listing: { sellerId: id, status: "PUBLISHED" }');
    expect(reputation).toContain('checkPublicApiRateLimit(req, "seller-reputation")');
    expect(reputation).toContain('"Cache-Control": "private, no-store"');
    expect(reputation).toContain('error: "Server error"');
  });
});
