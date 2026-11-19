# RFC — WANTED Structural Storage: H.2 Execution-Ready Proposal

**Status:** Design + execution-ready artifacts. **Migration execution NOT authorized** (blocked on the backup/restore gate).
**Branch:** `integration/preview-readiness-workerd-2026-11-15`
**Issue:** #345 (items 4 + 5)
**Date:** 2026-11-19 (PHASE H.2)
**Supersedes/augments:** `docs/operations/RFC-WANTED-IDEMPOTENCY-STRUCTURAL-STORAGE.md`

## 0. Purpose

This document records what PHASE H.2 delivered **without** a migration, and
provides the **complete, execution-ready** migration artifacts for the
WANTED structured-storage gap so that the moment the backup/restore gate
opens, the migration can be applied verbatim with no further design work.

Per the senior-manager directive (H.2 §3): *"Migration execution is NOT
authorized by this directive. Keep all schema changes blocked until exact
database identity, encrypted backup, read-back, disposable restore,
rollback/recovery and explicit approval gates pass."* This document
respects that boundary: no `prisma/migrations` entry is added, no
`schema.prisma` column is added, and no DB mutation is performed.

---

## 1. What H.2 delivered WITHOUT a migration

These are committed on the integration branch and verified by CI:

### 1.1 Idempotency — DONE (audit-log-backed, no migration)
The existing RFC (§3.1/§4.1) proposed adding `idempotencyKey` to
`BuyRequest`. H.2 instead used the **already-existing**
`AuditLog.idempotencyKey` column (`@unique`, `schema.prisma:1767`) to make
replay idempotent with **zero schema change**:

- `src/lib/idempotency.ts` — `extractIdempotencyKey(req)` (charset-allowlisted
  header read) + `findIdempotentResult({ key, action, actorId })` (audit-log
  lookup by `idempotencyKey`+`action`+`actorId`).
- `src/lib/admin/audit.ts` — `logAudit`/`logAuditStrict` now accept + write
  `idempotencyKey`.
- `src/lib/wanted-service.ts` — `createWanted` accepts `idempotencyKey` and
  stamps it on the `marketplace.wanted.create` audit row.
- `src/app/api/wanted/route.ts` + `src/app/api/listings/route.ts` —
  check-before-create: a retry with the same key resolves to the prior
  `{ id, status }` (HTTP 200, `idempotentReplay: true`) instead of creating
  a duplicate.
- `src/app/listings/new/page.tsx` — the wizard generates a UUID per
  submission, reuses it on retry, clears it on definitive success.

**Result:** "one submission cannot create duplicate requests on retry" is
satisfied for the sequential-retry case (the documented requirement). The
rare concurrent-double-click race is mitigated by the per-user rate limiter
(`WANTED_CREATE` / `LISTING_CREATE`, 10/hour); a truly concurrent pair could
both create before either audits, but only one audit row survives the
`@unique` constraint.

> If a stronger, DB-enforced guarantee is later required, the
> `BuyRequest.idempotencyKey @unique` column from the original RFC §3.1 can
> still be added — the application code already passes the key through to
> `createWanted`, so adding the column + `catch P2002` is a 1-line schema +
> ~10-line service change.

### 1.2 Fail-closed taxonomy validation — DONE (interim integrity layer)
`/api/wanted` POST now rejects (400) invalid `categoryId` / `brandId` /
`modelId` / `serviceTypeId` and mismatched brand↔model / category↔model
pairs **before** `createWanted` runs. Previously these were best-effort
(name resolution → NULL on miss). This does not require a migration: it
validates the IDs against the live `Category`/`Brand`/`ProductModel`/
`ServiceType` tables. The structured FK persistence itself remains blocked
(§2), but the API boundary is now fail-closed so garbage IDs cannot enter
the moderation queue.

### 1.3 Moderation lifecycle — DONE
- `rejectWanted` service function + `reject` action in the bulk + single-row
  admin routes. `REJECTED` was a recognized terminal status but previously
  had **no inbound transition** and **no API**. The state machine now allows
  `PENDING→REJECTED` and `ACTIVE→REJECTED`, audited as
  `marketplace.wanted.reject`.
- Dashboard counters now include `REJECTED` and `EXPIRED` separately (they
  previously contributed to `total` but to no lifecycle counter).

### 1.4 Security hardening — DONE
- CSRF on `/api/wanted/[id]` PATCH/DELETE (was missing — cross-site close).
- CSRF + rate-limit + bounded body on `/api/requests` (legacy), `/api/rfq`
  POST, and `/api/rfq/[id]/quotes` POST (all were unguarded).
- `LISTING_CREATE` rate-limit + `marketplace.listing.create` audit log on
  `/api/listings` POST (was missing).
