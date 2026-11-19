import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) =>
  readFileSync(path.join(process.cwd(), file), "utf8");

/**
 * PHASE H.2 — Listing-form completion hardening contracts.
 *
 * These are CONTRACT tests (file-content + structural assertions) that lock
 * in the security, validation, idempotency, and moderation-lifecycle
 * changes introduced in PHASE H.2. They run without a database (the
 * behavioral round-trip is gated on the WANTED structured-storage
 * migration, which is blocked on the backup/restore gate — see
 * docs/operations/RFC-WANTED-STRUCTURAL-STORAGE-H2.md).
 *
 * Each block names the directive section it satisfies.
 */
describe("PHASE H.2 — listing-form hardening contracts", () => {
  // ── H.2.3: P1 WANTED SERVICE_REQUEST client-validation ordering ──
  describe("H.2.3: WANTED+SERVICE_REQUEST canProceed no longer short-circuits", () => {
    it("the isServiceFlow branch requires serviceTypeId AND, for WANTED+SERVICE_REQUEST, the quantity/budget/deadline checks", () => {
      const wizard = read("src/app/listings/new/page.tsx");
      // The old buggy line is gone.
      expect(wizard).not.toContain("if (isServiceFlow) return Boolean(serviceTypeId);");
      // The corrected branch is present.
      expect(wizard).toContain("if (isServiceFlow) {");
      expect(wizard).toContain("if (!serviceTypeId) return false;");
      expect(wizard).toContain("if (isWantedServiceRequest) {");
      // The WANTED-specific quantity/budget/deadline checks run inside it.
      const branch = wizard.split("if (isWantedServiceRequest) {")[1]?.split("return true;")[0] ?? "";
      expect(branch).toContain("Number.isInteger(wq)");
      expect(branch).toContain("wq >= 1");
      expect(branch).toContain("wmin <= wmax");
      expect(branch).toContain("wdeadline");
    });
  });

  // ── H.2.4a: CSRF on /api/wanted/[id] PATCH/DELETE ──
  describe("H.2.4a: /api/wanted/[id] PATCH/DELETE is CSRF-protected", () => {
    it("imports checkCsrf and calls it before processing the PATCH body", () => {
      const route = read("src/app/api/wanted/[id]/route.ts");
      expect(route).toContain('import { checkCsrf } from "@/lib/csrf"');
      expect(route).toContain("if (!checkCsrf(req))");
      expect(route).toContain('"CSRF check failed"');
    });
    it("DELETE delegates to PATCH (so the CSRF gate covers both)", () => {
      const route = read("src/app/api/wanted/[id]/route.ts");
      expect(route).toContain("return PATCH(req, { params });");
    });
  });

  // ── H.2.4b: CSRF + rate-limit + bounded body on legacy /api/requests + /api/rfq ──
  describe("H.2.4b: legacy + RFQ mutation routes hardened", () => {
    it("/api/requests POST applies CSRF + rate-limit + bounded body", () => {
      const route = read("src/app/api/requests/route.ts");
      expect(route).toContain('import { checkCsrf }');
      expect(route).toContain('import { readBoundedJson }');
      expect(route).toContain("REQUEST_CREATE");
      expect(route).toContain("MAX_REQUESTS_BODY_BYTES");
      expect(route).toContain("if (!checkCsrf(req))");
    });
    it("/api/rfq POST applies CSRF + rate-limit + bounded body", () => {
      const route = read("src/app/api/rfq/route.ts");
      expect(route).toContain('import { checkCsrf }');
      expect(route).toContain("RFQ_CREATE");
      expect(route).toContain("MAX_RFQ_BODY_BYTES");
      expect(route).toContain("if (!checkCsrf(req))");
    });
    it("/api/rfq/[id]/quotes POST applies CSRF + rate-limit + bounded body", () => {
      const route = read("src/app/api/rfq/[id]/quotes/route.ts");
      expect(route).toContain("QUOTE_SUBMIT");
      expect(route).toContain("MAX_QUOTE_BODY_BYTES");
      expect(route).toContain("if (!checkCsrf(req))");
    });
    it("rate-limit presets exist for the new endpoints", () => {
      const presets = read("src/lib/rate-limit-presets.ts");
      expect(presets).toContain("LISTING_CREATE");
      expect(presets).toContain("REQUEST_CREATE");
      expect(presets).toContain("RFQ_CREATE");
      expect(presets).toContain("QUOTE_SUBMIT");
    });
  });

  // ── H.2.4c: WANTED server-side fail-closed taxonomy ──
  describe("H.2.4c: /api/wanted POST fails closed on invalid taxonomy", () => {
    it("validates categoryId/brandId/modelId/serviceTypeId existence against the live tables", () => {
      const route = read("src/app/api/wanted/route.ts");
      // The fail-closed lookups.
      expect(route).toContain("db.category.findUnique");
      expect(route).toContain("db.brand.findUnique");
      expect(route).toContain("db.productModel.findUnique");
      expect(route).toContain("db.serviceType.findFirst");
      // The rejection messages.
      expect(route).toContain("دسته‌بندی انتخاب‌شده معتبر یا فعال نیست.");
      expect(route).toContain("برند انتخاب‌شده معتبر یا فعال نیست.");
      expect(route).toContain("مدل انتخاب‌شده معتبر یا فعال نیست.");
      expect(route).toContain("نوع خدمت انتخاب‌شده معتبر یا فعال نیست.");
      // Brand/model compatibility is enforced.
      expect(route).toContain("modelRow.brandId !== requestedBrandId");
      expect(route).toContain("متعلق به برند انتخاب‌شده نیست.");
    });
    it("validates attributeValues shape (array, capped at 100, each with attributeId)", () => {
      const route = read("src/app/api/wanted/route.ts");
      expect(route).toContain("Array.isArray(attributeValues)");
      expect(route).toContain("attributeValues.length > 100");
      expect(route).toContain("typeof obj.attributeId !== \"string\"");
    });
  });

  // ── H.2.4d: RENT server validation + AUCTION client checks ──
  describe("H.2.4d: RENT server validation + AUCTION client checks", () => {
    it("/api/listings POST validates RENT rentalPeriod enum + deposit + availability window", () => {
      const route = read("src/app/api/listings/route.ts");
      expect(route).toContain("RENTAL_PERIODS");
      expect(route).toContain("HOURLY");
      expect(route).toContain("دوره اجاره معتبر نیست.");
      expect(route).toContain("dep < 0n");
      expect(route).toContain("مبلغ ودیعه نمی‌تواند منفی باشد.");
      expect(route).toContain("Number.isInteger(minP)");
      expect(route).toContain("e.getTime() <= s.getTime()");
      expect(route).toContain("پایان دسترس‌پذیری باید پس از شروع آن باشد.");
    });
    it("wizard AUCTION canProceed mirrors server checks client-side", () => {
      const wizard = read("src/app/listings/new/page.tsx");
      expect(wizard).toContain("reserve < startPrice");
      expect(wizard).toContain("e.getTime() <= s.getTime()");
    });
  });

  // ── H.2.4e: idempotency ──
  describe("H.2.4e: idempotency on /api/wanted + /api/listings POST", () => {
    it("the idempotency helper exists and is wired into both routes", () => {
      const helper = read("src/lib/idempotency.ts");
      expect(helper).toContain("export function extractIdempotencyKey");
      expect(helper).toContain("export async function findIdempotentResult");
      // Header charset is allowlisted (no log-injection vector).
      expect(helper).toContain("/^[A-Za-z0-9._:-]+$/");
      const wanted = read("src/app/api/wanted/route.ts");
      expect(wanted).toContain("extractIdempotencyKey(req)");
      expect(wanted).toContain('action: "marketplace.wanted.create"');
      expect(wanted).toContain("idempotentReplay: true");
      const listings = read("src/app/api/listings/route.ts");
      expect(listings).toContain("extractIdempotencyKey(req)");
      expect(listings).toContain('action: "marketplace.listing.create"');
      expect(listings).toContain("idempotentReplay: true");
    });
    it("logAudit accepts + writes idempotencyKey (AuditLog.idempotencyKey column)", () => {
      const audit = read("src/lib/admin/audit.ts");
      expect(audit).toContain("idempotencyKey?: string | null;");
      expect(audit).toContain("idempotencyKey: params.idempotencyKey ?? null");
    });
    it("createWanted accepts + forwards idempotencyKey to the audit row", () => {
      const svc = read("src/lib/wanted-service.ts");
      expect(svc).toContain("idempotencyKey?: string | null;");
      expect(svc).toContain("idempotencyKey: idempotencyKey ?? null");
    });
    it("the wizard sends an Idempotency-Key header on submit", () => {
      const wizard = read("src/app/listings/new/page.tsx");
      expect(wizard).toContain('"Idempotency-Key": idempotencyKeyRef.current');
      // Cleared on definitive success so a separate submission gets a fresh key.
      expect(wizard).toContain("idempotencyKeyRef.current = null");
    });
  });

  // ── H.2.4e: listing-create audit + rate-limit ──
  describe("H.2.4e: /api/listings POST rate-limit + audit log of the create", () => {
    it("applies the LISTING_CREATE rate limit", () => {
      const route = read("src/app/api/listings/route.ts");
      expect(route).toContain("LISTING_CREATE");
      expect(route).toContain("rateLimitKey(user.id, LISTING_CREATE.label)");
    });
    it("writes a marketplace.listing.create audit row (previously only RFQ/Auction children were audited)", () => {
      const route = read("src/app/api/listings/route.ts");
      expect(route).toContain('"marketplace.listing.create"');
      expect(route).toContain('entityType: "Listing"');
      expect(route).toContain("entityId: listing.id");
    });
  });

  // ── H.2.6: WANTED dashboard counter + reject action ──
  describe("H.2.6: dashboard counter + reject moderation action", () => {
    it("dashboard counts REJECTED and EXPIRED separately (no longer invisible)", () => {
      const dash = read("src/app/dashboard/wanted/page.tsx");
      expect(dash).toContain('r.status === "REJECTED"');
      expect(dash).toContain('r.status === "EXPIRED"');
      expect(dash).toContain("rejected:");
      expect(dash).toContain("expired:");
    });
    it("the state machine allows reject from PENDING and ACTIVE", () => {
      const svc = read("src/lib/wanted-service.ts");
      expect(svc).toContain("reject: STATUS_REJECTED");
      expect(svc).toContain('action: "approve" | "close" | "fulfill" | "reject"');
    });
    it("rejectWanted service function exists with CAS + audit", () => {
      const svc = read("src/lib/wanted-service.ts");
      expect(svc).toContain("export async function rejectWanted");
      expect(svc).toContain('"marketplace.wanted.reject"');
      // Idempotent on already-REJECTED.
      expect(svc).toContain("if (before.status === STATUS_REJECTED)");
    });
    it("admin bulk + single-row routes wire the reject action", () => {
      const bulk = read("src/app/api/admin/requests/route.ts");
      expect(bulk).toContain('case "reject"');
      expect(bulk).toContain('"approve" | "close" | "fulfill" | "reject"');
      const single = read("src/app/api/admin/requests/[id]/route.ts");
      expect(single).toContain("rejectWanted");
      expect(single).toContain('body.action === "reject"');
    });
  });
});
