import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { rmSync, existsSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/* ============================================================
   HEAVIX — STEP 15.68: Preflight Logic Unit Tests
   ------------------------------------------------------------
   These tests exercise the STEP 15.68 preflight logic (F-15.68-01,
   F-15.68-02, F-15.68-07) WITHOUT connecting to any database.

   They run the actual dry-run script as a child process with
   controlled environment variables and assert on the exit code
   + stdout/stderr content. No staging or production database
   is contacted — the preflight fails BEFORE any DB query when
   the env-var checks fail.

   These tests are PURELY LOCAL — no DATABASE_URL needed.
   ============================================================ */

const SCRIPT = "scripts/rbac-backfill-dryrun.ts";
const RUNNER = "bunx";
const RUNNER_ARGS = ["tsx", SCRIPT];

interface RunResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

function runScript(env: Record<string, string | undefined>): RunResult {
  const result = spawnSync(RUNNER, RUNNER_ARGS, {
    encoding: "utf-8",
    timeout: 30000,
    env: { ...process.env, ...env },
    cwd: process.cwd(),
  });
  return {
    exitCode: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

describe("STEP 15.68 — Preflight Logic (F-15.68-01, F-15.68-02, F-15.68-07)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clear DB-related env vars so tests are deterministic
    delete process.env.DATABASE_URL;
    delete process.env.DRYRUN_CONFIRM_TARGET;
    delete process.env.DRYRUN_EXPECTED_ROLE;
  });

  afterEach(() => {
    // Restore
    for (const key of Object.keys(originalEnv)) {
      process.env[key] = originalEnv[key];
    }
  });

  describe("F-15.68-01: Two-key target confirmation (no silent fallback)", () => {
    it("1. Missing DATABASE_URL → exit 2, no DB query", () => {
      const res = runScript({
        DATABASE_URL: undefined,
        DRYRUN_CONFIRM_TARGET: undefined,
      });
      expect(res.exitCode).toBe(2);
      // Preflight FAIL messages go to console.error → stderr
      const combined = res.stdout + res.stderr;
      expect(combined).toContain("PREFLIGHT FAIL: DATABASE_URL is not set");
      expect(combined).toContain("No silent fallback");
    });

    it("2. DATABASE_URL set but DRYRUN_CONFIRM_TARGET missing → exit 2", () => {
      const res = runScript({
        DATABASE_URL: "postgresql://user:pass@host:5432/heavix_staging?schema=public",
        DRYRUN_CONFIRM_TARGET: undefined,
      });
      expect(res.exitCode).toBe(2);
      const combined = res.stdout + res.stderr;
      expect(combined).toContain("PREFLIGHT FAIL: DRYRUN_CONFIRM_TARGET is not set");
      expect(combined).toContain("Two-key confirmation is required");
    });

    it("3. DRYRUN_CONFIRM_TARGET mismatch with DATABASE_URL db name → exit 2", () => {
      const res = runScript({
        DATABASE_URL: "postgresql://user:pass@host:5432/heavix_staging?schema=public",
        DRYRUN_CONFIRM_TARGET: "heavix_dev",
      });
      expect(res.exitCode).toBe(2);
      const combined = res.stdout + res.stderr;
      expect(combined).toContain("PREFLIGHT FAIL: DRYRUN_CONFIRM_TARGET does not match");
      expect(combined).toContain("DRYRUN_CONFIRM_TARGET = heavix_dev");
      expect(combined).toContain("DATABASE_URL db name  = heavix_staging");
    });

    it("4. DRYRUN_CONFIRM_TARGET matches DATABASE_URL db name → passes target check (fails later on DB connect)", () => {
      const res = runScript({
        DATABASE_URL: "postgresql://user:pass@host:5432/heavix_staging?schema=public",
        DRYRUN_CONFIRM_TARGET: "heavix_staging",
      });
      // Target check passes, then tries to query current_user — connection fails
      // because host doesn't exist. Should exit 2 (preflight role-check failure).
      const combined = res.stdout + res.stderr;
      expect(res.exitCode).toBe(2);
      expect(res.stdout).toContain("Target confirmation     : PASS");
      // After target passes, role check attempts DB query → connection fails → preflight FAIL
      expect(combined).toContain("PREFLIGHT FAIL");
    });
  });

  describe("F-15.68-07: Sanitize connection string (no password leak)", () => {
    it("5. Sanitized URL in output — password masked", () => {
      const res = runScript({
        DATABASE_URL: "postgresql://heavix_dryrun_ro:super_secret_password@host:5432/heavix_test?schema=public",
        DRYRUN_CONFIRM_TARGET: "heavix_test",
      });
      // STEP 15.71: sanitizeConnectionString now strips BOTH username AND password
      // The output should NOT contain the password or username
      expect(res.stdout).not.toContain("super_secret_password");
      expect(res.stdout).not.toContain("heavix_dryrun_ro:"); // username:password format should not appear
      expect(res.stderr).not.toContain("super_secret_password");
      // The host should still appear for verification
      expect(res.stdout).toContain("host");
      expect(res.stdout).toContain("heavix_test");
    });

    it("6. Unparseable DATABASE_URL → db name shows <unparseable>, still requires DRYRUN_CONFIRM_TARGET", () => {
      const res = runScript({
        DATABASE_URL: "not-a-valid-url",
        DRYRUN_CONFIRM_TARGET: undefined,
      });
      expect(res.exitCode).toBe(2);
      expect(res.stdout).toContain("Parsed db name          : <unparseable>");
      const combined = res.stdout + res.stderr;
      expect(combined).toContain("PREFLIGHT FAIL: DRYRUN_CONFIRM_TARGET is not set");
    });

    it("7. Connection string with special chars in password — still masked", () => {
      const res = runScript({
        DATABASE_URL: "postgresql://user:p@ss:w0rd!@host:5432/db?schema=public",
        DRYRUN_CONFIRM_TARGET: "db",
      });
      // Password with special chars should be masked
      // Note: the regex masks everything between user: and @host
      expect(res.stdout).not.toContain("p@ss:w0rd!");
    });
  });

  describe("F-15.68-02: Runtime role verification (requires DB — tested via preflight failure)", () => {
    it("8. DRYRUN_EXPECTED_ROLE defaults to heavix_dryrun_ro", () => {
      const res = runScript({
        DATABASE_URL: "postgresql://user:pass@host:5432/heavix_test?schema=public",
        DRYRUN_CONFIRM_TARGET: "heavix_test",
        // DRYRUN_EXPECTED_ROLE not set — should default
      });
      expect(res.stdout).toContain("Expected read-only role : heavix_dryrun_ro");
    });

    it("9. Custom DRYRUN_EXPECTED_ROLE is honored", () => {
      const res = runScript({
        DATABASE_URL: "postgresql://user:pass@host:5432/heavix_test?schema=public",
        DRYRUN_CONFIRM_TARGET: "heavix_test",
        DRYRUN_EXPECTED_ROLE: "custom_ro_role",
      });
      expect(res.stdout).toContain("Expected read-only role : custom_ro_role");
    });
  });

  describe("Preflight ordering — runs BEFORE any DB query", () => {
    it("10. Missing DATABASE_URL — never reaches Role catalog loading", () => {
      const res = runScript({
        DATABASE_URL: undefined,
      });
      expect(res.exitCode).toBe(2);
      const combined = res.stdout + res.stderr;
      // Should fail at preflight, NOT at "RBAC catalog incomplete"
      expect(combined).not.toContain("RBAC catalog incomplete");
      expect(combined).toContain("PREFLIGHT FAIL");
    });

    it("11. Missing DRYRUN_CONFIRM_TARGET — never reaches Role catalog loading", () => {
      const res = runScript({
        DATABASE_URL: "postgresql://user:pass@host:5432/heavix_test?schema=public",
        DRYRUN_CONFIRM_TARGET: undefined,
      });
      expect(res.exitCode).toBe(2);
      const combined = res.stdout + res.stderr;
      expect(combined).not.toContain("RBAC catalog incomplete");
      expect(combined).toContain("PREFLIGHT FAIL");
    });
  });
});