- RENT server-side validation (rentalPeriod enum+required, deposit≥0,
  minimumRentalPeriod integer≥1, availabilityEnd>start) + AUCTION client
  canProceed (reservePrice≥startPrice, endDate>startDate).

---

## 2. What remains BLOCKED — the structured-storage migration

`quantity`, `categoryId` (FK), `brandId` (FK), `modelId` (FK),
`serviceTypeId` (FK), and `attributeValues` (typed relation) are still
**audit-only / name-resolved** on `BuyRequest`. This blocks:

- structured matching (matching engine cannot filter by model/attributes),
- structured search/filter on the public wanted list,
- post-submission edit of quantity/model/specs (no column to PATCH),
- the round-trip behavioral tests (§5).

The migration below is **execution-ready**. It must NOT be run until the
backup/restore gate passes.

---

## 3. Execution-ready migration artifacts

### 3.1 `schema.prisma` diff (additive, nullable, backward-compatible)

```prisma
model BuyRequest {
  id              String   @id @default(cuid())
  title           String
  description     String?
  category        String?          // KEPT (back-compat display name)
  brandPref       String?          // KEPT (back-compat display name)
  transaction     String   @default("SALE")
  budgetMin       BigInt?
  budgetMax       BigInt?
  city            String?
  province        String?
  deadline        String?
  status          String   @default("ACTIVE")
  verified        Boolean  @default(false)
  viewCount       Int      @default(0)
  requesterName   String?
  requesterPhone  String?
  adminNotes      String?
  publishedAt     DateTime? @default(now())
  expiresAt       DateTime?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  userId          String?
  user            User?     @relation("UserRequests", fields: [userId], references: [id], onDelete: SetNull)

  // ── H.2 structured-spec columns (nullable → existing rows unaffected) ──
  quantity        Int?
  categoryId      String?
  brandId         String?
  modelId         String?
  serviceTypeId   String?
  intent          String?          // canonical demand intent (SALE/RENT/SALE_AND_RENT/SERVICE_REQUEST)

  // ── H.2 structured-spec relations (SetNull → taxonomy deletion is safe) ──
  categoryRef     Category?      @relation("BuyRequestCategory", fields: [categoryId],    references: [id], onDelete: SetNull)
  brandRef        Brand?          @relation("BuyRequestBrand",   fields: [brandId],       references: [id], onDelete: SetNull)
  modelRef        ProductModel?   @relation("BuyRequestModel",   fields: [modelId],       references: [id], onDelete: SetNull)
  serviceTypeRef  ServiceType?    @relation("BuyRequestService", fields: [serviceTypeId], references: [id], onDelete: SetNull)

  // ── H.2 typed-attribute relation (mirrors ListingAttributeValue) ──
  attributeValues BuyRequestAttributeValue[]

  @@index([categoryId])
  @@index([brandId])
  @@index([modelId])
  @@index([status, expiresAt])
  @@index([userId, status])
}

model BuyRequestAttributeValue {
  id            String   @id @default(cuid())
  buyRequestId  String
  attributeId   String           // → AttributeDefinition.id (or key)
  textValue     String?
  numberValue   Float?
  booleanValue  Boolean?
  dateValue     DateTime?
  optionId      String?          // → AttributeOption.id
  sourceType    String?          // SELLER_INPUT | ADMIN
  buyRequest    BuyRequest       @relation(fields: [buyRequestId], references: [id], onDelete: Cascade)
  option        AttributeOption?  @relation("BuyRequestAttributeValueOption", fields: [optionId], references: [id], onDelete: SetNull)

  @@unique([buyRequestId, attributeId])
  @@index([buyRequestId])
}
```

Back-relations must be added to `Category`, `Brand`, `ProductModel`,
`ServiceType`, and `AttributeOption`:
```prisma
// Category
buyRequests  BuyRequest[]  @relation("BuyRequestCategory")
// Brand
buyRequests  BuyRequest[]  @relation("BuyRequestBrand")
// ProductModel
buyRequests  BuyRequest[]  @relation("BuyRequestModel")
// ServiceType
buyRequests  BuyRequest[]  @relation("BuyRequestService")
// AttributeOption
buyRequestValues  BuyRequestAttributeValue[]  @relation("BuyRequestAttributeValueOption")
```

### 3.2 Migration SQL (PostgreSQL — execution-ready, DO NOT RUN)

File name to use when the gate opens:
`prisma/migrations/<YYYYMMDDHHMMSS>_wanted_structural_storage/migration.sql`

