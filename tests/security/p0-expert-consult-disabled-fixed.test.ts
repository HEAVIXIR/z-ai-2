import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/* ============================================================
   STEP 13.01 — P0-3 FIX VERIFICATION (expert-consult crash)
   ------------------------------------------------------------
   This test verifies that the P0-3 vulnerability (expert-consult
   route referencing a non-existent Prisma model) has been FIXED.

   Vulnerability that was fixed:
     - src/app/api/expert-consult/route.ts had @ts-nocheck and called
       db.expertConsultation.create() / .findMany()
     - No ExpertConsultation model exists in either Prisma schema
     - Every call to this route crashed at runtime with
       "Cannot read properties of undefined (reading 'create')"

   Fix:
     - @ts-nocheck removed
     - Route DISABLED with 503 Service Unavailable
     - db import removed (no longer needed)
     - When the ExpertConsultation model is added in a future PR,
       this route can be re-enabled with proper implementation

   These tests use static analysis (source-code assertions).
   ============================================================ */

const ROUTE_PATH = "src/app/api/expert-consult/route.ts";

function readSource(path: string): string {
  return readFileSync(path, "utf-8");
}

describe("P0-3 FIX — expert-consult crash is blocked", () => {
  const source = readSource(ROUTE_PATH);

  it("does NOT have @ts-nocheck directive on line 1", () => {
    const firstLine = source.split("\n")[0];
    expect(firstLine).not.toMatch(/@ts-nocheck/);
  });

  it("does NOT import db (no Prisma calls)", () => {
    expect(source).not.toMatch(/from\s+["']@\/lib\/db["']/);
  });

  it("does NOT reference db.expertConsultation in executable code", () => {
    // Comments may reference the old pattern for documentation;
    // only executable lines must not contain it.
    const executableLines = source
      .split("\n")
      .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"));
    const joined = executableLines.join("\n");
    expect(joined).not.toMatch(/db\.expertConsultation/);
  });

  it("POST handler returns 503 (disabled)", () => {
    expect(source).toMatch(/export async function POST/);
    expect(source).toMatch(/status:\s*503/);
  });

  it("GET handler returns 503 (disabled)", () => {
    expect(source).toMatch(/export async function GET/);
    // There should be at least one 503 in the GET handler.
    // We check that the file has two 503 status codes (one per handler).
    const matches = source.match(/status:\s*503/g);
    expect(matches).toBeTruthy();
    expect(matches!.length).toBeGreaterThanOrEqual(2);
  });

  it("contains the P0-3 FIX comment marker", () => {
    expect(source).toContain("P0-3 FIX");
  });

  it("includes a FEATURE_DISABLED code for client handling", () => {
    expect(source).toContain("FEATURE_DISABLED");
  });

  it("does NOT call db.expertConsultation.create or findMany anywhere", () => {
    expect(source).not.toMatch(/db\.expertConsultation\.create/);
    expect(source).not.toMatch(/db\.expertConsultation\.findMany/);
  });
});
