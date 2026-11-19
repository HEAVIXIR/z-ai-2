import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) =>
  readFileSync(path.join(process.cwd(), file), "utf8");

/**
 * WANTED journey CONTRACT test (NOT a behavioral E2E test).
 *
 * This is a SOURCE-CONTRACT test (string assertions on source files), NOT
 * an end-to-end behavioral test. It pins the wiring of the full
 * create→moderate→publish→visible→matchable flow, but it does NOT execute
 * the flow against a real database. A true behavioral E2E test (create →
 * DB row → admin approve → public feed → matching) requires a live
 * database and is BLOCKED by Issue #346 (preview-database gate).
 *
 * What this contract verifies (source wiring):
 * 1. Wizard sends intent + quantity + budget + deadline to /api/wanted.
 * 2. POST /api/wanted: CSRF + rate-limit + bounded-body + intent-required.
 * 3. createWanted: PENDING + publishedAt=null (NOT immediately public).
 * 4. Admin approve via publishWanted (CAS + state machine).
 * 5. Public feed filters ACTIVE+published+unexpired (PENDING hidden).
 * 6. Matching eligibility rejects non-ACTIVE/non-published/expired.
 *
 * What this contract does NOT verify (requires a real DB):
 * - That the row is actually created in the BuyRequest table.
 * - That publishWanted's CAS updateMany actually transitions the row.
 * - That the public feed actually returns the published row.
 * - That matching actually surfaces compatible supply listings.
 *
 * These behavioral assertions are tracked as a BLOCKED acceptance
 * criterion pending the #346 database gate.
 */
