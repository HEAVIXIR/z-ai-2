import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/* ============================================================
   STEP 13.22 — DTO Regression Test
   ------------------------------------------------------------
   Verifies that GET /api/deals uses an explicit allowlist DTO
   instead of spreading the full Deal model (...d).
   This prevents future fields from leaking into API responses.
   ============================================================ */

const ROUTE_PATH = "src/app/api/deals/route.ts";

function readSource(path: string): string {
  return readFileSync(path, "utf-8");
}

function executableLines(source: string): string {
  return source
    .split("\n")
    .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
    .join("\n");
}

describe("STEP 13.22 — DTO regression: GET /api/deals", () => {
  const source = readSource(ROUTE_PATH);
  const executable = executableLines(source);

  it("does NOT use ...d spread in GET handler response", () => {
    expect(executable).not.toMatch(/\.\.\.d\b/);
  });

  it("uses explicit field list in deals.map response", () => {
    // After the DTO fix, the response should list fields explicitly
    expect(executable).toMatch(/id:\s*d\.id/);
    expect(executable).toMatch(/dealNumber:\s*d\.dealNumber/);
    expect(executable).toMatch(/status:\s*d\.status/);
    expect(executable).toMatch(/agreedAmount:\s*d\.agreedAmount/);
  });

  it("does NOT expose cancelReason in response", () => {
    // cancelReason is an internal field not needed by API consumers
    expect(executable).not.toMatch(/cancelReason/);
  });

  it("does NOT expose notes in response", () => {
    // notes is an internal field
    expect(executable).not.toMatch(/notes:\s*d\.notes/);
  });

  it("does NOT expose updatedAt in response", () => {
    // updatedAt is internal metadata
    expect(executable).not.toMatch(/updatedAt:\s*d\.updatedAt/);
  });

  it("does NOT expose disputes relation in response", () => {
    expect(executable).not.toMatch(/disputes:\s*d\.disputes/);
  });

  it("does NOT expose review relation in response", () => {
    expect(executable).not.toMatch(/review:\s*d\.review/);
  });

  it("includes listing relation (used by consumers)", () => {
    expect(executable).toMatch(/listing:\s*d\.listing/);
  });

  it("includes order relation (used by consumers)", () => {
    expect(executable).toMatch(/order:\s*d\.order/);
  });

  it("contains STEP 13.22 DTO comment marker", () => {
    expect(source).toContain("STEP 13.22");
    expect(source).toContain("Explicit DTO");
  });
});
