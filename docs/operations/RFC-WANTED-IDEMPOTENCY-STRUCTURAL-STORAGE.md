# RFC — Wanted Request: Idempotent Creation + Structural Specification Storage

**Status:** Draft (design only — NO migration execution)
**Branch:** `integration/preview-readiness-workerd-2026-11-15`
**Issue:** #345 (items 4 + 5)
**Date:** 2026-11-19
**Gate:** Blocked on the database backup/restore gate (NO-GO migration policy).

## 1. Problem

Two P1 defects remain after the moderation + intent + taxonomy fixes:

### 1.1 Idempotency (item 5)
`createWanted` has no idempotency key. A network retry or double-submit of the
wizard creates **two** BuyRequest rows for the same intent. The AuditLog table
has an `idempotencyKey String? @unique` column, but `logAudit` (the helper
`createWanted` uses) does not set it, so there is no dedup surface today.

The BuyRequest model has **no unique constraint beyond `id`** (verified:
`prisma/schema.prisma` — no `@@unique`, no `@@index`). So the DB cannot enforce
"one pending request per (userId, title, deadline)" or any client-supplied key.

### 1.2 Structural specification storage (item 4)
`quantity`, `modelId`, `serviceTypeId`, and `attributeValues` are recorded in
the audit `after` payload ONLY — they have no BuyRequest columns. `categoryId`
and `brandId` are resolved to free-text names (`category`, `brandPref`) and
stored as strings, losing the FK relationship.

Consequences:
- Public display, edit, search, filter, and matching cannot reliably use these
  fields (audit is not an operational data store).
- A buyer cannot edit quantity/model/specs after submission (no column to PATCH).
- Matching cannot filter by model or attribute values (only by free-text
  category/brand name).

## 2. Design constraints (non-negotiable)

1. **No migration execution** until the backup/restore gate is approved.
   This RFC is design-only.
2. **Backward-compatible**: existing rows (with `transaction = "WANTED"`,
   `status = "ACTIVE"`, null specs) must keep working. New columns must be
   nullable or have safe defaults.
3. **No paid services** — Postgres + Prisma only.
4. **Integration branch only** — no Main/Production changes.

## 3. Proposed schema changes (migration — gated)

### 3.1 Idempotency key on BuyRequest

```prisma
model BuyRequest {
  // ... existing fields ...
  idempotencyKey String? @unique
  // ... existing relations ...
}
```

- **Client-supplied**: the wizard generates a UUID per form-session and sends it
  as `body.idempotencyKey` (or a `Idempotency-Key` header). `createWanted`
  accepts it as a param.
- **DB-enforced**: the `@unique` constraint makes a duplicate insert throw
  `P2002` (unique constraint violation). `createWanted` catches P2002 and
  returns the existing row (idempotent — the buyer sees their first submission,
  not an error).
- **Backward-compatible**: the column is nullable; existing rows get
  `idempotencyKey = null` and are unaffected.

Migration SQL (PostgreSQL):
```sql
ALTER TABLE "BuyRequest" ADD COLUMN "idempotencyKey" TEXT;
CREATE UNIQUE INDEX "BuyRequest_idempotencyKey_key" ON "BuyRequest"("idempotencyKey");
```

### 3.2 Structural specification columns

Option A (additive columns — simplest, backward-compatible):
```prisma
model BuyRequest {
  // ... existing fields ...
  quantity       Int?
  modelId        String?
  serviceTypeId  String?
  categoryId     String?
  brandId        String?
  // ... existing relations ...
  model         ProductModel?   @relation("BuyRequestModel",   fields: [modelId],       references: [id], onDelete: SetNull)
  serviceType   ServiceType?    @relation("BuyRequestService", fields: [serviceTypeId], references: [id], onDelete: SetNull)
  categoryRef   Category?       @relation("BuyRequestCategory", fields: [categoryId],   references: [id], onDelete: SetNull)
  brandRef      Brand?          @relation("BuyRequestBrand",   fields: [brandId],       references: [id], onDelete: SetNull)
}
```

- All new columns are nullable → existing rows unaffected.
- The free-text `category`/`brandPref` columns are kept (backward compat for
  display); `categoryId`/`brandId` are the canonical FKs for search/filter.
