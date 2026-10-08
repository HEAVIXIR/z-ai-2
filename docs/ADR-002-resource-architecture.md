# ADR-002 — Resource Architecture: Dual Schema & Universal Engine Ownership

- **Status:** Accepted — P4 remediation applied to working tree (pre-commit forensic gate)
- **Date:** 2026-10-08
- **Decision owners:** HEAVIX core team
- **Supersedes:** none
- **Superseded by:** —
- **Related:** ADR-001 (Database Strategy), STORE-MARKETPLACE-CONTROL-PLANE.md

## Context

The HEAVIX project has TWO Prisma schemas serving TWO distinct business domains:

1. **Main schema** (`prisma/schema.prisma`) — Marketplace domain
   - Models: Listing, Product, Order (marketplace deals), Payment (marketplace payments),
     Part (marketplace parts), User, Company, Brand, Machine, Review, etc.
   - Prisma client: `db` (from `@/lib/db`)
   - DB: `heavix` (PostgreSQL)

2. **Store schema** (`prisma/store-schema.prisma`) — Storefront domain
   - Models: Order (cart), Payment (gateway), Part (SKU/price), Customer, Mechanic,
     Supplier, Warehouse, StockMovement, Shipment, Return, etc.
   - Prisma client: `storeDb` (from `@/lib/store-db`)
   - DB: `heavix_store` (PostgreSQL)

### The dual-schema is INTENTIONAL

Models with the same name (Order, Payment, Part) exist in BOTH schemas with
DIFFERENT field shapes because they serve different business domains:

| Model | Main schema (marketplace) | Store schema (storefront) |
|---|---|---|
| Order | `dealId`, `titleSnapshot`, `priceSnapshot` (BigInt), `commissionRate` | `customerId`, `subtotalUsd` (Float), `shippingUsd`, `totalIrr` |
| Payment | `userId`, `amount` (BigInt), `type` (SUBSCRIPTION/FEATURED_LISTING) | `orderId`, `amountIrr` (Float), `method` (CARD/WALLET), `gateway` |
| Part | `partNumber`, `oemNumber`, `condition`, `status` | `sku`, `priceUsd` (Float), `stock`, `compatibleCars` |

**No silent merge between main/store is permitted.** Each model belongs to exactly
one database, and the resource config's `database` field declares ownership.

## Decision

### 1. Resource Config Database Ownership

Every `AdminResourceConfig` MUST declare `database: 'main' | 'store'`:

- **Main-schema resources** (`database: 'main'`): Listing, Product, Order, Payment,
  User, Company, Brand, Machine, Review, Part
  - Managed via Universal Resource Engine (Table/Form/Detail/Actions/Bulk/Export)
  - Prisma client: `db`
  - API: `/api/admin/resources/{key}` (Universal) + dedicated routes where richer
    includes or custom semantics are needed (e.g., `/api/admin/payments/[id]`)

- **Store-schema resources** (`database: 'store'`): Inventory, Warehouses, Returns,
  Procurement, Customers, Mechanics, Suppliers, CarModels, Currency, Services,
  StoreCategories, StoreBrands, Shipments, Rentals
  - Managed via Universal Resource Engine (same components)
  - Prisma client: `storeDb`
  - API: `/api/admin/resources/{key}` (Universal) + dedicated store routes
    (`/api/admin/store/{key}`) for storefront-specific operations

### 2. Storefront Order/Payment/Part are NOT managed by Universal Engine

Store-schema Order, Payment, and Part are managed via **dedicated store routes**
(`/api/admin/store/orders`, `/api/admin/store/payments`, `/api/admin/store/parts`),
NOT via the Universal Resource Engine. This is because:

- Storefront orders have different lifecycle (cart → checkout → shipment)
- Storefront payments integrate with Zarinpal gateway (authority, refId, gatewayUrl)
- Storefront parts have inventory/stock semantics (stock, lowStockThreshold)

The Universal Resource Engine manages the MARKETPLACE versions (main schema).

### 3. Action Engine DB Routing (P4 Remediation)

**Bug fixed:** `action-engine.ts` and `bulk-export-engine.ts` previously used
`(db as any)[config.model]` which ONLY accessed the main database. Store-domain
resources with actions (inventory.adjust, warehouses.activate, returns.approve,
etc.) silently failed because their models exist only in `storeDb`.

**Fix:** Both engines now use `getPrismaModel(config)` from `data-adapter.ts`,
which routes to the correct Prisma client based on `config.database`:

```typescript
// data-adapter.ts (exported)
export function getPrismaModel(config: AdminResourceConfig): any {
  const modelKey = config.model.charAt(0).toLowerCase() + config.model.slice(1);
  const client = config.database === 'store' ? storeDb : db;
  const model = (client as any)[modelKey];
  if (!model) {
    const schema = config.database === 'store' ? 'store-schema' : 'main schema';
    throw new Error(`Prisma model "${modelKey}" not found in ${schema}`);
  }
  return model;
}

// action-engine.ts — executeAction()
const model = getPrismaModel(config);  // was: (db as any)[config.model]
// ...
before.__prismaModel = model;  // tagged for handlers

// action-engine.ts — all handlers
const model = (item as any).__prismaModel;  // was: (db as any)[getModelName(item.__model)]

// bulk-export-engine.ts — executeExport()
const model = getPrismaModel(config);  // was: (db as any)[config.model]
```

### 4. Universal Action Endpoint is the Canonical Path

The admin UI (`universal-detail.tsx`) invokes actions via:
```
POST /api/admin/resources/{key}/{id}/action  →  executeAction()  →  actionHandlers
```

The `apiPath` field in action configs is metadata only (not used by the UI).
All actions go through the Universal action endpoint, which routes to the
correct database via `getPrismaModel(config)`.

### 5. Monitoring

- **Store-domain resources**: monitored via `store-monitoring-registry.ts`
  (13 resources, real health checks: count + latency + dbReachable)
- **Main-schema resources**: monitored via `marketplace-monitoring-registry.ts`
  (7 priority resources, same real health check pattern)

## Consequences

- Store-domain resource actions now WORK (previously silent failure)
- Database ownership is explicit and unambiguous
- The Universal Resource Engine is the single admin layer for BOTH domains
- The `STORE-MARKETPLACE-CONTROL-PLANE.md` claim that Control Planes are "NOT part
  of the Universal Resource Engine" is superseded by this ADR — they ARE part of
  the Universal Resource Engine, registered in `resource-index.ts`

## Verification

- typecheck: PASS (0 errors)
- lint: PASS (0 errors)
- tests: 2337 passed | 8 skipped | 0 failed
- security: 205/205 PASS (auth-boundary 162 + permissions 43)
- build: PASS
- runtime smoke: PASS (all routes return correct HTTP codes)
- Action engine DB routing: VERIFIED (getPrismaModel routes based on config.database)
