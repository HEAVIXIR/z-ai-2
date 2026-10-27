# Issue #144 — Prisma field-level parity review

**Review date:** 2026-10-27  
**Source:** legacy SQLite schemas retained under `prisma/legacy-sqlite/`  
**Target:** current PostgreSQL schemas  
**Scope:** static, read-only schema comparison only. No generated clients, migrations, seeds, or database operations were run.

## 1. Pinned schema inputs

| Role | Path | Git blob SHA |
|---|---|---|
| Current main | `prisma/schema.prisma` | `e5cd55139b4693ba4d73c2eab39a938bd9ae3773` |
| Current store | `prisma/store/schema.prisma` | `dd6bc65f3c3a0f230360845d67caec8a25a7dc5b` |
| Archived legacy main | `prisma/legacy-sqlite/schema.prisma` | `65912b2411a89e6877b44468a0b72c17c4432bd7` |
| Archived legacy store | `prisma/legacy-sqlite/store-schema.prisma` | `44295a8bd829fde7055b25ebe197abccb5642628` |

The archived schemas are evidence only. They are not configured as active datasource schemas and must not be used to generate production clients.

## 2. Executive result

**No legacy schema or migration should be copied into the active PostgreSQL schema.** The current schemas contain substantial additional domain and operational models. The differences below are schema-shape observations, not evidence that data should be migrated or that the current database contains corresponding rows.

| Area | Existing audit baseline | Main finding |
|---|---:|---|
| Main schema | 110 legacy models → 120 current models | `PriceRecord` is legacy-only and already deprecated in favor of `PriceObservation`; current schema has newer deal/order/dispute and admin page-management models. |
| Store schema | 20 legacy models → 34 current models | Current store adds inventory, procurement, returns, rentals, service requests/providers, shipment tracking, and audit outbox capabilities. |
| Datasources | SQLite legacy → PostgreSQL current | The two active PostgreSQL schemas use separate environment variables and generated-client paths. Do not collapse them into one datasource. |

## 3. Main schema — field and relation deltas

The following additions were observed on models that exist in both schemas:

| Model | Current-only fields / relations | Disposition |
|---|---|---|
| `Lead` | `status`, `assignedToId`, `assignedTo`, `score`, `scoreVersion`, `scoreBreakdown`, `scoredAt`, `scoreOverrideById`, `scoreOverrideBy`, `scoreOverrideReason`, `scoreOverrideNote`, `scoreOverrideAt` | Keep current schema; these support assignment/scoring workflows absent from the legacy shape. |
| `CompanyVerification` | `verificationType`, `evidence`, `expiresAt`, `revokedAt`, `revokedBy`, `revokeReason` | Keep current schema; preserve revocation and expiry semantics. |
| `User` | `dealsAsBuyer`, `dealsAsSeller`, `assignedLeads`, `scoreOverrideLeads` | Current relations; do not import old relation definitions. |
| `AuditLog` | `idempotencyKey` | Preserve idempotency support; do not replace the current audit contract. |
| `Payment` | `orderId`, `order`, `providerReference`, `idempotencyKey` | Current payment/order linkage and idempotency are authoritative. |
| `Listing` | Current `deals` relation replaces legacy `priceRecords` relation | Treat the relation change as intentional; legacy `PriceRecord` is not a migration target. |
| `Product` | Legacy `priceRecords` relation absent in current schema | Price history must use the current canonical model, not resurrect `PriceRecord`. |

The current main schema also adds models absent from the legacy schema, including `Deal`, `Order`, `Dispute`, `DisputeEvidence`, and admin navigation/page-management models (`AdminNavigationGroup`, `AdminNavigationItem`, `AdminPreference`, `AdminSavedView`, `AdminPage`, `AdminPageVersion`, `AdminPageTemplate`). These are current capabilities, not import candidates.

## 4. Store schema — field and relation deltas

| Model | Current-only fields / relations | Disposition |
|---|---|---|
| `Part` | `stockMovements`, `inventoryBalances`, `purchaseOrderItems` | Preserve the current inventory/procurement model; do not port legacy stock logic without contract tests. |
| `Order` | `returns` | Keep current return workflow. |
| `OrderItem` | `returnItems` | Keep current return-item relation. |
| `Shipment` | `pickupDate`, `proofUrl`, `tracking` | Keep current shipment proof/tracking contract. |
| `AdminUser` | Legacy `auditLogs` relation is absent from the current store schema | Audit ownership has moved; current main schema and outbox workflow are authoritative. |

Current store-only models include `Supplier`, `StockMovement`, `Warehouse`, `InventoryBalance`, `Return`, `ReturnItem`, `ProcurementRequest`, `PurchaseOrder`, `PurchaseOrderItem`, `ShipmentTracking`, `RentalListing`, `RentalBooking`, `ServiceProvider`, `ServiceRequest`, and `AuditOutbox`.

## 5. Migration and transfer decision

- **Reject:** copying either legacy SQLite schema over an active schema, restoring SQLite databases, or importing the legacy `PriceRecord` model.
- **Hold:** any field/data backfill, conversion, or production migration until a separate mapping, nullability/default review, referential-integrity plan, rollback, and approved non-production rehearsal exist.
- **Keep:** current `prisma/schema.prisma` and `prisma/store/schema.prisma`, each with its own PostgreSQL datasource, migration history, and generated client.
- **Do not infer data parity:** schema names and fields do not prove records are present, valid, or safely convertible.
- **Next validation before any future data migration:** run the Prisma CLI validation/generation for each current schema in CI, inspect migration history, and rehearse only against disposable PostgreSQL fixtures. This review did not run those commands and makes no claim that they passed.

## 6. Limits and confidence

This is a static comparison of the checked-in schema text. It does not compare database catalogs, historical migration SQL, row counts, constraints on a live database, or actual data. Relation and scalar field differences must be rechecked with Prisma's parser/CLI before implementing a migration. No production endpoint or database was accessed or changed.

## 7. Conclusion

The field-level deltas reinforce the existing no-bulk-import decision. The reviewed evidence supports **zero schema/code transfer from the legacy SQLite schemas**. It does not prove that every legacy application behavior is already implemented; a future feature port must begin with a demonstrated product gap and a separate, narrowly scoped, tested PR.