- `quantity` moves from audit-only to a real Int column.
- `attributeValues`: BuyRequest needs a dedicated relation (see Option B).

Option B (specification snapshot relation — for typed attributes):
```prisma
model BuyRequestAttributeValue {
  id            String   @id @default(cuid())
  buyRequestId  String
  attributeKey  String   // AttributeDefinition.key
  textValue     String?
  numberValue   Float?
  booleanValue  Boolean?
  dateValue     DateTime?
  optionId      String?  // → AttributeOption
  buyRequest    BuyRequest @relation(fields: [buyRequestId], references: [id], onDelete: Cascade)
  option        AttributeOption? @relation(fields: [optionId], references: [id], onDelete: SetNull)
  @@unique([buyRequestId, attributeKey])
}
```

- Mirrors the existing `ListingAttributeValue` pattern.
- Allows structured, queryable attribute filtering for BuyRequest matching.

### 3.3 Recommended scope for first migration

Start with the **minimum viable** set:
1. `idempotencyKey` (§3.1) — unblocks idempotent creation.
2. `quantity`, `modelId`, `serviceTypeId`, `categoryId`, `brandId` (§3.2 Option A)
   — unblocks structured filtering + editing.
3. `BuyRequestAttributeValue` (§3.2 Option B) — unblocks typed-attribute matching.

All three are additive (nullable + optional relations) → backward-compatible.

## 4. Application-layer changes (post-migration)

### 4.1 Idempotent createWanted
```
createWanted({ ..., idempotencyKey }) {
  try {
    return await db.buyRequest.create({ data: { ..., idempotencyKey } });
  } catch (e) {
    if (e.code === "P2002") {
      // Duplicate — return the existing row (idempotent).
      const existing = await db.buyRequest.findFirst({
        where: { idempotencyKey, userId },
      });
      return { id: existing.id, status: existing.status };
    }
    throw e;
  }
}
```

### 4.2 Store structural specs
`createWanted` writes `quantity`/`modelId`/`serviceTypeId`/`categoryId`/`brandId`
to columns (not just audit). The audit `after` payload keeps recording them for
the trail, but the source of truth becomes the columns.

### 4.3 Matching enhancement
`matchRequestToListings` can now filter candidates by `modelId` and attribute
values (not just category/brand name). This is a future matching-quality
improvement, not a blocker for the current P1 fixes.

## 5. Backup/restore gate prerequisites

Before any migration is executed:
1. **Fresh backup** of App + Store databases (B2 + age encryption + SHA-256
   checksum, per the established pipeline).
2. **Disposable restore test** — restore the backup to a throwaway DB and verify
   row counts + checksums.
3. **Migration dry-run** — `prisma migrate diff` to confirm the SQL is additive
   and non-destructive.
4. **Post-apply verification** — schema diff + sample row check.
5. **Explicit approval** from the database gate (HEAVIXIR) — no auto-apply.

## 6. Tests (post-migration)

- `duplicate-submit`: POST /api/wanted twice with the same idempotencyKey →
  one BuyRequest, second returns the first's id.
- `retry-after-timeout`: simulate a network timeout after the create succeeds →
  retry returns the existing row (not a duplicate).
- `structural-specs`: createWanted with quantity/modelId/attributeValues →
  fields are persisted as columns (not just audit); edit PATCH updates them;
  matching can filter by them.
- `backward-compat`: existing rows with null specs still match + display.

## 7. What this RFC does NOT do

- Does NOT execute any migration.
- Does NOT write to any database.
- Does NOT change application code (the application-layer changes in §4 are
  implemented only AFTER the migration is applied + verified).
- Does NOT touch Main/Production/Store Preview.

## 8. Sequencing

1. **This RFC** — design review (this document).
2. **Gate approval** — backup/restore gate cleared by HEAVIXIR.
3. **Migration PR** — schema changes only, applied to Preview first.
4. **Application PR** — idempotent createWanted + structural storage.
5. **Test PR** — duplicate-submit + structural-specs + backward-compat tests.
6. **Preview acceptance** — end-to-end WANTED journey with idempotency + specs.
7. **Main merge** — only after all gates pass.
