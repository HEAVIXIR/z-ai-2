import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");
const service = fs.readFileSync(path.join(ROOT, "src/lib/seller-service.ts"), "utf8");

function section(start: string, end: string): string {
  const from = service.indexOf(start);
  const to = service.indexOf(end, from + start.length);
  if (from < 0 || to < 0) throw new Error(`Missing seller-service section: ${start}`);
  return service.slice(from, to);
}

describe("seller lifecycle atomicity", () => {
  it("registers canonical role, company link, and pending founding row in one transaction", () => {
    const source = section("export async function registerSeller", "// ── verifySeller");
    expect(source).toContain("db.$transaction(async (tx) =>");
    expect(source).toContain("tx.userRole.upsert");
    expect(source).toContain("tx.foundingSeller.upsert");
    expect(source).toContain("tx.user.update");
  });

  it("verifies founding status and activates the user atomically", () => {
    const source = section("export async function verifySeller", "// ── suspendSeller");
    expect(source).toContain("db.$transaction(async (tx) =>");
    expect(source).toContain("tx.foundingSeller.update");
    expect(source).toContain('data: { status: "ACTIVE" }');
    expect(source).toContain('if (user.status === "PENDING")');
    expect(source).not.toContain('user.status === "PENDING" || user.status === "BLOCKED"');
    expect(source).not.toContain("Best-effort");
  });

  it("suspends founding status and blocks the user atomically", () => {
    const source = section("export async function suspendSeller", "// ── getSellerProfile");
    expect(source).toContain("db.$transaction(async (tx) =>");
    expect(source).toContain("tx.foundingSeller.update");
    expect(source).toContain('data: { status: "BLOCKED" }');
    expect(source).not.toContain("Best-effort");
  });
});
