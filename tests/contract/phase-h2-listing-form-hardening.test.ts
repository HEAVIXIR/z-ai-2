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
      expect(wizard).toContain("if (isWantedServiceRequest || isServiceRequest) {");
      // The WANTED-specific quantity/budget/deadline checks run inside it.
      const branch = wizard.split("if (isWantedServiceRequest || isServiceRequest) {")[1]?.split("return true;")[0] ?? "";
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

  // ── H.2 rev2: RFC structural-storage model precision ──
  describe("H.2 rev2: BuyRequestAttributeValue RFC uses a REAL FK to AttributeDefinition", () => {
    it("attributeId is a real relation (mirrors ListingAttributeValue), not a bare String", () => {
      const rfc = read("docs/operations/RFC-WANTED-STRUCTURAL-STORAGE-H2.md");
      // The real FK relation line MUST be present.
      expect(rfc).toContain("attribute     AttributeDefinition @relation(\"BuyRequestAttributeValueAttribute\", fields: [attributeId], references: [id], onDelete: Cascade)");
      // The old flawed bare-String declaration MUST be gone.
      expect(rfc).not.toContain("attributeId   String           // → AttributeDefinition.id (or key)");
      // The migration SQL adds the real FK constraint (Cascade).
      expect(rfc).toContain('"BuyRequestAttributeValue_attributeId_fkey"');
      expect(rfc).toContain('FOREIGN KEY ("attributeId") REFERENCES "AttributeDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE');
    });
    it("documents the deletion-behavior matrix (Cascade on request + attribute, SetNull on option)", () => {
      const rfc = read("docs/operations/RFC-WANTED-STRUCTURAL-STORAGE-H2.md");
      expect(rfc).toContain("BuyRequest deleted");
      expect(rfc).toContain("AttributeDefinition deleted");
      expect(rfc).toContain("AttributeOption deleted");
      expect(rfc).toContain("onDelete: Cascade");
      expect(rfc).toContain("onDelete: SetNull");
    });
    it("documents the type-validation contract (slot must match AttributeDefinition.type)", () => {
      const rfc = read("docs/operations/RFC-WANTED-STRUCTURAL-STORAGE-H2.md");
      expect(rfc).toContain("Type-validation contract");
      expect(rfc).toContain("AttributeDefinition.type");
      expect(rfc).toContain("INTEGER/DECIMAL/YEAR/CURRENCY/UNIT/SIZE/WEIGHT");
    });
    it("documents the category/model membership validation (mirrors listing-attributes outOfScope)", () => {
      const rfc = read("docs/operations/RFC-WANTED-STRUCTURAL-STORAGE-H2.md");
      expect(rfc).toContain("Category/model membership validation contract");
      expect(rfc).toContain("CategoryAttribute");
      expect(rfc).toContain("ProductModelAttribute");
      expect(rfc).toContain("listing-attributes.ts:120");
    });
    it("documents the concurrent-idempotency limitation + the DB-level strengthening option", () => {
      const rfc = read("docs/operations/RFC-WANTED-STRUCTURAL-STORAGE-H2.md");
      expect(rfc).toContain("Concurrency-safe idempotency");
      expect(rfc).toContain("sequential-retry");
      expect(rfc).toContain("truly concurrent");
      // The recommended BuyRequest.idempotencyKey @unique column is documented.
      expect(rfc).toContain('idempotencyKey String? @unique');
      expect(rfc).toContain("P2002");
    });
  });

  // ── H.3: WANTED structured storage (canonical FKs + parent/child attributes) ──
  describe("H.3: BuyRequest stores structured fields canonically (not audit-only)", () => {
    it("schema.prisma declares the structured-spec columns on BuyRequest", () => {
      const schema = read("prisma/schema.prisma");
      expect(schema).toContain("quantity        Int?");
      expect(schema).toContain("categoryId      String?");
      expect(schema).toContain("brandId         String?");
      expect(schema).toContain("modelId         String?");
      expect(schema).toContain("serviceTypeId   String?");
      expect(schema).toContain("intent          String?");
      // DB-enforced idempotency column (@unique).
      expect(schema).toContain("idempotencyKey  String?");
      expect(schema).toContain("@@unique([userId, idempotencyKey])");
    });

    it("schema.prisma declares the structured-spec FK relations (SetNull on taxonomy delete)", () => {
      const schema = read("prisma/schema.prisma");
      expect(schema).toContain('categoryRef     Category?        @relation("BuyRequestCategory"');
      expect(schema).toContain('brandRef        Brand?           @relation("BuyRequestBrand"');
      expect(schema).toContain('modelRef        ProductModel?    @relation("BuyRequestModel"');
      expect(schema).toContain('serviceTypeRef  ServiceType?     @relation("BuyRequestService"');
      // SetNull: deleting a taxonomy row nulls the FK (request survives).
      expect(schema).toMatch(/categoryRef.*onDelete: SetNull/);
    });

    it("schema.prisma uses the PARENT/CHILD attribute model (not single-table + partial indexes)", () => {
      const schema = read("prisma/schema.prisma");
      // Parent: one row per (request, attribute). No partial indexes.
      expect(schema).toContain("model BuyRequestAttributeValue");
      expect(schema).toContain('attribute     AttributeDefinition @relation("BuyRequestAttributeValueAttribute"');
      expect(schema).toContain("@@unique([buyRequestId, attributeId])");
      // Child: one row per selected option for MULTI_SELECT.
      expect(schema).toContain("model BuyRequestAttributeOption");
      expect(schema).toContain("@@unique([attributeValueId, optionId])");
      // The parent has selectedOptions relation to the child.
      expect(schema).toContain("selectedOptions BuyRequestAttributeOption[]");
      // The child FK to AttributeOption is Cascade (not SetNull — avoids the collision).
      expect(schema).toContain('option          AttributeOption @relation("BuyRequestAttributeOptionOption"');
    });

    it("back-relations exist on Category, Brand, ProductModel, ServiceType, AttributeDefinition, AttributeOption", () => {
      const schema = read("prisma/schema.prisma");
      expect(schema).toContain('buyRequests BuyRequest[]  @relation("BuyRequestCategory")');
      expect(schema).toContain('buyRequests BuyRequest[]  @relation("BuyRequestBrand")');
      expect(schema).toContain('buyRequests BuyRequest[]  @relation("BuyRequestModel")');
      expect(schema).toContain('buyRequests BuyRequest[]  @relation("BuyRequestService")');
      expect(schema).toContain('buyRequestValues BuyRequestAttributeValue[]  @relation("BuyRequestAttributeValueAttribute")');
      expect(schema).toContain('buyRequestValues     BuyRequestAttributeValue[]  @relation("BuyRequestAttributeValueOption")');
      expect(schema).toContain('buyRequestOptionRows BuyRequestAttributeOption[]  @relation("BuyRequestAttributeOptionOption")');
    });

    it("migration SQL file exists and declares the parent/child tables + real FKs + idempotencyKey unique", () => {
      const sql = read("prisma/migrations/20261119160000_wanted_structural_storage/migration.sql");
      // BuyRequest structured columns.
      expect(sql).toContain('ADD COLUMN "quantity"');
      expect(sql).toContain('ADD COLUMN "categoryId"');
      expect(sql).toContain('ADD COLUMN "idempotencyKey"');
      // DB-enforced idempotency unique index.
      expect(sql).toContain('CREATE UNIQUE INDEX "BuyRequest_userId_idempotencyKey_key"');
      // Parent table with real FK to AttributeDefinition (Cascade).
      expect(sql).toContain('CREATE TABLE "BuyRequestAttributeValue"');
      expect(sql).toContain('"BuyRequestAttributeValue_attributeId_fkey"');
      expect(sql).toContain('FOREIGN KEY ("attributeId") REFERENCES "AttributeDefinition"("id") ON DELETE CASCADE');
      // Child table with real FK to AttributeOption (Cascade) + AttributeValue (Cascade).
      expect(sql).toContain('CREATE TABLE "BuyRequestAttributeOption"');
      expect(sql).toContain('"BuyRequestAttributeOption_optionId_fkey"');
      expect(sql).toContain('FOREIGN KEY ("optionId") REFERENCES "AttributeOption"("id") ON DELETE CASCADE');
      expect(sql).toContain('"BuyRequestAttributeOption_attributeValueId_fkey"');
      // Unique indexes: parent (request, attribute) + child (value, option).
      expect(sql).toContain('"BuyRequestAttributeValue_buyRequestId_attributeId_key"');
      expect(sql).toContain('"BuyRequestAttributeOption_attributeValueId_optionId_key"');
    });

    it("createWanted writes the structured FK columns + attribute parent/child in an atomic transaction", () => {
      const svc = read("src/lib/wanted-service.ts");
      // The structured columns are written to BuyRequest.create data.
      expect(svc).toContain("quantity: quantity ?? null");
      expect(svc).toContain("categoryId: categoryId ?? null");
      expect(svc).toContain("brandId: brandId ?? null");
      expect(svc).toContain("modelId: modelId ?? null");
      expect(svc).toContain("serviceTypeId: serviceTypeId ?? null");
      expect(svc).toContain("intent: resolvedIntent");
      expect(svc).toContain("idempotencyKey: idempotencyKey ?? null");
      // The attribute parent/child rows are created inside the same $transaction.
      expect(svc).toContain("db.$transaction");
      expect(svc).toContain("attributeValues: {");
      expect(svc).toContain("selectedOptions: {");
      // DB-level idempotency: catch P2002 on concurrent double-submit.
      expect(svc).toContain("Prisma.PrismaClientKnownRequestError");
      expect(svc).toContain("err.code === \"P2002\"");
      expect(svc).toContain("idempotencyKey, userId");
    });

    it("createWanted validates attribute type + category/model membership before persisting", () => {
      const svc = read("src/lib/wanted-service.ts");
      expect(svc).toContain("validateBuyRequestAttributeValues");
      expect(svc).toContain("if (!validation.ok)");
      expect(svc).toContain("throw new WantedServiceError(400, validation.error)");
      // The validator file exists.
      const validator = read("src/lib/buy-request-attributes.ts");
      expect(validator).toContain("export async function validateBuyRequestAttributeValues");
      expect(validator).toContain("CategoryAttribute");
      expect(validator).toContain("ProductModelAttribute");
      expect(validator).toContain("outOfScope");
      expect(validator).toContain("MULTI_SELECT");
      expect(validator).toContain("selectedOptionIds");
    });

    it("getWanted returns the structured-spec fields + attribute parent/child (read path complete)", () => {
      const svc = read("src/lib/wanted-service.ts");
      expect(svc).toContain("quantity: true");
      expect(svc).toContain("categoryId: true");
      expect(svc).toContain("categoryRef: { select: { name: true } }");
      expect(svc).toContain("brandRef: { select: { name: true } }");
      expect(svc).toContain("modelRef: { select: { name: true } }");
      expect(svc).toContain("serviceTypeRef: { select: { nameFa: true } }");
      expect(svc).toContain("selectedOptions: { select: { optionId: true } }");
      expect(svc).toContain("categoryName: request.categoryRef?.name ?? null");
    });

    it("listWanted filters by canonical categoryId FK (not name-resolution) + returns structured fields", () => {
      const svc = read("src/lib/wanted-service.ts");
      expect(svc).toContain("if (categoryId) where.categoryId = categoryId");
      expect(svc).toContain("if (brandId) where.brandId = brandId");
      // No more category_idToName best-effort fallback in listWanted.
      const listBlock = svc.split("export async function listWanted")[1]?.split("export async function")[0] ?? "";
      expect(listBlock).not.toContain("categoryName = categoryId");
    });

    it("dashboard/wanted displays the structured taxonomy names + quantity", () => {
      const dash = read("src/app/dashboard/wanted/page.tsx");
      expect(dash).toContain("r.categoryRef?.name ?? r.category");
      expect(dash).toContain("r.brandRef?.name ?? r.brandPref");
      expect(dash).toContain("r.modelRef?.name");
      expect(dash).toContain("r.serviceTypeRef?.nameFa");
      expect(dash).toContain("r.quantity != null");
      expect(dash).toContain("toFa(r.quantity)");
    });

    it("separate guarded workflow exists for the WANTED migration (independent of #347)", () => {
      const wf = read(".github/workflows/app-preview-wanted-structural-migration.yml");
      expect(wf).toContain("APPLY_APP_PREVIEW_20261119160000");
      expect(wf).toContain("heavix-app-preview-wanted-structural-migration");
      // Expects 7 pre-apply (i.e. #347's migration already ran) + 8 post.
      expect(wf).toContain('expected_history="7|');
      expect(wf).toContain('expected="8|');
      expect(wf).toContain("20261119160000_wanted_structural_storage");
      // Schema preconditions: WANTED tables/columns absent before apply.
      expect(wf).toContain("column_name='quantity'");
      expect(wf).toContain("table_name='BuyRequestAttributeValue'");
      expect(wf).toContain("table_name='BuyRequestAttributeOption'");
      // Backup acceptance compares the complete public-table inventory and
      // rehearses this exact migration on the disposable PostgreSQL restore.
      expect(wf).toContain('diff -u "$WORK/expected-public-tables.txt" "$WORK/restored-public-tables.txt"');
      expect(wf).toContain("prisma/migrations/20261119160000_wanted_structural_storage/migration.sql");
      expect(wf).toContain("BuyRequest_userId_idempotencyKey_key");
    });
  });
});

