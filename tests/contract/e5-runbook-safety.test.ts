import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/* ============================================================
   HEAVIX — STEP 15.15-A: E5 Runbook Safety Regression Test
   ------------------------------------------------------------
   Purpose: statically detect the two defects the owner found
   in STEP 15.15:

   E5-F01: `prisma db push --accept-data-loss` appeared BEFORE
           `DATABASE_URL` was pinned to the scratch DB. This
           could connect to a pre-existing DATABASE_URL pointing
           at production.

   E5-F02: raw connection strings (`MAINTENANCE_DB_URL`,
           `SCRATCH_DB_URL`) were `echo`-d to stdout, which
           could leak credentials into logs or reports.

   These tests parse the E5 runbook (embedded in the combined
   report markdown) and assert the unsafe patterns are absent
   and the safe patterns are present.

   This is a static contract test — no database required.
   ============================================================ */

const REPORT_PATH =
  "docs/verification/STEP-14.99-COMBINED-REPORT.md";

function readRunbook(): string {
  return readFileSync(REPORT_PATH, "utf-8");
}

describe("E5 Runbook — E5-F01: db push must not run before DATABASE_URL is pinned", () => {
  const runbook = readRunbook();

  it("does NOT contain a `prisma db push` line BEFORE the `export DATABASE_URL` line", () => {
    // Find the §B.2.2 section
    const sectionStart = runbook.indexOf("### B.2.2");
    expect(sectionStart).toBeGreaterThan(-1);
    const sectionEnd = runbook.indexOf("### B.2.3");
    expect(sectionEnd).toBeGreaterThan(sectionStart);
    const section = runbook.slice(sectionStart, sectionEnd);

    const pinLineIdx = section.indexOf('export DATABASE_URL="$SCRATCH_DB_URL"');
    expect(pinLineIdx).toBeGreaterThan(-1);

    const pushLineIdx = section.indexOf(
      "bunx prisma db push --accept-data-loss",
    );

    // If a db push line exists, it MUST come AFTER the pin line.
    if (pushLineIdx !== -1) {
      expect(pushLineIdx).toBeGreaterThan(pinLineIdx);
    }

    // The runbook must NOT contain the old comment that justified the
    // duplicate db push before pinning.
    expect(section).not.toContain(
      "NOTE: this uses DATABASE_URL env var — MUST be set to SCRATCH_DB_URL",
    );
  });

  it("validates the effective database target BEFORE any Prisma command", () => {
    const sectionStart = runbook.indexOf("### B.2.2");
    const sectionEnd = runbook.indexOf("### B.2.3");
    const section = runbook.slice(sectionStart, sectionEnd);

    // The E5-F01 guard must be present: server-side validation of current_database()
    expect(section).toContain("EFFECTIVE_DB");
    expect(section).toContain("SELECT current_database();");
    expect(section).toContain("FATAL: effective database is");

    // The validation must occur BEFORE the (single) prisma db push
    const validateIdx = section.indexOf("EFFECTIVE_DB");
    const pushIdx = section.indexOf("bunx prisma db push --accept-data-loss");
    expect(validateIdx).toBeGreaterThan(-1);
    expect(pushIdx).toBeGreaterThan(validateIdx);
  });

  it("contains only ONE `prisma db push` invocation (not the prior duplicate)", () => {
    const sectionStart = runbook.indexOf("### B.2.2");
    const sectionEnd = runbook.indexOf("### B.2.3");
    const section = runbook.slice(sectionStart, sectionEnd);

    const matches = section.match(
      /bunx prisma db push --accept-data-loss/g,
    );
    expect(matches).toHaveLength(1);
  });
});

describe("E5 Runbook — E5-F02: raw connection strings must not be echoed", () => {
  const runbook = readRunbook();

  it("does NOT echo MAINTENANCE_DB_URL to stdout", () => {
    // The old pattern: `echo "Maintenance DB: $MAINTENANCE_DB_URL"`
    expect(runbook).not.toMatch(
      /echo\s+"[^"]*\$MAINTENANCE_DB_URL"/,
    );
  });

  it("does NOT echo SCRATCH_DB_URL to stdout", () => {
    // The old pattern: `echo "Scratch DB URL: $SCRATCH_DB_URL"`
    expect(runbook).not.toMatch(/echo\s+"[^"]*\$SCRATCH_DB_URL"/);
  });

  it("does NOT echo E5_BASE_URL or E5_MAINTENANCE_DB_URL to stdout", () => {
    // Never print the raw env vars containing credentials
    expect(runbook).not.toMatch(/echo\s+"[^"]*\$E5_BASE_URL"/);
    expect(runbook).not.toMatch(
      /echo\s+"[^"]*\$E5_MAINTENANCE_DB_URL"/,
    );
  });

  it("uses redacted display (resolved host + DB name, not raw URL)", () => {
    // The new pattern: resolve host/DB via psql, print only those
    expect(runbook).toContain("MAINT_RESOLVED_HOST");
    expect(runbook).toContain("MAINT_RESOLVED_DB");
    expect(runbook).toContain("REDACTED");
  });

  it("the redacted display section does NOT contain raw URL variables", () => {
    // Extract the echo block and verify no raw URL interpolation
    const echoStart = runbook.indexOf(
      "=== E5 Rehearsal Configuration (REDACTED",
    );
    expect(echoStart).toBeGreaterThan(-1);
    const echoBlock = runbook.slice(echoStart, echoStart + 400);
    expect(echoBlock).not.toContain("$MAINTENANCE_DB_URL");
    expect(echoBlock).not.toContain("$SCRATCH_DB_URL");
    expect(echoBlock).not.toContain("$E5_BASE_URL");
  });
});

describe("E5 Runbook — preserves fail-fast and scratch confirmation", () => {
  const runbook = readRunbook();

  it("retains `set -euo pipefail`", () => {
    expect(runbook).toContain("set -euo pipefail");
  });

  it("retains the I-CONFIRM-SCRATCH interactive guard", () => {
    expect(runbook).toContain("I-CONFIRM-SCRATCH");
  });

  it("retains the production-like URL refusal guard", () => {
    expect(runbook).toContain("prod|staging|live|main");
    expect(runbook).toContain("FATAL: scratch DB name looks production-like");
  });
});
