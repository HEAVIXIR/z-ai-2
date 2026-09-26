/**
 * HEAVIX — Phase 5: Trust & Verification Contract Tests
 * ------------------------------------------------------------
 * Verifies the Phase 5 Trust & Verification deep system meets the
 * Definition-of-Done chain using file-content assertions (same
 * pattern as Phase T9 analytics/observability contract tests +
 * Phase C1 navigation contract tests + Phase T4 page builder
 * lifecycle tests).
 *
 * No DB dependency — these are pure structural/contract assertions.
 *
 * Scope:
 *   1. Trust service — src/lib/trust-service.ts exists and exports
 *      the five canonical functions: submitVerification,
 *      reviewVerification, revokeVerification, getTrustProfile,
 *      checkVerificationExpiry, getVerificationHistory.
 *   2. Audit action keys — `trust.verification.{submit,review,
 *      revoke,expired}` appear in the service file.
 *   3. Admin verification routes — review / revoke / check-expiry
 *      POST handlers exist and gate on company.verify.
 *   4. Public trust API — src/app/api/trust/[entityType]/[entityId]
 *      /route.ts exists and exports a GET handler (no auth).
 *   5. Admin verification list page — adds the Phase 5 UI additions:
 *      "Check Expiry" button, "Review" action, "Revoke" action,
 *      expiry indicator (amber badge if expiresAt < 7 days).
 *   6. Admin verification detail page — exists at
 *      src/app/admin/verifications/[id]/page.tsx, gates on
 *      company.verify, calls logAudit for trust.verification.
 *      detail_view, shows review form + evidence viewer +
 *      verification history + revoke button.
 */

import { describe, it, expect } from "vitest";
import fs from "fs";

// ── File paths ──────────────────────────────────────────────
const TRUST_SERVICE = "src/lib/trust-service.ts";
const REVIEW_ROUTE = "src/app/api/admin/verifications/[id]/review/route.ts";
const REVOKE_ROUTE = "src/app/api/admin/verifications/[id]/revoke/route.ts";
const CHECK_EXPIRY_ROUTE =
  "src/app/api/admin/verifications/check-expiry/route.ts";
const PUBLIC_TRUST_ROUTE =
  "src/app/api/trust/[entityType]/[entityId]/route.ts";
const ADMIN_LIST_PAGE = "src/app/admin/verifications/page.tsx";
const ADMIN_DETAIL_PAGE = "src/app/admin/verifications/[id]/page.tsx";

function read(p: string): string {
  return fs.readFileSync(p, "utf8");
}

function assertFileExists(p: string) {
  if (!fs.existsSync(p)) {
    throw new Error(`Expected file not found: ${p}`);
  }
}