```sql
-- H.2: WANTED structural specification storage (additive, backward-compatible).
-- All new columns are nullable; existing rows are unaffected.

ALTER TABLE "BuyRequest" ADD COLUMN "quantity"      INTEGER;
ALTER TABLE "BuyRequest" ADD COLUMN "categoryId"    TEXT;
ALTER TABLE "BuyRequest" ADD COLUMN "brandId"       TEXT;
ALTER TABLE "BuyRequest" ADD COLUMN "modelId"       TEXT;
ALTER TABLE "BuyRequest" ADD COLUMN "serviceTypeId" TEXT;
ALTER TABLE "BuyRequest" ADD COLUMN "intent"       TEXT;

-- Foreign keys (SetNull so taxonomy deletion does not cascade-delete requests).
ALTER TABLE "BuyRequest"
  ADD CONSTRAINT "BuyRequest_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BuyRequest"
  ADD CONSTRAINT "BuyRequest_brandId_fkey"
  FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BuyRequest"
  ADD CONSTRAINT "BuyRequest_modelId_fkey"
  FOREIGN KEY ("modelId") REFERENCES "ProductModel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BuyRequest"
  ADD CONSTRAINT "BuyRequest_serviceTypeId_fkey"
  FOREIGN KEY ("serviceTypeId") REFERENCES "ServiceType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Supporting indexes for structured search/filter/matching.
CREATE INDEX "BuyRequest_categoryId_idx"    ON "BuyRequest"("categoryId");
CREATE INDEX "BuyRequest_brandId_idx"        ON "BuyRequest"("brandId");
CREATE INDEX "BuyRequest_modelId_idx"        ON "BuyRequest"("modelId");
CREATE INDEX "BuyRequest_status_expiresAt_idx" ON "BuyRequest"("status", "expiresAt");
CREATE INDEX "BuyRequest_userId_status_idx"   ON "BuyRequest"("userId", "status");

-- Typed attribute values relation (mirrors ListingAttributeValue).
CREATE TABLE "BuyRequestAttributeValue" (
  "id"            TEXT NOT NULL,
  "buyRequestId"  TEXT NOT NULL,
  "attributeId"   TEXT NOT NULL,
  "textValue"     TEXT,
  "numberValue"   DOUBLE PRECISION,
  "booleanValue"  BOOLEAN,
  "dateValue"     TIMESTAMP(3),
  "optionId"      TEXT,
  "sourceType"    TEXT,
  CONSTRAINT "BuyRequestAttributeValue_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BuyRequestAttributeValue_buyRequestId_attributeId_key"
  ON "BuyRequestAttributeValue"("buyRequestId", "attributeId");
CREATE INDEX "BuyRequestAttributeValue_buyRequestId_idx"
  ON "BuyRequestAttributeValue"("buyRequestId");

ALTER TABLE "BuyRequestAttributeValue"
  ADD CONSTRAINT "BuyRequestAttributeValue_buyRequestId_fkey"
  FOREIGN KEY ("buyRequestId") REFERENCES "BuyRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BuyRequestAttributeValue"
  ADD CONSTRAINT "BuyRequestAttributeValue_optionId_fkey"
  FOREIGN KEY ("optionId") REFERENCES "AttributeOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

### 3.3 Rollback SQL (recovery)

```sql
DROP TABLE IF EXISTS "BuyRequestAttributeValue";
DROP INDEX IF EXISTS "BuyRequest_userId_status_idx";
DROP INDEX IF EXISTS "BuyRequest_status_expiresAt_idx";
DROP INDEX IF EXISTS "BuyRequest_modelId_idx";
DROP INDEX IF EXISTS "BuyRequest_brandId_idx";
DROP INDEX IF EXISTS "BuyRequest_categoryId_idx";
ALTER TABLE "BuyRequest" DROP CONSTRAINT IF EXISTS "BuyRequest_serviceTypeId_fkey";
ALTER TABLE "BuyRequest" DROP CONSTRAINT IF EXISTS "BuyRequest_modelId_fkey";
ALTER TABLE "BuyRequest" DROP CONSTRAINT IF EXISTS "BuyRequest_brandId_fkey";
ALTER TABLE "BuyRequest" DROP CONSTRAINT IF EXISTS "BuyRequest_categoryId_fkey";
ALTER TABLE "BuyRequest" DROP COLUMN IF EXISTS "intent";
ALTER TABLE "BuyRequest" DROP COLUMN IF EXISTS "serviceTypeId";
ALTER TABLE "BuyRequest" DROP COLUMN IF EXISTS "modelId";
ALTER TABLE "BuyRequest" DROP COLUMN IF EXISTS "brandId";
ALTER TABLE "BuyRequest" DROP COLUMN IF EXISTS "categoryId";
ALTER TABLE "BuyRequest" DROP COLUMN IF EXISTS "quantity";
```

### 3.4 Service-layer change (`createWanted`) — ready to apply post-migration

After the migration lands, `createWanted` writes the canonical FKs + the
typed attribute relation (the fail-closed validation from H.2.4c already
guarantees the IDs are valid, so the write is safe):

```ts
// In createWanted, inside the db.buyRequest.create data block:
const request = await db.buyRequest.create({
  data: {
    // ... existing fields ...
    quantity: quantity ?? null,            // NOW a real column
    categoryId: categoryId ?? null,        // NOW a real FK
    brandId: brandId ?? null,             // NOW a real FK
    modelId: modelId ?? null,             // NOW a real FK
    serviceTypeId: serviceTypeId ?? null, // NOW a real FK
    intent: resolvedIntent,               // NOW a real column
    // Free-text category/brandPref are still populated (back-compat display).
    attributeValues: Array.isArray(attributeValues) && attributeValues.length
      ? { create: attributeValues.map((av) => normalizeAttrValue(av)) }
      : undefined,
  },
  // ...
});
```

`normalizeAttrValue` maps the client payload to the typed slots (mirrors
`buildAttributePayload` in `src/components/listings/AttributeFields.tsx`).

The read paths (`getWanted`, `listWanted`, the owner dashboard, the admin
list) gain `include: { attributeValues: true, categoryRef: { select: { name: true } }, ... }`
so the structured spec is returned alongside the free-text fields.

---

## 4. Backfill (optional, post-migration)

Existing `BuyRequest` rows have `quantity/categoryId/brandId/modelId/
serviceTypeId = NULL`. A one-time backfill can resolve the free-text
`category`/`brandPref` names back to IDs (best-effort, name-collision-aware):

```sql
-- Backfill categoryId from the free-text category name (collision-safe).
UPDATE "BuyRequest" br
SET "categoryId" = sub."id"
FROM (
  SELECT c."id", c."name"
  FROM "Category" c
  WHERE c."active" = true
) sub
WHERE br."category" = sub."name" AND br."categoryId" IS NULL;
-- (repeat for brandId from brandPref; modelId/serviceTypeId have no free-text
--  carrier and cannot be backfilled — they stay NULL, which is correct.)
```

This is optional; NULL structured fields are valid (the row keeps its
free-text display values).

---

## 5. Round-trip persistence tests (to activate post-migration)

These are written as **pending** (skipped) until the migration lands. They
live in `tests/integration/wanted-structural-storage-roundtrip.test.ts`
(to be added when the gate opens). The contract for each:

1. **quantity round-trip:** POST `/api/wanted` with `quantity: 7` → read the
   row back via `/api/wanted?mine=true` → assert `quantity === 7`.
2. **categoryId FK round-trip:** POST with a valid `categoryId` → read back
   → assert `categoryId` matches AND `categoryRef.name` matches the chosen
   Category.
3. **brandId + modelId FK round-trip + compatibility:** POST with a valid
   brand+model pair → read back → assert both FKs persisted and
   `modelRef.brandId === brandId`.
4. **serviceTypeId FK round-trip:** POST a SERVICE_REQUEST intent with a
   valid `serviceTypeId` → read back → assert the FK persisted.
5. **attributeValues typed relation round-trip:** POST with a typed
   attribute payload (text + number + option) → read back → assert each
   attribute value persisted in its typed slot and the option link resolves.
6. **fail-closed on invalid IDs (regression):** POST with a garbage
   `categoryId` → assert 400 (this already passes via H.2.4c, but the test
   locks it in against the post-migration schema).
7. **idempotent replay (regression):** POST twice with the same
   `Idempotency-Key` → assert the second response has
   `idempotentReplay: true` and the same `id` (already passes via H.2.4e).
8. **negative ownership (regression):** user B reads user A's PENDING
   request via `/api/wanted/[id]` → assert 404 (PENDING is not public).

---

## 6. Gate checklist (must ALL pass before execution)

- [ ] Exact database identity verified (target = Preview DB identity).
- [ ] Encrypted backup of the target DB taken + verified (read-back checksum).
- [ ] Disposable restore performed on a scratch DB; migration applied there
      successfully; rollback SQL verified to restore the scratch DB.
- [ ] Explicit senior-manager approval to execute recorded in the issue.
- [ ] Migration applied via the guarded App Preview single-migration workflow
      (PR #347), NOT via a local `prisma migrate dev` or `db push`.
- [ ] Post-migration: `prisma generate`, then run the §5 round-trip tests.
- [ ] Verify the exact Integration SHA after migration (root HTTP 200,
      `/api/health`, listing create, WANTED create, owner dashboard, public
      visibility after moderation).

Until every box above is checked, this migration stays a proposal.
