# PR-SC-00 — Universal API Tenant Scoping (BLOCKER-A4 Fix)

- **Branch:** `security/pr-sc-00-tenant-scoping`
- **Base:** `main` @ `4566efd`
- **Type:** P0 security fix — row-level authorization
- **Date:** 2026-10-09 (STEP 11.30 Phase B)
- **ADR basis:** ADR-005-amendment-01 (BLOCKER-A4)

## Problem (BLOCKER-A4)

The Universal Resource API (`src/app/api/admin/resources/[resource]/...`) enforced only **action-level** authorization ("can user X do `.read` on resource Y?") but NOT **row-level** authorization ("can user X access THIS SPECIFIC row?"). The helpers `requireOwnership` (admin-guard.ts:112) and `canAccessResource` (authorization/index.ts:172) existed but had **zero callers** in the universal routes.

**Concrete impact:** a SELLER with `listing.read` could LIST/GET any listing; with `listing.update` could PATCH any listing; with `listing.delete` could DELETE any listing — across ALL sellers. A seller could also CREATE a listing claiming another seller's id as the owner, or UPDATE a listing to reassign its `sellerId` to another user.

This was independently verified in STEP 11.29 by the /expert review and re-confirmed in STEP 11.30 Phase A by grep: `requireOwnership` + `canAccessResource` + `buildTenantWhere` had 0 callers in `src/app/api/admin/resources/`.

## Fix

### 1. New config field — `AdminResourceConfig.ownership` (types.ts)

```ts
ownership?: {
  ownerField?: string;           // direct: column holding owner's userId (e.g. 'sellerId')
  relation?: { field: string; ownerField: string }; // indirect: Lead.listing.sellerId
  moderatePermission?: string;   // permission granting cross-tenant visibility
};
```

If omitted, the resource is treated as NOT seller-scoped and current (action-level only) behavior is preserved (no breakage).

### 2. New module — `src/lib/admin/tenant-scope.ts` (pure functions)

- `buildTenantWhere(config, ctx)` → Prisma `where` fragment (or `denyAll` sentinel)
- `mergeTenantWhere(existingWhere, tenant)` → AND-merges; `denyAll` → unsatisfiable `id` clause
- `assertCreateOwner(config, ctx, payload)` → rejects cross-tenant create; injects authenticated userId when payload omits ownerField
- `checkRowOwnership(config, ctx, row, resolvedOwner?)` → fail-closed ownership check on a loaded row

**Fail-closed contract:** if ownership is declared but the owner field cannot be resolved, the row is treated as NOT owned → denied (404 on read, 403 on write). Never silently exposed. Anonymous user on a seller-scoped resource → `denyAll`.

### 3. Data-adapter wiring (data-adapter.ts)

All 5 functions accept an optional `tenantCtx`:
- `listResources` — merges tenant filter into both `findMany.where` and `count.where` (so pagination total is correct)
- `getResource` — uses `findFirst({ where: { id, ...tenantFilter } })` instead of `findUnique` when tenantCtx present (non-owner → null → 404)
- `createResource` — `assertCreateOwner` rejects cross-tenant create; injects authenticated userId when ownerField omitted
- `updateResource` — tenant filter on the persisted-record load (both transactional SELECT FOR UPDATE path AND non-transactional store-DB path); defense-in-depth `checkRowOwnership` re-check on the locked row; rejects owner-field reassignment
- `deleteResource` — `findFirst` ownership pre-check before delete; non-owner → 404

### 4. Route-handler wiring (5 routes)

Each of the 5 universal routes resolves a server-side `TenantAccessContext` (userId from the authenticated session; `isAdmin` + `hasModeratePerm` via RBAC — **never** from request body/query) and passes it to the data-adapter:
- `[resource]/route.ts` — GET (list), POST (create)
- `[resource]/[id]/route.ts` — GET (detail), PATCH (update), DELETE
- `[resource]/bulk/route.ts` — POST (bulk action; tenantCtx threaded into `executeAction` per-item)
- `[resource]/export/route.ts` — GET (export; tenant filter on the export query)
- `[resource]/[id]/action/route.ts` — POST (action; `executeAction` checks ownership after loading the row)

`ActionContext` extended with optional `tenantCtx`; `executeAction` calls `checkRowOwnership` after loading `before`.

### 5. First protected resource — Listing

`listingConfig.ownership = { ownerField: 'sellerId', moderatePermission: 'listing.moderate' }`.

This is the primary seller-owned resource. SELLER now sees only their own listings; ADMIN sees all; MODERATOR (with `listing.moderate`) sees all.

## Resource ownership registry (transparency)