// ══════════════════════════════════════════════════════════════
// 1. TRUST SERVICE — src/lib/trust-service.ts
// ══════════════════════════════════════════════════════════════
describe("Phase 5 — Trust & Verification: Service Layer", () => {
  it("trust-service.ts file exists", () => {
    assertFileExists(TRUST_SERVICE);
  });

  it("exports submitVerification function", () => {
    const c = read(TRUST_SERVICE);
    expect(c).toMatch(
      /export async function submitVerification\(/,
    );
  });

  it("exports reviewVerification function", () => {
    const c = read(TRUST_SERVICE);
    expect(c).toMatch(
      /export async function reviewVerification\(/,
    );
  });

  it("exports revokeVerification function", () => {
    const c = read(TRUST_SERVICE);
    expect(c).toMatch(
      /export async function revokeVerification\(/,
    );
  });

  it("exports getTrustProfile function", () => {
    const c = read(TRUST_SERVICE);
    expect(c).toMatch(
      /export async function getTrustProfile\(/,
    );
  });

  it("exports checkVerificationExpiry function", () => {
    const c = read(TRUST_SERVICE);
    expect(c).toMatch(
      /export async function checkVerificationExpiry\(/,
    );
  });

  it("exports getVerificationHistory function", () => {
    const c = read(TRUST_SERVICE);
    expect(c).toMatch(
      /export async function getVerificationHistory\(/,
    );
  });

  it("imports db from @/lib/db (main PostgreSQL)", () => {
    const c = read(TRUST_SERVICE);
    expect(c).toMatch(/import.*\{[^}]*db[^}]*\}.*from ['"]@\/lib\/db['"]/);
  });

  it("imports logAudit from @/lib/audit", () => {
    const c = read(TRUST_SERVICE);
    expect(c).toMatch(/import.*logAudit.*from ['"]@\/lib\/audit['"]/);
  });
});

// ══════════════════════════════════════════════════════════════
// 2. AUDIT ACTION KEYS — trust.verification.{submit,review,revoke,expired}
// ══════════════════════════════════════════════════════════════
describe("Phase 5 — Trust & Verification: Audit Action Keys", () => {
  it("service emits trust.verification.submit on submit", () => {
    const c = read(TRUST_SERVICE);
    expect(c).toMatch(/['"]trust\.verification\.submit['"]/);
  });

  it("service emits trust.verification.review on review", () => {
    const c = read(TRUST_SERVICE);
    expect(c).toMatch(/['"]trust\.verification\.review['"]/);
  });

  it("service emits trust.verification.revoke on revoke", () => {
    const c = read(TRUST_SERVICE);
    expect(c).toMatch(/['"]trust\.verification\.revoke['"]/);
  });

  it("service emits trust.verification.expired on expiry sweep", () => {
    const c = read(TRUST_SERVICE);
    expect(c).toMatch(/['"]trust\.verification\.expired['"]/);
  });

  it("service uses entityType: CompanyVerification in audits", () => {
    const c = read(TRUST_SERVICE);
    expect(c).toMatch(/entityType:\s*['"]CompanyVerification['"]/);
  });
});

// ══════════════════════════════════════════════════════════════
// 3. ADMIN VERIFICATION ROUTES — review / revoke / check-expiry
// ══════════════════════════════════════════════════════════════
describe("Phase 5 — Trust & Verification: Admin API Routes", () => {
  it("review route file exists at /api/admin/verifications/[id]/review/route.ts", () => {
    assertFileExists(REVIEW_ROUTE);
  });

  it("review route exports POST handler", () => {
    const c = read(REVIEW_ROUTE);
    expect(c).toMatch(/export async function POST\(/);
  });

  it("review route imports reviewVerification from trust-service", () => {
    const c = read(REVIEW_ROUTE);
    // Allow multi-line imports (the route imports several names from
    // trust-service on separate lines).
    expect(c).toMatch(/import[\s\S]*reviewVerification[\s\S]*from\s*['"]@\/lib\/trust-service['"]/);
  });

  it("review route gates on company.verify permission", () => {
    const c = read(REVIEW_ROUTE);
    expect(c).toMatch(/requirePermission\([^,]*,\s*['"]company\.verify['"]/);
  });

  it("revoke route file exists at /api/admin/verifications/[id]/revoke/route.ts", () => {
    assertFileExists(REVOKE_ROUTE);
  });

  it("revoke route exports POST handler", () => {
    const c = read(REVOKE_ROUTE);
    expect(c).toMatch(/export async function POST\(/);
  });

  it("revoke route imports revokeVerification from trust-service", () => {
    const c = read(REVOKE_ROUTE);
    // Allow multi-line imports.
    expect(c).toMatch(/import[\s\S]*revokeVerification[\s\S]*from\s*['"]@\/lib\/trust-service['"]/);
  });

  it("revoke route gates on company.verify permission", () => {
    const c = read(REVOKE_ROUTE);
    expect(c).toMatch(/requirePermission\([^,]*,\s*['"]company\.verify['"]/);
  });

  it("check-expiry route file exists", () => {
    assertFileExists(CHECK_EXPIRY_ROUTE);
  });

  it("check-expiry route exports POST handler", () => {
    const c = read(CHECK_EXPIRY_ROUTE);
    expect(c).toMatch(/export async function POST\(/);
  });

  it("check-expiry route imports checkVerificationExpiry from trust-service", () => {
    const c = read(CHECK_EXPIRY_ROUTE);
    // Allow multi-line imports.
    expect(c).toMatch(/import[\s\S]*checkVerificationExpiry[\s\S]*from\s*['"]@\/lib\/trust-service['"]/);
  });

  it("check-expiry route gates on company.verify permission", () => {
    const c = read(CHECK_EXPIRY_ROUTE);
    expect(c).toMatch(/requirePermission\([^,]*,\s*['"]company\.verify['"]/);
  });
});

// ══════════════════════════════════════════════════════════════
// 4. PUBLIC TRUST API — /api/trust/[entityType]/[entityId]
// ══════════════════════════════════════════════════════════════
describe("Phase 5 — Trust & Verification: Public Trust API", () => {
  it("public trust route file exists", () => {
    assertFileExists(PUBLIC_TRUST_ROUTE);
  });

  it("public trust route exports GET handler", () => {
    const c = read(PUBLIC_TRUST_ROUTE);
    expect(c).toMatch(/export async function GET\(/);
  });

  it("public trust route imports getTrustProfile from trust-service", () => {
    const c = read(PUBLIC_TRUST_ROUTE);
    // Allow multi-line imports.
    expect(c).toMatch(/import[\s\S]*getTrustProfile[\s\S]*from\s*['"]@\/lib\/trust-service['"]/);
  });

  it("public trust route does NOT require auth (no requirePermission call)", () => {
    const c = read(PUBLIC_TRUST_ROUTE);
    // Public endpoint must NOT gate on any permission.
    expect(c).not.toMatch(/requirePermission\(/);
  });

  it("public trust route does NOT expose evidence URLs", () => {
    const c = read(PUBLIC_TRUST_ROUTE);
    // The public response shape must not include evidence.
    expect(c).not.toMatch(/evidence:/);
  });

  it("public trust route does NOT expose reviewNotes / rejectionReason", () => {
    const c = read(PUBLIC_TRUST_ROUTE);
    expect(c).not.toMatch(/reviewNotes:/);
    expect(c).not.toMatch(/rejectionReason:/);
    expect(c).not.toMatch(/revokeReason:/);
  });

  it("public trust route returns verifiedBy as a NAME (resolves User record)", () => {
    const c = read(PUBLIC_TRUST_ROUTE);
    expect(c).toMatch(/db\.user\.findUnique/);
  });
});

// ══════════════════════════════════════════════════════════════
// 5. ADMIN VERIFICATION LIST PAGE — Phase 5 UI additions
// ══════════════════════════════════════════════════════════════
describe("Phase 5 — Trust & Verification: Admin List Page UI", () => {
  it("admin list page file exists", () => {
    assertFileExists(ADMIN_LIST_PAGE);
  });

  it("admin list page links to detail page (/admin/verifications/[id])", () => {
    const c = read(ADMIN_LIST_PAGE);
    expect(c).toMatch(/href=\{`\/admin\/verifications\/\$\{v\.id\}`\}/);
  });

  it("admin list page renders a Review action button", () => {
    const c = read(ADMIN_LIST_PAGE);
    expect(c).toMatch(/برسی|FileSearch|بررسی/);
  });

  it("admin list page renders a Revoke action for VERIFIED items", () => {
    const c = read(ADMIN_LIST_PAGE);
    expect(c).toMatch(/v\.status\s*===\s*['"]VERIFIED['"]/);
    expect(c).toMatch(/RotateCcw|ابطال/);
  });

  it("admin list page adds an expiry indicator (amber badge if expiresAt < 7 days)", () => {
    const c = read(ADMIN_LIST_PAGE);
    expect(c).toMatch(/7\s*\*\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/);
    expect(c).toMatch(/bg-amber-100|text-amber-700/);
  });

  it("admin list page has a Check Expiry button at top", () => {
    const c = read(ADMIN_LIST_PAGE);
    expect(c).toMatch(/\/api\/admin\/verifications\/check-expiry/);
    expect(c).toMatch(/بررسی انقضا|Clock/);
  });
});

// ══════════════════════════════════════════════════════════════
// 6. ADMIN VERIFICATION DETAIL PAGE — Phase 5 deep view
// ══════════════════════════════════════════════════════════════
describe("Phase 5 — Trust & Verification: Admin Detail Page", () => {
  it("admin detail page file exists at /admin/verifications/[id]/page.tsx", () => {
    assertFileExists(ADMIN_DETAIL_PAGE);
  });

  it("admin detail page is a server component (no use client directive)", () => {
    const c = read(ADMIN_DETAIL_PAGE);
    const firstLine = c.split("\n")[0];
    expect(firstLine).not.toMatch(/^['"]use client['"]/);
  });

  it("admin detail page declares force-dynamic export", () => {
    const c = read(ADMIN_DETAIL_PAGE);
    expect(c).toMatch(/export const dynamic\s*=\s*['"]force-dynamic['"]/);
  });

  it("admin detail page imports getCurrentUser from @/lib/auth", () => {
    const c = read(ADMIN_DETAIL_PAGE);
    expect(c).toMatch(/import.*getCurrentUser.*from ['"]@\/lib\/auth['"]/);
  });

  it("admin detail page imports requirePermission from @/lib/authorization", () => {
    const c = read(ADMIN_DETAIL_PAGE);
    expect(c).toMatch(
      /import.*requirePermission.*from ['"]@\/lib\/authorization['"]/,
    );
  });

  it("admin detail page gates on company.verify permission", () => {
    const c = read(ADMIN_DETAIL_PAGE);
    expect(c).toMatch(/requirePermission\([^,]*,\s*['"]company\.verify['"]/);
  });

  it("admin detail page calls logAudit with trust.verification.detail_view action", () => {
    const c = read(ADMIN_DETAIL_PAGE);
    expect(c).toMatch(/import.*logAudit.*from ['"]@\/lib\/audit['"]/);
    expect(c).toMatch(/action:\s*['"]trust\.verification\.detail_view['"]/);
    expect(c).toMatch(/entityType:\s*['"]CompanyVerification['"]/);
  });

  it("admin detail page renders a review form posting to .../review", () => {
    const c = read(ADMIN_DETAIL_PAGE);
    expect(c).toMatch(
      /action=\{`\/api\/admin\/verifications\/\$\{verification\.id\}\/review`/,
    );
  });

  it("admin detail page renders a revoke button posting to .../revoke", () => {
    const c = read(ADMIN_DETAIL_PAGE);
    expect(c).toMatch(
      /action=\{`\/api\/admin\/verifications\/\$\{verification\.id\}\/revoke`/,
    );
  });

  it("admin detail page renders an evidence viewer (parses JSON evidence)", () => {
    const c = read(ADMIN_DETAIL_PAGE);
    expect(c).toMatch(/JSON\.parse\(verification\.evidence\)/);
  });

  it("admin detail page renders verification history section", () => {
    const c = read(ADMIN_DETAIL_PAGE);
    expect(c).toMatch(
      /db\.companyVerification\.findMany\(\s*{\s*where:\s*{\s*companyId:/s,
    );
    expect(c).toMatch(/تاریخچه|History/);
  });
});
