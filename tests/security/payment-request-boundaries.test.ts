import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (file: string) => fs.readFileSync(path.resolve(process.cwd(), file), "utf8");

describe("payment mutation request boundaries", () => {
  it("bounds and strictly validates manual admin payment creation", () => {
    const source = read("src/app/api/admin/payments/route.ts");
    const post = source.slice(source.indexOf("export async function POST"));
    expect(post).toContain('startsWith("application/json")');
    expect(post).toContain("new TextEncoder().encode(rawBody).byteLength > 16 * 1024");
    expect(post).toContain("Unknown payment field");
    expect(post).toContain("userId must be a valid string");
    expect(post).toContain("markPaid must be a boolean");
    expect(post).toContain("trackingCode must be a string");
    expect(post).toContain("await db.$transaction(async (tx) =>");
    expect(post).toContain("tx.auditLog.create");
  });

  it("checks CSRF before reading a bounded, strict verification payload", () => {
    const source = read("src/app/api/payments/[id]/verify/route.ts");
    const csrf = source.indexOf("if (!checkCsrf(req))");
    const parse = source.indexOf("const rawBody = await req.text()");
    expect(csrf).toBeGreaterThan(-1);
    expect(parse).toBeGreaterThan(csrf);
    expect(source).toContain('startsWith("application/json")');
    expect(source).toContain("new TextEncoder().encode(rawBody).byteLength > 8 * 1024");
    expect(source).toContain("Unknown payment verification field");
    expect(source).toContain('where: { id, status: "PENDING" }');
    expect(source).toContain("tx.auditLog.create");
  });
});