describe("H.3 follow-up hardening: WANTED attribute transport and server enforcement", () => {
  it("submits typed MULTI_SELECT IDs and preserves legacy Listing textValue", () => {
    const ui = read("src/components/listings/AttributeFields.tsx");
    expect(ui).toContain("entry.selectedOptionIds = arr.map(String)");
    // Ordinary listings still consume the legacy textValue representation.
    expect(ui).toContain('entry.textValue = entry.selectedOptionIds.join(",");');
    expect(ui).toContain("(Array.isArray(raw) && raw.length === 0)");
  });

  it("normalizes legacy MULTI_SELECT text without treating it as the TEXT slot", () => {
    const validator = read("src/lib/buy-request-attributes.ts");
    expect(validator).toContain('attribute.type !== "MULTI_SELECT" && value.textValue');
    expect(validator).toContain("new Set(selectedOptionIds).size !== selectedOptionIds.length");
  });

  it("enforces required attributes on the server even when the payload is empty", () => {
    const svc = read("src/lib/wanted-service.ts");
    expect(svc).toContain("Always run server-side validation");
    expect(svc).toContain("true,  // enforceRequired");
    const validator = read("src/lib/buy-request-attributes.ts");
    // Empty payloads must still reach the required-field check.
    expect(validator).not.toContain("if (values.length === 0) return { ok: true, values: [] }");
    expect(validator.indexOf("Required enforcement")).toBeGreaterThan(validator.indexOf("const values = incoming"));
  });

  it("requires a ServiceType only for SERVICE_REQUEST intent", () => {
    const route = read("src/app/api/wanted/route.ts");
    expect(route).toContain('intentStr === "SERVICE_REQUEST" && !requestedServiceTypeId');
    expect(route).toContain('intentStr !== "SERVICE_REQUEST" && requestedServiceTypeId');
  });

  it("rejects brand/category and model/category mismatches before persistence", () => {
    const route = read("src/app/api/wanted/route.ts");
    expect(route).toContain("db.brandCategory.findUnique");
    expect(route).toContain("!brandCategoryRow");
    expect(route).toContain("modelRow.categoryId !== requestedCategoryId");
  });
});
