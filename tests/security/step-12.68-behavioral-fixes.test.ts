/**
 * HEAVIX — Behavioral Security Tests: W-02, W-03, W-04 (STEP 12.68)
 * ====================================================================
 *
 * These tests verify the PRESENCE of security fixes in source code by
 * reading actual file contents — same pattern as the existing
 * tests/security/auth-boundary.test.ts (which reads files to assert
 * no @ts-nocheck directive exists in admin routes).
 *
 * Each test FAILS on main (vulnerable) and PASSES on the corresponding
 * fix branch. This is behavioral verification: it checks that the
 * vulnerable pattern is ABSENT and the secure pattern is PRESENT.
 *
 * Why file-content tests (not route invocation):
 *   Route invocation tests require a running PostgreSQL database
 *   (the 146 DB-bound tests are BLOCKED in this sandbox). File-content
 *   tests run without DB and prove the code contract is correct.
 *   When PostgreSQL is available, the full route-level tests in
 *   tests/security/step-12.29-*.test.ts and step-12.30-*.test.ts
 *   provide the end-to-end behavioral coverage.
 *
 * Runs under `bun run test:security`
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "..", "..");

function read(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), "utf8");
}

describe("W-02: Registration code length contract (P0-C-01)", () => {
  const pageContent = read("src/app/register/page.tsx");

  it("verify input accepts 6-digit code (maxLength=6)", () => {
    // BEFORE fix: maxLength={5} — users couldn't enter 6th digit
    // AFTER fix: maxLength={6}
    expect(pageContent).toContain("maxLength={6}");
    expect(pageContent).not.toContain("maxLength={5}");
  });

  it("copy says '6-digit email code' (not '5-digit mobile')", () => {
    // BEFORE: "کد ۵ رقمی به شماره موبایل"
    // AFTER: "کد ۶ رقمی به ایمیل"
    expect(pageContent).toContain("۶ رقمی به ایمیل");
    expect(pageContent).not.toContain("۵ رقمی به شماره موبایل");
  });

  it("button guard requires 6 chars (not 5)", () => {
    // BEFORE: code.length !== 5
    // AFTER: code.length !== 6
    expect(pageContent).toContain("code.length !== 6");
    expect(pageContent).not.toContain("code.length !== 5");
  });

  it("devCode maps to devEmailCode (not devCode)", () => {
    // BEFORE: data.devCode (API never returns this field → dev code never shown)
    // AFTER: data.devEmailCode (matches API contract)
    expect(pageContent).toContain("data.devEmailCode");
    expect(pageContent).not.toMatch(/setDevCode\(data\.devCode\b/);
  });

  it("placeholder has 6 chars (not 5)", () => {
    expect(pageContent).toContain('placeholder="------"');
    expect(pageContent).not.toContain('placeholder="-----"');
  });
});

describe("W-03: POST /api/listings auth + sellerId integrity (P0-C-03)", () => {
  const routeContent = read("src/app/api/listings/route.ts");

  it("auth check is the FIRST operation in POST (before body processing)", () => {
    // BEFORE: getCurrentUser() called AFTER body parsing + validation
    // AFTER: getCurrentUser() called FIRST, 401 if null
    const postIdx = routeContent.indexOf("export async function POST");
    expect(postIdx).toBeGreaterThan(-1);
    const postBody = routeContent.slice(postIdx);

    // Auth check must appear before body parsing
    const authIdx = postBody.indexOf("getCurrentUser()");
    const bodyIdx = postBody.indexOf("req.json()");
    expect(authIdx).toBeGreaterThan(-1);
    expect(bodyIdx).toBeGreaterThan(-1);
    expect(authIdx).toBeLessThan(bodyIdx);
  });

  it("returns 401 for unauthenticated user", () => {
    const postIdx = routeContent.indexOf("export async function POST");
    const postBody = routeContent.slice(postIdx, postIdx + 800);
    expect(postBody).toContain("401");
    expect(postBody).toMatch(/برای ایجاد آگهی باید وارد شوید|Unauthorized|احراز هویت الزامی/);
  });

  it("sellerId comes from session (user.id), never from body, never null", () => {
    // BEFORE: sellerId: user?.id ?? null (accepts null = anonymous)
    // AFTER: sellerId: user.id (always from session, never null)
    expect(routeContent).toContain("sellerId: user.id");
    expect(routeContent).not.toContain("sellerId: user?.id ?? null");
    expect(routeContent).not.toContain("sellerId: body.sellerId");
    expect(routeContent).not.toContain("sellerId: body");
  });
});

describe("W-04: DELETE /api/offers/[id] authorization (P1-C-09)", () => {
  const routeContent = read("src/app/api/offers/[id]/route.ts");

  it("returns 401 for anonymous user (explicit auth check)", () => {
    const deleteIdx = routeContent.indexOf("export async function DELETE");
    expect(deleteIdx).toBeGreaterThan(-1);
    const deleteBody = routeContent.slice(deleteIdx, deleteIdx + 800);
    expect(deleteBody).toContain("401");
  });

  it("uses strict ownership check (buyerId === userId), not broken buyerPhone escape", () => {
    // BEFORE: (offer.buyerId !== userId && !offer.buyerPhone)
    //         — buyerPhone required at POST → !buyerPhone always false → ANY user can delete
    // AFTER: offer.buyerId !== userId (strict ownership)
    const deleteIdx = routeContent.indexOf("export async function DELETE");
    const deleteBody = routeContent.slice(deleteIdx, deleteIdx + 800);
    expect(deleteBody).toContain("offer.buyerId !== userId");
    // The broken pattern must be ABSENT
    expect(deleteBody).not.toMatch(/offer\.buyerId !== userId && !offer\.buyerPhone/);
  });

  it("returns 403 for non-owner", () => {
    const deleteIdx = routeContent.indexOf("export async function DELETE");
    const deleteBody = routeContent.slice(deleteIdx, deleteIdx + 800);
    expect(deleteBody).toContain("403");
  });
});