| Resource | Seller-scoped? | Ownership config in this PR? | Why |
|---|---|---|---|
| **listings** | YES | ✅ `{ ownerField: 'sellerId', moderate: 'listing.moderate' }` | Primary seller-owned resource |
| brands | No (reference data) | No | Catalog — sellers browse, not own |
| users | No (admin-managed) | No | Admin-only resource |
| companies | Partial (member-based) | No — follow-up | Complex ownership (Company → users[]); needs its own design PR |
| parts | Store-DB | No — follow-up | Store-domain; cross-DB ownership resolution needed |
| orders/payments | Store-DB | No — follow-up | Store-domain; tied to company/store not userId |
| deals/rfqs/offers | Marketplace | No — follow-up | Relation-based ownership; each needs a relation config |
| inspections/transports/disputes/buy-requests | Marketplace | No — follow-up | Relation-based ownership |
| store-domain (inventory, warehouses, returns, etc.) | Store-DB | No — follow-up | Store-domain; company-scoped not user-scoped |

**Follow-up PRs** will add `ownership` config to each seller-scoped resource. The mechanism is general (direct ownerField + relation-based + moderate-permission bypass); adding config is additive (no code change). The gate per the STEP 11.30 directive: **no seller-scoped UI feature dependent on a resource ships until that resource has ownership config + a passing negative test**.

## Tests

### Unit tests (run in CI) — `tests/security/tenant-scope.test.ts` (40 tests)
Pure-function logic: all branches of `buildTenantWhere`, `mergeTenantWhere`, `assertCreateOwner`, `checkRowOwnership` — no DB, no I/O. Covers: no-ownership, admin bypass, moderator bypass, direct ownerField, relation ownership, fail-closed on anonymous, fail-closed on misconfigured ownership, AND-merge semantics, create-owner assertion, row-ownership check. Plus 3 tests asserting the real `listingConfig` has ownership declared.

### Wiring contract tests (run in CI) — `tests/security/tenant-scope-wiring.test.ts` (11 tests)
Mocks the Prisma model via a Proxy and verifies the data-adapter threads the tenant filter into the actual `findMany`/`count`/`findFirst`/`findUnique`/`delete` calls. Catches regressions where a refactor drops the `tenantCtx` parameter.

### Integration test (requires PostgreSQL) — `tests/integration/tenant-scope-real.ts` (13 assertions)
Real-API-path test: creates two sellers + admin, creates listings owned by each, then exercises LIST/GET/UPDATE/DELETE/CREATE via the real data-adapter functions. Asserts:
- Seller A cannot list/get/update/delete Seller B's listing (NEGATIVE)
- Seller A can list/get/update/delete their own (POSITIVE)
- Admin can access all (POSITIVE)
- Seller A cannot create with sellerId = B (NEGATIVE)
- Seller A cannot reassign sellerId to B via update (NEGATIVE)
- Seller A create injects their own sellerId (POSITIVE)

**Not run in CI** (CI has no seller seed + the existing `tests/integration/*-real.ts` pattern). Requires `DATABASE_URL` + schema push. Follows the exact pattern of `tests/integration/readonly-when-concurrency-real.ts`.

## Verification (this sandbox — no PostgreSQL available)

- ✅ `prisma validate` — schema valid (no schema change in this PR)
- ✅ `tsc --noEmit` — 0 type errors
- ✅ `eslint` (changed files) — clean
- ✅ `tests/security/tenant-scope.test.ts` — 40/40 pass
- ✅ `tests/security/tenant-scope-wiring.test.ts` — 11/11 pass
- ✅ existing `tests/security/permissions.test.ts` + `tests/unit/rbac.test.ts` — no regressions
- ⏳ `tests/integration/tenant-scope-real.ts` — written, requires PostgreSQL (not available in this sandbox; run in a PG environment to verify the real API path)

## Migration review

- **Schema change:** NONE. This PR is code + config + tests only. No `prisma/schema.prisma` change.
- **Permissions change:** NONE. No new permission keys. Uses existing `listing.moderate` for the moderate bypass.
- **Behavioral change:** sellers now see only their own listings via the universal API (previously all). Admin/moderator behavior unchanged. This is the intended security fix.
- **Rollback:** revert the PR. No data is modified.

## Definition of Done

- [x] IMPLEMENTED: code + tests + docs committed
- [x] FUNCTIONAL: typecheck + lint + 51 unit/wiring tests pass; CI pending
- [ ] VERIFIED: integration test (real API path) must pass in a PG environment; independent /Critic review
- [ ] COMPLETE: merged (requires owner decision — NOT in this step)

## Gate (per STEP 11.30 directive)

Until `tests/integration/tenant-scope-real.ts` passes in a PostgreSQL environment AND an independent review confirms the wiring, **no seller-scoped UI feature dependent on the Universal Resource API is approved for release**. The mechanism + Listing config + unit/wiring proofs are in place; the real-DB proof is the remaining gate.