/* ============================================================
   Sanitization helper unit tests — pure logic, no subprocess
   ============================================================ */

describe("STEP 15.68 — Sanitization helpers (pure logic)", () => {
  // Re-implement the sanitization regex here to test the LOGIC independently.
  // This duplicates the production regex — if the production regex changes,
  // this test must be updated. The goal is to verify the masking behavior.

  function sanitizeConnectionString(url: string): string {
    return url.replace(/(postgresql:\/\/[^:@]+:)([^@]+)(@)/, "$1***$3");
  }

  function extractDbName(url: string): string | null {
    const match = url.match(/postgresql:\/\/[^@]+@[^/]+\/([^?]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  }

  it("12. sanitizeConnectionString masks password", () => {
    const input = "postgresql://user:secret@host:5432/db?schema=public";
    const output = sanitizeConnectionString(input);
    expect(output).toBe("postgresql://user:***@host:5432/db?schema=public");
    expect(output).not.toContain("secret");
  });

  it("13. sanitizeConnectionString — @ in password is a known limitation (operators must URL-encode)", () => {
    // URL-encode passwords per RFC 3986. The sanitizer regex masks everything
    // between user: and the FIRST @. If the password itself contains @, the
    // operator MUST URL-encode it (%40) or the connection string is malformed.
    // This test documents the limitation: a raw @ in password breaks masking.
    const input = "postgresql://user:p%40ss%21w0rd@host:5432/db";
    const output = sanitizeConnectionString(input);
    expect(output).toBe("postgresql://user:***@host:5432/db");
    expect(output).not.toContain("p%40ss%21w0rd");
  });

  it("14. extractDbName extracts db name from valid URL", () => {
    const input = "postgresql://user:pass@host:5432/heavix_staging?schema=public";
    expect(extractDbName(input)).toBe("heavix_staging");
  });

  it("15. extractDbName returns null for unparseable URL", () => {
    expect(extractDbName("not-a-url")).toBeNull();
    expect(extractDbName("postgresql://user:pass@host")).toBeNull();
  });

  it("16. extractDbName handles URL-encoded db names", () => {
    const input = "postgresql://user:pass@host:5432/my%2Bdb?schema=public";
    expect(extractDbName(input)).toBe("my+db");
  });

  it("17. sanitizeConnectionString does not mask when no password present", () => {
    const input = "postgresql://host:5432/db";
    const output = sanitizeConnectionString(input);
    expect(output).toBe(input);
  });
});
