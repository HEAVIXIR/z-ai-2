import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import {
  constantTimeEqual,
  extractBearerToken,
  isPostgres17,
} from "../../src/lib/opennext-proof-guards";

describe("production OpenNext proof guards", () => {
  describe("isPostgres17", () => {
    it.each(["17.0", "17.2", "17.10"])("accepts %s", (version) => {
      expect(isPostgres17(version)).toBe(true);
    });
    it.each(["16.4", "18.0", "", "PostgreSQL 17.2", "117.0", "17\\\\.2"])(
      "rejects %s",
      (version) => expect(isPostgres17(version)).toBe(false),
    );
    it("rejects null and undefined", () => {
      expect(isPostgres17(null)).toBe(false);
      expect(isPostgres17(undefined)).toBe(false);
    });
  });

  describe("extractBearerToken", () => {
    it.each([
      ["Bearer abc123", "abc123"],
      ["bearer abc123", "abc123"],
      ["BEARER abc123", "abc123"],
      ["Bearer    abc123", "abc123"],
      ["Bearer\tabc123", "abc123"],
    ])("extracts token from %j", (header, expected) => {
      expect(extractBearerToken(header)).toBe(expected);
    });
    it.each([null, ""])("returns empty for %j", (header) => {
      expect(extractBearerToken(header)).toBe("");
    });
    it("does not strip non-Bearer or literal escaped prefixes", () => {
      expect(extractBearerToken("Basic abc123")).toBe("Basic abc123");
      expect(extractBearerToken("Bearer\\\\s+abc123")).toBe("Bearer\\\\s+abc123");
    });
  });

  describe("constantTimeEqual", () => {
    it("accepts identical strings", () => {
      expect(constantTimeEqual("abc123", "abc123")).toBe(true);
    });
    it("rejects different strings of equal length", () => {
      expect(constantTimeEqual("abc123", "abc124")).toBe(false);
    });
    it("rejects different lengths", () => {
      expect(constantTimeEqual("abc", "abcd")).toBe(false);
    });
    it("handles empty strings", () => {
      expect(constantTimeEqual("", "")).toBe(true);
      expect(constantTimeEqual("", "abc")).toBe(false);
      expect(constantTimeEqual("abc", "")).toBe(false);
    });
  });
});

describe("RO-1 route enforcement wiring", () => {
  async function readRoute(): Promise<string> {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    return fs.readFile(
      path.join(process.cwd(), "src/app/api/opennext-runtime-proof/route.ts"),
      "utf-8",
    );
  }

  it("uses the production guard helpers rather than inline duplicate logic", async () => {
    const content = await readRoute();
    expect(content).toContain("import {");
    expect(content).toContain("constantTimeEqual");
    expect(content).toContain("extractBearerToken");
    expect(content).toContain("isPostgres17");
    expect(content).not.toContain("function constantTimeEqual(");
    expect(content).not.toContain("replace(/^Bearer");
    expect(content).not.toContain("/^17\\\\./.test");
  });

  it.each(["probeApp", "probeStore"])(
    "%s applies transaction-local read-only mode before reading transaction state",
    async (probe) => {
      const content = await readRoute();
      const start = content.indexOf("async function " + probe + "()");
      expect(start).toBeGreaterThanOrEqual(0);
      const next = probe === "probeApp"
        ? content.indexOf("async function probeStore()", start)
        : content.indexOf("export async function GET", start);
      const body = content.slice(start, next);
      const setIndex = body.indexOf("set_config('transaction_read_only', 'on', true)");
      const stateIndex = body.indexOf("current_setting('transaction_read_only')::boolean");
      expect(setIndex).toBeGreaterThanOrEqual(0);
      expect(stateIndex).toBeGreaterThan(setIndex);
      expect(body).toContain("transactionReadOnlyEnforced: transaction");
    },
  );
});

describe("PostgreSQL read-only transaction semantics (local PGlite)", () => {
  it("a prepared SELECT set_config flips the state and rejects writes", async () => {
    const database = new PGlite();
    try {
      await database.query("CREATE TABLE ro_probe (value integer)");
      await database.query(
        "PREPARE ro_probe AS SELECT set_config('transaction_read_only', 'on', true) AS read_only",
      );
      await database.query("BEGIN");
      const configured = await database.query<{ read_only: string }>("EXECUTE ro_probe");
      expect(configured.rows[0]?.read_only).toBe("on");
      const state = await database.query<{ read_only: boolean }>(
        "SELECT current_setting('transaction_read_only')::boolean AS read_only",
      );
      expect(state.rows[0]?.read_only).toBe(true);
      await expect(
        database.query("INSERT INTO ro_probe (value) VALUES (1)"),
      ).rejects.toThrow();
      await database.query("ROLLBACK");
    } finally {
      await database.close();
    }
  });
});
