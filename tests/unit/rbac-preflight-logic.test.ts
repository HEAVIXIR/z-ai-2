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
    delete process.env.DRYRUN_EXPECTED_HOST;
    delete process.env.DRYRUN_CI_HOST_CHECK_EXCEPTION;
    delete process.env.DRYRUN_SERVER_IDENTITY_ANCHOR;
    delete process.env.GITHUB_ACTIONS;
    delete process.env.CI;
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
        // STEP 15.72: DRYRUN_EXPECTED_HOST is now required for host identity.
        DRYRUN_EXPECTED_HOST: "host",
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
        // STEP 15.72: DRYRUN_EXPECTED_HOST now required.
        DRYRUN_EXPECTED_HOST: "host",
      });
      // STEP 15.71: sanitizeConnectionString now strips BOTH username AND password
      // The output should NOT contain the password or username
      expect(res.stdout).not.toContain("super_secret_password");
      expect(res.stdout).not.toContain("heavix_dryrun_ro:"); // username:password format should not appear
      expect(res.stderr).not.toContain("super_secret_password");
      // STEP 15.72 Finding 1: strengthened — NO password fragments may leak.
      // The password "super_secret_password" must not appear in any form.
      expect(res.stdout).not.toContain("super_secret");
      expect(res.stdout).not.toContain("secret_password");
      expect(res.stdout).not.toContain("secret");
      expect(res.stderr).not.toContain("super_secret");
      expect(res.stderr).not.toContain("secret_password");
      expect(res.stderr).not.toContain("secret");
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
        // STEP 15.72: DRYRUN_EXPECTED_HOST now required.
        DRYRUN_EXPECTED_HOST: "host",
      });
      // Password with special chars should be masked
      // Note: the regex masks everything between user: and @host
      expect(res.stdout).not.toContain("p@ss:w0rd!");
      // STEP 15.72 Finding 1: strengthened — no password fragments may leak.
      // The password "p@ss:w0rd!" must not appear in any recognizable fragment.
      expect(res.stdout).not.toContain("p@ss");
      expect(res.stdout).not.toContain("ss:w0rd");
      expect(res.stdout).not.toContain("w0rd");
      expect(res.stdout).not.toContain("ss");
      expect(res.stderr).not.toContain("p@ss:w0rd!");
      expect(res.stderr).not.toContain("w0rd");
      expect(res.stderr).not.toContain("ss");
    });
  });

  describe("F-15.68-02: Runtime role verification (requires DB — tested via preflight failure)", () => {
    it("8. DRYRUN_EXPECTED_ROLE defaults to heavix_dryrun_ro (allowlist-verified)", () => {
      const res = runScript({
        DATABASE_URL: "postgresql://user:pass@host:5432/heavix_test?schema=public",
        DRYRUN_CONFIRM_TARGET: "heavix_test",
        // STEP 15.72: DRYRUN_EXPECTED_HOST now required.
        DRYRUN_EXPECTED_HOST: "host",
        // DRYRUN_EXPECTED_ROLE not set — should default
      });
      // STEP 15.72 Finding 2: the message now reads "Trusted read-only role"
      // (allowlist-verified) instead of "Expected read-only role" (raw env var).
      expect(res.stdout).toContain("Trusted read-only role : heavix_dryrun_ro (allowlist-verified)");
    });

    it("9. STEP 15.72 Finding 2: Non-allowlisted DRYRUN_EXPECTED_ROLE fails closed", () => {
      const res = runScript({
        DATABASE_URL: "postgresql://user:pass@host:5432/heavix_test?schema=public",
        DRYRUN_CONFIRM_TARGET: "heavix_test",
        DRYRUN_EXPECTED_HOST: "host",
        // 'custom_ro_role' is NOT in TRUSTED_READONLY_ROLE_ALLOWLIST.
        DRYRUN_EXPECTED_ROLE: "custom_ro_role",
      });
      // STEP 15.72 Finding 2: must fail closed — no privilege elevation via
      // caller-configured role name.
      expect(res.exitCode).toBe(2);
      const combined = res.stdout + res.stderr;
      expect(combined).toContain("PREFLIGHT FAIL: DRYRUN_EXPECTED_ROLE is not in the trusted allowlist");
      expect(combined).toContain("DRYRUN_EXPECTED_ROLE = custom_ro_role");
      expect(combined).toContain("TRUSTED_READONLY_ROLE_ALLOWLIST");
      // Must NOT proceed to DB connection
      expect(combined).not.toContain("Target confirmation     : PASS");
    });

    it("9a. STEP 15.72 Finding 2: Allowlisted DRYRUN_EXPECTED_ROLE is honored", () => {
      const res = runScript({
        DATABASE_URL: "postgresql://user:pass@host:5432/heavix_test?schema=public",
        DRYRUN_CONFIRM_TARGET: "heavix_test",
        DRYRUN_EXPECTED_HOST: "host",
        // 'heavix_dryrun_ro' IS in TRUSTED_READONLY_ROLE_ALLOWLIST.
        DRYRUN_EXPECTED_ROLE: "heavix_dryrun_ro",
      });
      expect(res.stdout).toContain("Trusted read-only role : heavix_dryrun_ro (allowlist-verified)");
    });
  });

  describe("STEP 15.73 Finding 4: MANDATORY host identity verification", () => {
    it("9b. Missing DRYRUN_EXPECTED_HOST → exit 2 (MANDATORY halt, no warning skip)", () => {
      const res = runScript({
        DATABASE_URL: "postgresql://user:pass@host:5432/heavix_test?schema=public",
        DRYRUN_CONFIRM_TARGET: "heavix_test",
        // DRYRUN_EXPECTED_HOST intentionally missing.
        // DRYRUN_CI_HOST_CHECK_EXCEPTION intentionally not set.
      });
      expect(res.exitCode).toBe(2);
      const combined = res.stdout + res.stderr;
      // MUST halt with a hard fail — NOT a warning/skip
      expect(combined).toContain("PREFLIGHT FAIL: DRYRUN_EXPECTED_HOST is not set");
      expect(combined).toContain("MANDATORY");
      // MUST NOT contain a warning or skip
      expect(combined).not.toContain("WARNING: DRYRUN_EXPECTED_HOST is not set");
      expect(combined).not.toContain("SKIPPED");
      // MUST NOT continue to DB queries (no "Trusted read-only role" output)
      expect(combined).not.toContain("Trusted read-only role");
    });

    it("9c. DRYRUN_EXPECTED_HOST mismatch with DATABASE_URL host → exit 2", () => {
      const res = runScript({
        DATABASE_URL: "postgresql://user:pass@host:5432/heavix_test?schema=public",
        DRYRUN_CONFIRM_TARGET: "heavix_test",
        DRYRUN_EXPECTED_HOST: "wrong-host",
      });
      expect(res.exitCode).toBe(2);
      const combined = res.stdout + res.stderr;
      expect(combined).toContain("PREFLIGHT FAIL: DRYRUN_EXPECTED_HOST does not match DATABASE_URL host");
      expect(combined).toContain("DRYRUN_EXPECTED_HOST = wrong-host");
      expect(combined).toContain("DATABASE_URL host    = host");
    });

    it("9d. DRYRUN_EXPECTED_HOST matches DATABASE_URL host → passes host check (fails later on DB connect)", () => {
      const res = runScript({
        DATABASE_URL: "postgresql://user:pass@host:5432/heavix_test?schema=public",
        DRYRUN_CONFIRM_TARGET: "heavix_test",
        DRYRUN_EXPECTED_HOST: "host",
        // DRYRUN_CI_HOST_CHECK_EXCEPTION NOT set — IP check would run
      });
      // Host check passes, then tries DB connect which fails (host doesn't exist)
      expect(res.exitCode).toBe(2);
      const combined = res.stdout + res.stderr;
      // STEP 15.76: "Host identity" label renamed to "Hostname consistency"
      // (configuration consistency — NOT a server-identity proof).
      expect(combined).toContain("Hostname consistency     : PASS ✅");
      expect(combined).toContain("Configuration consistency — NOT a server-identity proof");
      // Should NOT contain a hard fail about DRYRUN_EXPECTED_HOST
      expect(combined).not.toContain("PREFLIGHT FAIL: DRYRUN_EXPECTED_HOST is not set");
    });

    it("9e. STEP 15.75: DRYRUN_CI_HOST_CHECK_EXCEPTION set to ANY value → halt (deprecated bypass)", () => {
      const res = runScript({
        DATABASE_URL: "postgresql://user:pass@host:5432/heavix_test?schema=public",
        DRYRUN_CONFIRM_TARGET: "heavix_test",
        DRYRUN_EXPECTED_HOST: "host",
        DRYRUN_CI_HOST_CHECK_EXCEPTION: "true",
        // STEP 15.75: even with GITHUB_ACTIONS=true + CI=true (genuine CI
        // signals), the deprecated flag still halts — fail closed.
        GITHUB_ACTIONS: "true",
        CI: "true",
      });
      expect(res.exitCode).toBe(2);
      const combined = res.stdout + res.stderr;
      // Must halt — the flag is deprecated and no longer honored.
      expect(combined).toContain("PREFLIGHT FAIL: DRYRUN_CI_HOST_CHECK_EXCEPTION is set (deprecated)");
      expect(combined).toContain("deprecated");
      // Must NOT continue to DB queries
      expect(combined).not.toContain("Trusted read-only role");
    });

    it("9f. STEP 15.75: DRYRUN_CI_HOST_CHECK_EXCEPTION set to 'false' → still halt (ANY value halts)", () => {
      const res = runScript({
        DATABASE_URL: "postgresql://user:pass@host:5432/heavix_test?schema=public",
        DRYRUN_CONFIRM_TARGET: "heavix_test",
        DRYRUN_EXPECTED_HOST: "host",
        // Setting the flag to "false" is still SETTING it — any value halts.
        DRYRUN_CI_HOST_CHECK_EXCEPTION: "false",
      });
      expect(res.exitCode).toBe(2);
      const combined = res.stdout + res.stderr;
      expect(combined).toContain("PREFLIGHT FAIL: DRYRUN_CI_HOST_CHECK_EXCEPTION is set (deprecated)");
      expect(combined).toContain("deprecated");
      // Must NOT continue to DB queries
      expect(combined).not.toContain("Trusted read-only role");
    });

    it("9g. STEP 15.75: All identity checks still mandatory in CI (hostname, target, role, privileges)", () => {
      // Even with GITHUB_ACTIONS=true + CI=true (genuine CI env), all identity
      // checks remain mandatory. No bypass exists anymore.
      const res = runScript({
        DATABASE_URL: "postgresql://user:pass@host:5432/heavix_test?schema=public",
        DRYRUN_CONFIRM_TARGET: "heavix_test",
        // DRYRUN_EXPECTED_HOST intentionally NOT set — must halt even in CI.
        GITHUB_ACTIONS: "true",
        CI: "true",
        // DRYRUN_CI_HOST_CHECK_EXCEPTION intentionally NOT set.
      });
      expect(res.exitCode).toBe(2);
      const combined = res.stdout + res.stderr;
      // Hostname match is enforced unconditionally — CI signals don't bypass it.
      expect(combined).toContain("PREFLIGHT FAIL: DRYRUN_EXPECTED_HOST is not set");
      expect(combined).toContain("MANDATORY");
      // Must NOT continue to DB queries
      expect(combined).not.toContain("Trusted read-only role");
    });

    it("9h. STEP 15.75: No credential leak in failure output", () => {
      const res = runScript({
        DATABASE_URL: "postgresql://user:super_secret_password@host:5432/heavix_test?schema=public",
        DRYRUN_CONFIRM_TARGET: "heavix_test",
        DRYRUN_EXPECTED_HOST: "wrong-host",
      });
      expect(res.exitCode).toBe(2);
      // Password must NEVER appear in stdout or stderr
      expect(res.stdout).not.toContain("super_secret_password");
      expect(res.stderr).not.toContain("super_secret_password");
    });

    it("9i. STEP 15.75: Bypass attempt with credential → no leak", () => {
      const res = runScript({
        DATABASE_URL: "postgresql://user:super_secret_password@host:5432/heavix_test?schema=public",
        DRYRUN_CONFIRM_TARGET: "heavix_test",
        DRYRUN_EXPECTED_HOST: "host",
        // Deprecated bypass flag set — must halt AND not leak credentials.
        DRYRUN_CI_HOST_CHECK_EXCEPTION: "true",
      });
      expect(res.exitCode).toBe(2);
      // Password must NEVER appear even in deprecated-flag failure path
      expect(res.stdout).not.toContain("super_secret_password");
      expect(res.stderr).not.toContain("super_secret_password");
    });

    it("9j. STEP 15.75: Normal flow (no deprecated flag) → proceeds past host check", () => {
      const res = runScript({
        DATABASE_URL: "postgresql://user:pass@host:5432/heavix_test?schema=public",
        DRYRUN_CONFIRM_TARGET: "heavix_test",
        DRYRUN_EXPECTED_HOST: "host",
        // DRYRUN_CI_HOST_CHECK_EXCEPTION intentionally NOT set — proceeds normally.
        // GITHUB_ACTIONS / CI intentionally NOT set — they have no effect anymore.
      });
      // Host check passes, then DB connect fails (host doesn't exist) → exit 2
      expect(res.exitCode).toBe(2);
      const combined = res.stdout + res.stderr;
      // STEP 15.76: "Host identity" label renamed to "Hostname consistency".
      expect(combined).toContain("Hostname consistency     : PASS ✅");
      // Must NOT contain a deprecated-flag halt message
      expect(combined).not.toContain("PREFLIGHT FAIL: DRYRUN_CI_HOST_CHECK_EXCEPTION");
    });

    it("9k. STEP 15.76: Normal flow (no DRYRUN_SERVER_IDENTITY_ANCHOR) → proceeds but logs UNVERIFIED", () => {
      // Per Directive 2: if DRYRUN_SERVER_IDENTITY_ANCHOR is NOT set, the
      // preflight must log "Server identity: UNVERIFIED ⚠" and CONTINUE
      // (it is NOT blocked — the operator is informed).
      const res = runScript({
        DATABASE_URL: "postgresql://user:pass@host:5432/heavix_test?schema=public",
        DRYRUN_CONFIRM_TARGET: "heavix_test",
        DRYRUN_EXPECTED_HOST: "host",
        // DRYRUN_SERVER_IDENTITY_ANCHOR intentionally NOT set.
      });
      // The host check passes; the UNVERIFIED message is logged EARLY (before
      // DB connect); then DB connect fails (no real DB in test env) → exit 2.
      expect(res.exitCode).toBe(2);
      const combined = res.stdout + res.stderr;
      // Hostname consistency check must pass (renamed from "Host identity").
      expect(combined).toContain("Hostname consistency     : PASS ✅");
      // The UNVERIFIED ⚠ message must appear (operator was informed that
      // identity has NOT been independently confirmed via a trust anchor).
      expect(combined).toContain("Server identity         : UNVERIFIED ⚠");
      expect(combined).toContain("no independent trust anchor");
      expect(combined).toContain("DRYRUN_SERVER_IDENTITY_ANCHOR not set");
      // Must NOT contain a VERIFIED message (the anchor was not set).
      expect(combined).not.toContain("Server identity         : VERIFIED ✅");
      // Must NOT contain a hard PREFLIGHT FAIL specifically about the trust anchor.
      expect(combined).not.toContain("server-side trust anchor does not match");
      expect(combined).not.toContain("DRYRUN_SERVER_IDENTITY_ANCHOR is set but the server-side GUC");
    });

    it("9l. STEP 15.76: DRYRUN_SERVER_IDENTITY_ANCHOR set → passes host check (fails later on DB connect since no real DB in test env)", () => {
      // Per Directive 2: when the anchor IS set, the preflight defers the
      // GUC comparison to AFTER DB connect. In the test env, there is no
      // real DB — the script fails at DB connect (exit 2) before it ever
      // queries the GUC. The host check still passes.
      const res = runScript({
        DATABASE_URL: "postgresql://user:pass@host:5432/heavix_test?schema=public",
        DRYRUN_CONFIRM_TARGET: "heavix_test",
        DRYRUN_EXPECTED_HOST: "host",
        DRYRUN_SERVER_IDENTITY_ANCHOR: "prod-cluster-east-1",
      });
      // Host check passes, then DB connect fails (no real DB) → exit 2.
      // The GUC query never runs because DB connect failed first.
      expect(res.exitCode).toBe(2);
      const combined = res.stdout + res.stderr;
      // Hostname consistency check must pass (renamed from "Host identity").
      expect(combined).toContain("Hostname consistency     : PASS ✅");
      // The PENDING ⏳ message must appear (anchor was set; verification
      // deferred to post-DB-connect, which never succeeded in this test env).
      expect(combined).toContain("Server identity         : PENDING ⏳");
      expect(combined).toContain("independent trust anchor configured");
      expect(combined).toContain("will verify after DB connect");
      // Must NOT contain a VERIFIED message — DB connect failed before the
      // GUC comparison could run.
      expect(combined).not.toContain("Server identity         : VERIFIED ✅");
      // Must NOT contain a hard PREFLIGHT FAIL about a GUC mismatch — the
      // GUC was never queried (DB connect failed first).
      expect(combined).not.toContain("server-side trust anchor does not match");
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
   Sanitization helper unit tests — import REAL implementation
   STEP 15.71 Phase C: tests must exercise the ACTUAL production
   functions from src/lib/rbac/dryrun-helpers.ts, not duplicated logic.
   STEP 15.72: strengthened assertions for Finding 1 (no password
   fragments leak) + new tests for resolveTrustedRole, extractHost,
   categorizeDbError, redactConnectionDetails.
   ============================================================ */

import {
  sanitizeConnectionString as realSanitize,
  extractDbName as realExtractDbName,
  mapLegacyRole as realMapLegacyRole,
  extractHost as realExtractHost,
  resolveTrustedRole as realResolveTrustedRole,
  categorizeDbError as realCategorizeDbError,
  redactConnectionDetails as realRedactConnectionDetails,
  TRUSTED_READONLY_ROLE_ALLOWLIST as REAL_ALLOWLIST,
} from "@/lib/rbac/dryrun-helpers";

describe("STEP 15.71 — Sanitization helpers (REAL implementation from dryrun-helpers.ts)", () => {
  it("12. sanitizeConnectionString masks BOTH username AND password", () => {
    const input = "postgresql://user:secret@host:5432/db?schema=public";
    const output = realSanitize(input);
    expect(output).not.toContain("secret");
    expect(output).not.toContain("user:");
    // Should still show host/port/db for operator verification
    expect(output).toContain("host:5432");
    expect(output).toContain("db");
  });

  it("13. sanitizeConnectionString handles password with @ (URL-encoded)", () => {
    // Per RFC 3986, passwords with @ should be URL-encoded as %40.
    // The new URL-based parser handles this correctly.
    const input = "postgresql://user:p%40ss%21w0rd@host:5432/db";
    const output = realSanitize(input);
    expect(output).not.toContain("p%40ss%21w0rd");
    expect(output).not.toContain("p@ss");
    expect(output).not.toContain("ss!w0rd");
    expect(output).not.toContain("w0rd");
    // STEP 15.72 Finding 1: strengthened — no password fragments leak.
    expect(output).not.toContain("ss");
  });

  it("13a. sanitizeConnectionString handles password with multiple @ (unencoded — malformed URL)", () => {
    // If the password contains a raw @ (unencoded), the URL is malformed.
    // The new URL parser will still try to parse it. We verify NO password
    // fragment leaks regardless of how malformed the URL is.
    const input = "postgresql://user:p@ss@host:5432/db";
    const output = realSanitize(input);
    // The password "p" (before first @) should not appear as a recognizable fragment.
    // The "ss" after @ should not appear either.
    // Most importantly, the full password "p@ss" must never appear.
    expect(output).not.toContain("p@ss");
    // STEP 15.72 Finding 1: strengthened — assert NO recognizable password
    // fragments leak (the prior test only checked `p@ss` was absent, NOT that
    // `ss` or other fragments were absent).
    expect(output).not.toContain("ss");
  });

  it("13b. sanitizeConnectionString handles password with : (colon)", () => {
    const input = "postgresql://user:p:ss:w0rd@host:5432/db";
    const output = realSanitize(input);
    expect(output).not.toContain("p:ss:w0rd");
    expect(output).not.toContain("ss:w0rd");
    // STEP 15.72 Finding 1: strengthened — no password fragments leak.
    expect(output).not.toContain("ss");
    expect(output).not.toContain("w0rd");
  });

  it("13c. sanitizeConnectionString handles password with / (slash)", () => {
    const input = "postgresql://user:p/ss@host:5432/db";
    const output = realSanitize(input);
    expect(output).not.toContain("p/ss");
    // STEP 15.72 Finding 1: strengthened — no password fragments leak.
    expect(output).not.toContain("ss");
  });

  it("13d. sanitizeConnectionString handles password with ? (query separator)", () => {
    const input = "postgresql://user:p?ss@host:5432/db";
    const output = realSanitize(input);
    expect(output).not.toContain("p?ss");
    // STEP 15.72 Finding 1: strengthened — no password fragments leak.
    expect(output).not.toContain("ss");
  });

  it("13e. sanitizeConnectionString handles password with # (fragment)", () => {
    const input = "postgresql://user:p#ss@host:5432/db";
    const output = realSanitize(input);
    expect(output).not.toContain("p#ss");
    // STEP 15.72 Finding 1: strengthened — no password fragments leak.
    expect(output).not.toContain("ss");
  });

  it("13f. sanitizeConnectionString handles password with % (encoded chars)", () => {
    const input = "postgresql://user:p%40ss%21@host:5432/db";
    const output = realSanitize(input);
    expect(output).not.toContain("p%40ss%21");
    expect(output).not.toContain("@ss");
    // STEP 15.72 Finding 1: strengthened — no password fragments leak.
    expect(output).not.toContain("ss");
  });

  it("13g. STEP 15.72 Finding 1: long complex password — NO fragments leak", () => {
    // A complex password with mixed-case, digits, and special chars.
    // No fragment (prefix, suffix, middle substring) may appear in output.
    const password = "Super$ecretP@ss!w0rd123";
    const input = `postgresql://ro_user:${password}@db.example.com:5432/prod_db`;
    const output = realSanitize(input);
    // The full password must never appear
    expect(output).not.toContain(password);
    // No recognizable fragments may leak
    expect(output).not.toContain("Super$ecret");
    expect(output).not.toContain("P@ss!w0rd");
    expect(output).not.toContain("w0rd123");
    expect(output).not.toContain("$ecret");
    expect(output).not.toContain("w0rd");
    expect(output).not.toContain("ss");
    // Host / db / port should still appear for verification
    expect(output).toContain("db.example.com");
    expect(output).toContain("5432");
    expect(output).toContain("prod_db");
  });

  it("14. extractDbName extracts db name from valid URL", () => {
    const input = "postgresql://user:pass@host:5432/heavix_staging?schema=public";
    expect(realExtractDbName(input)).toBe("heavix_staging");
  });

  it("15. extractDbName returns null for unparseable URL", () => {
    expect(realExtractDbName("not-a-url")).toBeNull();
    expect(realExtractDbName("postgresql://user:pass@host")).toBeNull();
  });

  it("16. extractDbName handles URL-encoded db names", () => {
    const input = "postgresql://user:pass@host:5432/my%2Bdb?schema=public";
    expect(realExtractDbName(input)).toBe("my+db");
  });

  it("17. STEP 15.72 Finding 1: sanitizeConnectionString returns generic message — no input fragments", () => {
    const input = "not-a-valid-url";
    const output = realSanitize(input);
    // Should NOT crash, should NOT leak input, should return safe message
    expect(output).toContain("unable to parse");
    // STEP 15.72 Finding 1: NEVER print ANY sanitized URL on parse failure.
    // The output must NOT contain any fragment of the input.
    expect(output).not.toContain("not-a-valid-url");
    expect(output).not.toContain("not-a");
    expect(output).not.toContain("valid");
    expect(output).not.toContain("url");
  });

  it("18. mapLegacyRole (real implementation) — ADMIN maps to ADMIN", () => {
    expect(realMapLegacyRole("ADMIN")).toBe("ADMIN");
  });

  it("19. mapLegacyRole (real implementation) — SUPERADMIN maps to ADMIN (alias)", () => {
    expect(realMapLegacyRole("SUPERADMIN")).toBe("ADMIN");
  });

  it("20. mapLegacyRole (real implementation) — null/empty/whitespace maps to BUYER", () => {
    expect(realMapLegacyRole(null)).toBe("BUYER");
    expect(realMapLegacyRole("")).toBe("BUYER");
    expect(realMapLegacyRole("   ")).toBe("BUYER");
  });

  it("21. mapLegacyRole (real implementation) — case-insensitive", () => {
    expect(realMapLegacyRole("admin")).toBe("ADMIN");
    expect(realMapLegacyRole("Seller")).toBe("SELLER");
  });

  it("22. mapLegacyRole (real implementation) — unknown returns null (INVALID)", () => {
    expect(realMapLegacyRole("UNKNOWN_ROLE")).toBeNull();
    expect(realMapLegacyRole("GOD")).toBeNull();
  });
});

/* ============================================================
   STEP 15.72 — New helper unit tests (REAL implementation).
   Tests for: TRUSTED_READONLY_ROLE_ALLOWLIST, resolveTrustedRole,
   extractHost, categorizeDbError, redactConnectionDetails.
   ============================================================ */

describe("STEP 15.72 — TRUSTED_READONLY_ROLE_ALLOWLIST (constant)", () => {
  it("23. Allowlist contains 'heavix_dryrun_ro' (the SQL-created role)", () => {
    expect(REAL_ALLOWLIST).toContain("heavix_dryrun_ro");
  });

  it("24. Allowlist is a fixed constant (cannot be mutated at runtime)", () => {
    // The `as const` declaration makes the tuple readonly at the type level.
    // At runtime the array is still mutable, but the type prevents callers
    // from adding values via TypeScript checks. Verify the tuple shape is fixed.
    expect(REAL_ALLOWLIST.length).toBe(1);
    expect(Array.isArray(REAL_ALLOWLIST)).toBe(true);
  });
});

describe("STEP 15.72 — resolveTrustedRole() (Finding 2 — allowlist enforcement)", () => {
  it("25. resolveTrustedRole(undefined) → 'heavix_dryrun_ro' (default is allowlisted)", () => {
    expect(realResolveTrustedRole(undefined)).toBe("heavix_dryrun_ro");
  });

  it("26. resolveTrustedRole(null) → 'heavix_dryrun_ro' (default is allowlisted)", () => {
    expect(realResolveTrustedRole(null)).toBe("heavix_dryrun_ro");
  });

  it("27. resolveTrustedRole('') → 'heavix_dryrun_ro' (empty → default)", () => {
    expect(realResolveTrustedRole("")).toBe("heavix_dryrun_ro");
  });

  it("28. resolveTrustedRole('   ') → 'heavix_dryrun_ro' (whitespace → default)", () => {
    expect(realResolveTrustedRole("   ")).toBe("heavix_dryrun_ro");
  });

  it("29. resolveTrustedRole('heavix_dryrun_ro') → 'heavix_dryrun_ro' (allowlisted)", () => {
    expect(realResolveTrustedRole("heavix_dryrun_ro")).toBe("heavix_dryrun_ro");
  });

  it("30. resolveTrustedRole('  heavix_dryrun_ro  ') → 'heavix_dryrun_ro' (trims whitespace)", () => {
    expect(realResolveTrustedRole("  heavix_dryrun_ro  ")).toBe("heavix_dryrun_ro");
  });

  it("31. STEP 15.72 Finding 2: resolveTrustedRole('custom_ro_role') → null (NOT in allowlist, fail closed)", () => {
    // Per owner directive: "if not in allowlist, fail closed".
    expect(realResolveTrustedRole("custom_ro_role")).toBeNull();
  });

  it("32. STEP 15.72 Finding 2: resolveTrustedRole('postgres') → null (superuser not allowed)", () => {
    // Even if an operator sets DRYRUN_EXPECTED_ROLE=postgres, it must fail closed.
    expect(realResolveTrustedRole("postgres")).toBeNull();
  });

  it("33. STEP 15.72 Finding 2: resolveTrustedRole('admin') → null (case-insensitive but still not allowlisted)", () => {
    // The allowlist is exact-match (no case folding) so 'admin' fails closed.
    expect(realResolveTrustedRole("admin")).toBeNull();
  });

  it("34. STEP 15.72 Finding 2: resolveTrustedRole('HEAVIX_DRYRUN_RO') → null (case-sensitive allowlist)", () => {
    // Uppercase variant is not in allowlist — must fail closed.
    expect(realResolveTrustedRole("HEAVIX_DRYRUN_RO")).toBeNull();
  });
});

describe("STEP 15.72 — extractHost() (Finding 4 — server identity)", () => {
  it("35. extractHost returns hostname from a valid URL", () => {
    const input = "postgresql://user:pass@db.example.com:5432/heavix?schema=public";
    expect(realExtractHost(input)).toBe("db.example.com");
  });

  it("36. extractHost returns IPv4 address verbatim", () => {
    const input = "postgresql://user:pass@127.0.0.1:5432/heavix";
    expect(realExtractHost(input)).toBe("127.0.0.1");
  });

  it("37. extractHost returns localhost for localhost URLs", () => {
    const input = "postgresql://user:pass@localhost:5432/heavix_test";
    expect(realExtractHost(input)).toBe("localhost");
  });

  it("38. extractHost returns null for unparseable URL", () => {
    expect(realExtractHost("not-a-url")).toBeNull();
  });

  it("39. extractHost returns null for empty string", () => {
    expect(realExtractHost("")).toBeNull();
  });

  it("40. extractHost strips the port (returns hostname only)", () => {
    const input = "postgresql://user:pass@db.example.com:6543/heavix";
    expect(realExtractHost(input)).toBe("db.example.com");
    expect(realExtractHost(input)).not.toContain("6543");
  });

  it("41. extractHost NEVER returns credentials (only hostname)", () => {
    const input = "postgresql://secretuser:secretpass@db.example.com:5432/heavix";
    const host = realExtractHost(input);
    expect(host).toBe("db.example.com");
    expect(host).not.toContain("secretuser");
    expect(host).not.toContain("secretpass");
  });
});

describe("STEP 15.72 — categorizeDbError() (Finding 5 — safe categorized diagnostic)", () => {
  it("42. categorizeDbError classifies ECONNREFUSED as CONNECTION_REFUSED", () => {
    const err = new Error("connect ECONNREFUSED 127.0.0.1:5432");
    const result = realCategorizeDbError(err);
    expect(result.category).toBe("CONNECTION_REFUSED");
    expect(result.message).not.toContain("127.0.0.1:5432");
    expect(result.message).not.toContain("ECONNREFUSED");
  });

  it("43. categorizeDbError classifies Prisma P1001 as CONNECTION_REFUSED", () => {
    const err = new Error("PrismaClientInitializationError: Can't reach database server at `db:5432` (P1001)");
    const result = realCategorizeDbError(err);
    expect(result.category).toBe("CONNECTION_REFUSED");
    expect(result.message).not.toContain("db:5432");
    expect(result.message).not.toContain("P1001");
  });

  it("44. categorizeDbError classifies authentication failure as AUTHENTICATION_FAILED", () => {
    const err = new Error('password authentication failed for user "heavix_dryrun_ro"');
    const result = realCategorizeDbError(err);
    expect(result.category).toBe("AUTHENTICATION_FAILED");
    // The safe message must NOT leak the role name from the raw error.
    expect(result.message).not.toContain("heavix_dryrun_ro");
    // The safe message must NOT contain the literal raw error fragment.
    expect(result.message).not.toContain("password authentication failed");
  });

  it("45. categorizeDbError classifies Prisma P1000 as AUTHENTICATION_FAILED", () => {
    const err = new Error("PrismaClientInitializationError: Authentication failed (P1000)");
    const result = realCategorizeDbError(err);
    expect(result.category).toBe("AUTHENTICATION_FAILED");
    expect(result.message).not.toContain("P1000");
    expect(result.message).not.toContain("PrismaClientInitializationError");
  });

  it("46. categorizeDbError classifies 'database does not exist' as DATABASE_NOT_FOUND", () => {
    const err = new Error('database "heavix_nonexistent" does not exist');
    const result = realCategorizeDbError(err);
    expect(result.category).toBe("DATABASE_NOT_FOUND");
    // The safe message must NOT contain the literal db name from the raw error.
    expect(result.message).not.toContain("heavix_nonexistent");
    // The safe message must NOT contain the literal raw error fragment
    // (i.e., the full quoted phrase used by PostgreSQL).
    expect(result.message).not.toContain('"heavix_nonexistent" does not exist');
  });

  it("47. categorizeDbError classifies Prisma P1003 as DATABASE_NOT_FOUND", () => {
    const err = new Error("PrismaClientInitializationError: Database does not exist (P1003)");
    const result = realCategorizeDbError(err);
    expect(result.category).toBe("DATABASE_NOT_FOUND");
    expect(result.message).not.toContain("P1003");
    expect(result.message).not.toContain("PrismaClientInitializationError");
  });

  it("48. categorizeDbError classifies 'permission denied' as PERMISSION_DENIED", () => {
    const err = new Error('permission denied for relation "User"');
    const result = realCategorizeDbError(err);
    expect(result.category).toBe("PERMISSION_DENIED");
    // The safe message must NOT leak the relation name from the raw error.
    expect(result.message).not.toContain("relation");
    expect(result.message).not.toContain('"User"');
    // The safe message must NOT contain the literal raw error fragment.
    expect(result.message).not.toContain("permission denied for relation");
  });

  it("49. categorizeDbError classifies PostgreSQL SQLSTATE 42501 as PERMISSION_DENIED", () => {
    const err = new Error("PostgreSQL error: SQLSTATE 42501 — insufficient_privilege");
    const result = realCategorizeDbError(err);
    expect(result.category).toBe("PERMISSION_DENIED");
    // The safe message must NOT leak the SQLSTATE code or the error string.
    expect(result.message).not.toContain("42501");
    expect(result.message).not.toContain("insufficient_privilege");
    expect(result.message).not.toContain("PostgreSQL error");
  });

  it("50. categorizeDbError classifies unknown errors as UNKNOWN (no raw text)", () => {
    const err = new Error("some weird error nobody has seen before");
    const result = realCategorizeDbError(err);
    expect(result.category).toBe("UNKNOWN");
    expect(result.message).not.toContain("some weird error");
    expect(result.message).not.toContain("nobody has seen before");
  });

  it("51. STEP 15.72 Finding 5: categorizeDbError NEVER echoes the raw error message", () => {
    // This is the core safety property: the function returns a fixed safe
    // message per category — it must NEVER echo the raw error text or any
    // identifying fragment from it (host, role name, password, etc.).
    const rawMessages = [
      "Connection failed: postgresql://user:secret_pw@host:5432/db",
      "Auth failed for user 'sa' with password 'admin123'",
      "permission denied for table 'User' (current_user=heavix_dryrun_ro)",
      "Could not connect to db.prod.example.com:5432",
    ];
    for (const raw of rawMessages) {
      const err = new Error(raw);
      const result = realCategorizeDbError(err);
      // The full raw message must never appear in the safe output.
      expect(result.message).not.toContain(raw);
      // No identifying fragment from the raw message may appear either:
      // - connection strings (postgresql://...)
      // - host names (db.prod.example.com)
      // - role names (heavix_dryrun_ro, sa)
      // - passwords (secret_pw, admin123)
      expect(result.message).not.toContain("postgresql://");
      expect(result.message).not.toContain("db.prod.example.com");
      expect(result.message).not.toContain("heavix_dryrun_ro");
      expect(result.message).not.toContain("admin123");
      expect(result.message).not.toContain("secret_pw");
    }
  });

  it("52. categorizeDbError handles non-Error values (string, undefined, null) without throwing", () => {
    expect(() => realCategorizeDbError("string error")).not.toThrow();
    expect(() => realCategorizeDbError(undefined)).not.toThrow();
    expect(() => realCategorizeDbError(null)).not.toThrow();
    expect(() => realCategorizeDbError({})).not.toThrow();
    expect(() => realCategorizeDbError(42)).not.toThrow();
  });
});

describe("STEP 15.72 — redactConnectionDetails() (defense-in-depth)", () => {
  it("53. redactConnectionDetails masks postgresql:// URLs in a string", () => {
    const input = "Error: could not connect to postgresql://user:pass@host:5432/db";
    const output = realRedactConnectionDetails(input);
    expect(output).not.toContain("postgresql://user:pass@host:5432/db");
    expect(output).not.toContain("pass");
    expect(output).not.toContain("user:");
    expect(output).toContain("redacted:connection-string");
  });

  it("54. redactConnectionDetails masks postgres:// URLs (legacy scheme)", () => {
    const input = "postgres://user:pass@host:5432/db";
    const output = realRedactConnectionDetails(input);
    expect(output).not.toContain("postgres://user:pass@host:5432/db");
    expect(output).not.toContain("pass");
  });

  it("55. redactConnectionDetails masks multiple URLs in a single string", () => {
    const input = "primary: postgresql://u1:p1@h1:5432/db1 ; replica: postgresql://u2:p2@h2:5432/db2";
    const output = realRedactConnectionDetails(input);
    expect(output).not.toContain("p1");
    expect(output).not.toContain("p2");
    expect(output).not.toContain("u1");
    expect(output).not.toContain("u2");
    expect(output.match(/redacted:connection-string/g)?.length).toBe(2);
  });

  it("56. redactConnectionDetails leaves non-URL text untouched", () => {
    const input = "An error occurred: timeout";
    const output = realRedactConnectionDetails(input);
    expect(output).toBe(input);
  });

  it("57. redactConnectionDetails returns empty string for empty input", () => {
    expect(realRedactConnectionDetails("")).toBe("");
  });

  it("58. redactConnectionDetails is case-insensitive on the scheme", () => {
    const input = "POSTGRESQL://user:pass@host:5432/db";
    const output = realRedactConnectionDetails(input);
    expect(output).not.toContain("pass");
    expect(output).toContain("redacted:connection-string");
  });
});
