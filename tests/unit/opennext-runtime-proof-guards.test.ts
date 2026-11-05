import { describe, expect, it } from "vitest";

/* ============================================================
   Unit tests for OpenNext Runtime Proof route guards
   STEP 18.2.7.3.11 — Finding RO-1
   ------------------------------------------------------------
   These tests verify the regex patterns and guard logic used by
   src/app/api/opennext-runtime-proof/route.ts without requiring
   a running OpenNext Worker or database connection.
   ============================================================ */

// Replicate the regex patterns from the route for unit testing.
// These MUST match the patterns in the route file exactly.
const POSTGRES_17_REGEX = /^17\./;
const BEARER_TOKEN_REGEX = /^Bearer\s+/i;

describe("PostgreSQL 17 version detection", () => {
  it("accepts PostgreSQL 17.2", () => {
    expect(POSTGRES_17_REGEX.test("17.2")).toBe(true);
  });

  it("accepts PostgreSQL 17.0", () => {
    expect(POSTGRES_17_REGEX.test("17.0")).toBe(true);
  });

  it("accepts PostgreSQL 17.10", () => {
    expect(POSTGRES_17_REGEX.test("17.10")).toBe(true);
  });

  it("rejects PostgreSQL 16.x", () => {
    expect(POSTGRES_17_REGEX.test("16.4")).toBe(false);
  });

  it("rejects PostgreSQL 18.x", () => {
    expect(POSTGRES_17_REGEX.test("18.0")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(POSTGRES_17_REGEX.test("")).toBe(false);
  });

  it("rejects null/undefined (defaults to empty string)", () => {
    expect(POSTGRES_17_REGEX.test(undefined ?? "")).toBe(false);
    expect(POSTGRES_17_REGEX.test(null ?? "")).toBe(false);
  });

  it("rejects strings that merely contain 17 but don't start with it", () => {
    expect(POSTGRES_17_REGEX.test("PostgreSQL 17.2")).toBe(false);
    expect(POSTGRES_17_REGEX.test("117.0")).toBe(false);
  });

  it("does NOT match double-escaped backslash (regression test for bc51ea5)", () => {
    // The bug was /^17\\./ which matches "17\.2" literally, not "17.2".
    // Verify the CORRECT regex matches "17.2" and NOT "17\.2".
    expect(POSTGRES_17_REGEX.test("17.2")).toBe(true);
    expect(POSTGRES_17_REGEX.test("17\\.2")).toBe(false);
  });
});

describe("Bearer token extraction", () => {
  function extractBearer(authHeader: string | null): string {
    return authHeader?.replace(BEARER_TOKEN_REGEX, "") ?? "";
  }

  it("extracts token from 'Bearer abc123'", () => {
    expect(extractBearer("Bearer abc123")).toBe("abc123");
  });

  it("extracts token from 'bearer abc123' (case-insensitive)", () => {
    expect(extractBearer("bearer abc123")).toBe("abc123");
  });

  it("extracts token from 'BEARER abc123' (uppercase)", () => {
    expect(extractBearer("BEARER abc123")).toBe("abc123");
  });

  it("extracts token with multiple spaces after Bearer", () => {
    expect(extractBearer("Bearer    abc123")).toBe("abc123");
  });

  it("extracts token with tab after Bearer", () => {
    expect(extractBearer("Bearer\tabc123")).toBe("abc123");
  });

  it("returns empty string for null header", () => {
    expect(extractBearer(null)).toBe("");
  });

  it("returns empty string for empty header", () => {
    expect(extractBearer("")).toBe("");
  });

  it("does not strip non-Bearer prefixes", () => {
    expect(extractBearer("Basic abc123")).toBe("Basic abc123");
  });

  it("does NOT match double-escaped backslash (regression test for bc51ea5)", () => {
    // The bug was /^Bearer\\s+/i which matched "Bearer\s+" literally.
    // Verify the CORRECT regex strips "Bearer " and NOT "Bearer\s+".
    expect(extractBearer("Bearer abc123")).toBe("abc123");
    // A literal "Bearer\s+abc123" should NOT be stripped.
    expect(extractBearer("Bearer\\s+abc123")).toBe("Bearer\\s+abc123");
  });
});

describe("constantTimeEqual (token comparison)", () => {
  // Replicate the constantTimeEqual function from the route.
  function constantTimeEqual(left: string, right: string): boolean {
    if (left.length !== right.length) return false;
    let difference = 0;
    for (let index = 0; index < left.length; index += 1) {
      difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
    }
    return difference === 0;
  }

  it("returns true for identical strings", () => {
    expect(constantTimeEqual("abc123", "abc123")).toBe(true);
  });

  it("returns false for different strings of same length", () => {
    expect(constantTimeEqual("abc123", "abc124")).toBe(false);
  });

  it("returns false for different lengths", () => {
    expect(constantTimeEqual("abc", "abcd")).toBe(false);
  });

  it("returns true for empty strings", () => {
    expect(constantTimeEqual("", "")).toBe(true);
  });

  it("returns false for one empty string", () => {
    expect(constantTimeEqual("", "abc")).toBe(false);
    expect(constantTimeEqual("abc", "")).toBe(false);
  });
});

describe("SET TRANSACTION READ ONLY enforcement (Finding RO-1)", () => {
  // These are structural tests: verify the route file contains the
  // SET TRANSACTION READ ONLY statement BEFORE the current_setting check
  // in both probeApp and probeStore functions.
  // The actual execution is verified by the PREVIEW_ONLY runtime proof
  // (not yet authorized).

  async function readRouteContent(): Promise<string> {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const routePath = path.join(
      process.cwd(),
      "src/app/api/opennext-runtime-proof/route.ts",
    );
    return fs.readFile(routePath, "utf-8");
  }

  it("probeApp: SET TRANSACTION READ ONLY appears before current_setting check", async () => {
    const content = await readRouteContent();
    const probeAppStart = content.indexOf("async function probeApp()");
    const probeStoreStart = content.indexOf("async function probeStore()");
    expect(probeAppStart).toBeGreaterThan(-1);
    expect(probeStoreStart).toBeGreaterThan(-1);
    const probeAppBody = content.slice(probeAppStart, probeStoreStart);

    // Look for the executable statement (not comments):
    // "await tx.$executeRaw`SET TRANSACTION READ ONLY`" must appear before
    // "tx.$queryRaw<Array<{ read_only: boolean }>>" (the current_setting check).
    const setIdx = probeAppBody.indexOf("$executeRaw`SET TRANSACTION READ ONLY`");
    const checkIdx = probeAppBody.indexOf(
      "current_setting('transaction_read_only')::boolean",
    );
    expect(setIdx).toBeGreaterThan(-1);
    expect(checkIdx).toBeGreaterThan(-1);
    expect(setIdx).toBeLessThan(checkIdx);
  });

  it("probeStore: SET TRANSACTION READ ONLY appears before current_setting check", async () => {
    const content = await readRouteContent();
    const probeStoreStart = content.indexOf("async function probeStore()");
    expect(probeStoreStart).toBeGreaterThan(-1);
    const getStart = content.indexOf("export async function GET");
    const probeStoreBody = content.slice(probeStoreStart, getStart);

    const setIdx = probeStoreBody.indexOf("$executeRaw`SET TRANSACTION READ ONLY`");
    const checkIdx = probeStoreBody.indexOf(
      "current_setting('transaction_read_only')::boolean",
    );
    expect(setIdx).toBeGreaterThan(-1);
    expect(checkIdx).toBeGreaterThan(-1);
    expect(setIdx).toBeLessThan(checkIdx);
  });

  it("both probes report transactionReadOnlyEnforced: true", async () => {
    const content = await readRouteContent();
    const matches = content.match(/transactionReadOnlyEnforced:\s*true/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBe(2); // one in probeApp, one in probeStore
  });
});
