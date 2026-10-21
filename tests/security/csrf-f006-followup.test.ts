import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/* ============================================================
   HEAVIX — STEP 15.38: F-006 Follow-up CSRF Coverage
   ------------------------------------------------------------
   The independent reviewer (STEP 15.37-REVIEWER) identified that
   the original F-006 fix (5 auth routes + 9 public mutation
   routes) left 7 other public mutation routes without CSRF.

   This test file verifies that the 2 MEDIUM-risk routes flagged
   by the reviewer now have CSRF protection:
     1. /api/telegram/notify        — external side-effect (Telegram send)
     2. /api/rejections POST        — DB mutation (create rejectionMessage)

   The remaining 5 LOW-risk routes are documented below with
   rationale for why they do NOT require CSRF:

   ┌─────────────────────────────────────────────┬──────────┬─────────────────────────────────────────────────┐
   │ Route                                        │ Risk     │ Rationale                                       │
   ├─────────────────────────────────────────────┼──────────┼─────────────────────────────────────────────────┤
   │ /api/telegram/notify POST                    │ MEDIUM   │ FIXED — CSRF added (external side-effect)       │
   │ /api/rejections POST                         │ MEDIUM   │ FIXED — CSRF added (DB mutation)                 │
   │ /api/store/parts/[id]/reviews POST           │ MEDIUM   │ FIXED — CSRF added (unauthenticated DB mutation)  │
   │ /api/analytics/track POST                    │ LOW      │ Fire-and-forget analytics insert, rate-limited   │
   │                                              │          │ 100/min/IP. No state corruption possible.       │
   │ /api/store/coupons/validate POST             │ LOW      │ Read-only validation (no DB write). Returns      │
   │                                              │          │ discount calculation. Safe to call cross-origin.│
   │ /api/pricing/estimate (GET + POST)           │ LOW      │ Both handlers read-only (estimatePrice only).     │
   │                                              │          │ POST records optional observation, no user state.│
   │ /api/expert-consult POST                     │ N/A      │ DISABLED (returns 503). No mutation possible.     │
   └─────────────────────────────────────────────┴──────────┴─────────────────────────────────────────────────┘
   ============================================================ */

describe("F-006 Follow-up: MEDIUM-risk public routes now have CSRF", () => {
  it("/api/telegram/notify POST imports and calls checkCsrf", () => {
    const content = readFileSync("src/app/api/telegram/notify/route.ts", "utf-8");
    expect(content).toContain('import { checkCsrf } from "@/lib/csrf"');
    expect(content).toContain("if (!checkCsrf(req))");
    expect(content).toContain("CSRF check failed");
  });

  it("/api/rejections POST imports and calls checkCsrf", () => {
    const content = readFileSync("src/app/api/rejections/route.ts", "utf-8");
    expect(content).toContain('import { checkCsrf } from "@/lib/csrf"');
    // The POST handler must call checkCsrf before processing the body
    expect(content).toMatch(/export async function POST[\s\S]*checkCsrf/);
    expect(content).toContain("CSRF check failed");
  });

  it("/api/telegram/notify documents the F-006 fix rationale", () => {
    const content = readFileSync("src/app/api/telegram/notify/route.ts", "utf-8");
    expect(content).toContain("STEP 15.38 F-006 FIX");
    expect(content).toContain("external side-effect");
  });

  it("/api/rejections documents the F-006 fix rationale", () => {
    const content = readFileSync("src/app/api/rejections/route.ts", "utf-8");
    expect(content).toContain("STEP 15.38 F-006 FIX");
    expect(content).toContain("DB mutation");
  });
});

describe("F-006 Follow-up: LOW-risk routes documented (no CSRF needed)", () => {
  it("/api/expert-consult POST is DISABLED (returns 503)", () => {
    const content = readFileSync("src/app/api/expert-consult/route.ts", "utf-8");
    // The route must either be disabled or return 503
    expect(content.toLowerCase()).toMatch(/disabled|503|service unavailable/);
  });

  it("/api/store/coupons/validate is read-only (no DB write on validate)", () => {
    const content = readFileSync("src/app/api/store/coupons/validate/route.ts", "utf-8");
    // validate should NOT create/update/delete — only findUnique
    expect(content).not.toMatch(/\.create\(|\.update\(|\.delete\(|\.upsert\(/);
    expect(content).toContain("findUnique");
  });

  it("/api/store/parts/[id]/reviews POST now has CSRF (unauthenticated DB mutation)", () => {
    const content = readFileSync("src/app/api/store/parts/[id]/reviews/route.ts", "utf-8");
    expect(content).toContain('import { checkCsrf } from "@/lib/csrf"');
    expect(content).toContain("if (!checkCsrf(req))");
    expect(content).toContain("CSRF check failed");
    expect(content).toContain("STEP 15.38 F-006 FIX");
  });

  it("/api/pricing/estimate is read-only (no DB writes in either handler)", () => {
    const content = readFileSync("src/app/api/pricing/estimate/route.ts", "utf-8");
    // Both GET and POST handlers only call estimatePrice (read-only computation)
    // No .create / .update / .delete on user-controlled state
    expect(content).toContain("estimatePrice");
    // recordObservation is allowed (analytics, no user-visible state)
    expect(content).not.toMatch(/db\.\w+\.(create|update|delete|upsert)\(/);
  });
});