describe("WANTED journey source-contract (NOT behavioral E2E)", () => {
  it("wizard sends WANTED to /api/wanted with intent + quantity + budget + deadline", () => {
    const page = read("src/app/listings/new/page.tsx");
    expect(page).toContain('const isDemandSubmission = transactionType === "WANTED" || transactionType === "SERVICE_REQUEST"');
    expect(page).toContain('const endpoint = isDemandSubmission ? "/api/wanted" : "/api/listings"');
    expect(page).toContain('body.intent = transactionType === "SERVICE_REQUEST" ? "SERVICE_REQUEST" : wanted.intent');
    expect(page).toContain("body.quantity = Number(wanted.quantity)");
    expect(page).toContain("body.budgetMin = wanted.budgetMin");
    expect(page).toContain("sellerName: form.sellerName || undefined");
    expect(page).toContain("sellerPhone: form.sellerPhone || undefined");
    expect(page).toContain("body.deadline =");
  });

  it("WANTED wizard labels exact-price input as an alternative to a budget range and blocks conflicting values", () => {
    const page = read("src/app/listings/new/page.tsx");
    expect(page).toContain("قیمت پیشنهادی دقیق (اختیاری؛ به‌جای بازه بودجه)");
    expect(page).toContain("const exactPriceConflictsWithRange = hasExactPrice && (min !== null || max !== null)");
    expect(page).toContain("const exactPriceConflictsWithRange = hasExactPrice && (wmin !== null || wmax !== null)");
    expect(page).toContain("!exactPriceConflictsWithRange");
    expect(page).toContain("{!isRequestFlow && (");
  });

  it("POST /api/wanted preserves contact details, requires category, and persists a suggested price as an exact budget", () => {
    const route = read("src/app/api/wanted/route.ts");
    expect(route).toContain("requesterName: normalizedRequesterName || null");
    expect(route).toContain("requesterPhone: normalizedRequesterPhone || null");
    expect(route).toContain("if (!requestedCategoryId)");
    expect(route).toContain("const effectiveBudgetMin = hasSuggestedPrice ? price : budgetMin");
    expect(route).toContain("const effectiveBudgetMax = hasSuggestedPrice ? price : budgetMax");
    expect(route).toContain("هر دو هم‌زمان مجاز نیستند");
  });

  it("POST /api/wanted enforces CSRF + rate-limit + bounded-body + intent-required (P0-A)", () => {
    const route = read("src/app/api/wanted/route.ts");
    // CSRF before body parse.
    expect(route).toContain("if (!checkCsrf(req))");
    // Rate limit (user-scoped).
    expect(route).toContain("rateLimit({");
    expect(route).toContain("WANTED_CREATE.label");
    // Bounded body read.
    expect(route).toContain("readBoundedJson");
    expect(route).toContain("MAX_WANTED_REQUEST_BODY_BYTES");
    // Intent required.
    expect(route).toContain("نوع تقاضا (intent) الزامی است");
  });

  it("createWanted creates PENDING + publishedAt=null (not immediately public)", () => {
    const service = read("src/lib/wanted-service.ts");
    expect(service).toContain("status: STATUS_PENDING");
    expect(service).toContain("const publishedAt: Date | null = null");
  });

  it("publishWanted uses compare-and-set (CAS) — updateMany with status condition (P0-C)", () => {
    const service = read("src/lib/wanted-service.ts");
    expect(service).toContain("db.buyRequest.updateMany({");
    expect(service).toContain("status: before.status,");
    expect(service).toContain("OR: [{ expiresAt: null }, { expiresAt: { gt: now } }]");
    // On CAS-count=0, re-read + respond (never overwrite terminal state).
    expect(service).toContain("casResult.count === 0");
  });

  it("admin single-row close/fulfill go through the canonical service (P0-D)", () => {
    const route = read("src/app/api/admin/requests/[id]/route.ts");
    expect(route).toContain("closeWantedByAdmin(id, sessionUser.id)");
    expect(route).toContain("fulfillWanted(id, sessionUser.id)");
    // status must NOT be in the generic PATCH allowed list.
    const allowedSection = route.split("const allowed = [")[1]?.split("]")[0] ?? "";
    expect(allowedSection).not.toContain('"status"');
  });

  it("admin bulk approve/close/fulfill all route through bulkTransitionWanted (P0-B/D)", () => {
    const route = read("src/app/api/admin/requests/route.ts");
    expect(route).toContain("bulkTransitionWanted(");
    // CSRF on bulk POST.
    expect(route).toContain("if (!checkCsrf(req))");
  });

  it("public wanted feed filters ACTIVE + published + unexpired (PENDING hidden)", () => {
    const service = read("src/lib/wanted-service.ts");
    const listSection = service.split("// ── listWanted ──")[1]?.split("// ── getWanted ──")[0] ?? "";
    expect(listSection).toContain("where.publishedAt = { lte: now }");
    expect(listSection).toContain("{ expiresAt: null }");
    expect(listSection).toContain("{ expiresAt: { gt: now } }");
  });

  it("public detail rejects non-ACTIVE / unpublished / expired (PENDING → 404)", () => {
    const route = read("src/app/api/wanted/[id]/route.ts");
    expect(route).toContain('request.status !== "ACTIVE"');
    expect(route).toContain("request.publishedAt.getTime() > now");
    expect(route).toContain("request.expiresAt.getTime() <= now");
    expect(route).toContain("{ status: 404 }");
  });

  it("matching eligibility rejects PENDING / non-published / expired", () => {
    const eligibility = read("src/lib/wanted-eligibility.ts");
    expect(eligibility).toContain('status !== "ACTIVE"');
    expect(eligibility).toContain("publishedAt.getTime() > now.getTime()");
    expect(eligibility).toContain("expiresAt.getTime() <= now.getTime()");
  });

  it("state machine is a single canonical transition matrix (P0-D)", () => {
    const service = read("src/lib/wanted-service.ts");
    expect(service).toContain("ALLOWED_TRANSITIONS");
    expect(service).toContain("resolveTransitionTarget");
    // Terminal states have no outbound transitions.
    expect(service).toContain("CLOSED: {}");
    expect(service).toContain("FULFILLED: {}");
  });

  it("owner can see their own PENDING requests via ?mine=true", () => {
    const route = read("src/app/api/wanted/route.ts");
    expect(route).toContain("?mine=true");
    // ?mine=true has no status filter (returns all of the user's rows).
    expect(route).toContain("where: { userId }");
  });

  it("admin /admin/requests page exposes the PENDING review queue + approve button", () => {
    const page = read("src/app/admin/requests/page.tsx");
    expect(page).toContain("PENDING");
    expect(page).toContain("Rocket");
    expect(page).toContain('action(r.id, "approve")');
    // Dashboard stats include pending.
    expect(page).toContain("stats.pending");
  });
});
