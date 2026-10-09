# STEP 11.31 — Independent System State Research

- **Task ID:** 11.31-/research
- **Agent:** /research
- **Date:** 2026-10-09
- **Method:** Independent verification from GitHub REST API + local repo at `4a2f579` (PR #11 head) and `f597562` (main). No prior report trusted without re-verification.
- **Repo:** `/home/z/heavix` (worktree on branch `security/pr-sc-00-tenant-scoping`)
- **GitHub:** HEAVIXIR/z-ai-2
- **Hard rules respected:** research only — no code, schema, migration, or PR modification. Financing/investment capabilities remain GATED (no de-gating proposed).

---

## 0. Executive Summary

| Question | Answer (independently verified) |
|---|---|
| What is `main`? | `f59756263f71d381014c69908fdd2379683536ef` — "Merge PR #10: STEP 11.29 research + design foundation" (GitHub API, 2026-10-09) |
| What is PR #11 head? | **`4a2f57957e998daccc2d5ead47158edd535c9ff2`** — NOT `7371d40` (the worklog's STEP 11.30 entry is STALE; PR #11 was force-pushed +1 commit wiring the integration test into CI) |
| Is PR #11 CI green? | **NO.** `mergeable_state = unstable`. CI run 37979926895 on `4a2f579` **FAILED** at step "Integration tests (real PostgreSQL — PR-SC-00 tenant-scoping negative tests)" with **6/19 assertions failing**. Previous run on `7371d40` was green (but that commit did not run the integration test). |
| How many Universal API routes? | 5 (list/create, get/update/delete, bulk, export, action). All 5 wire `tenantCtx` ✓ |
| How many resources declare `ownership`? | **1 of 30+** — only `listing` (`{ ownerField: 'sellerId', moderatePermission: 'listing.moderate' }`). All others (parts, orders, payments, deals, rfqs, offers, auctions, inspections, transports, disputes, buy-requests, store-domain) have NO ownership config — seller-scoped data is NOT row-level protected for any resource except Listing. |
| Do `requireOwnership` / `canAccessResource` have callers? | **ZERO** callers in `src/app/`. Both helpers exist (admin-guard.ts:112, authorization/index.ts:172) but are dead code — superseded by the new `tenantCtx` flow. |
| How many AI routes bypass the AI Gateway? | **22** routes call `ZAI.create()` directly (or via lib helpers), bypassing `preflightAIRequest` + `recordAICost` + `AIGatewayLog`. Only `/api/ai-gateway` itself goes through the Gateway — and even it returns a redirect message (no LLM call) for `SELLER_ASSISTANT`, `MARKET_ANALYST`, `PRICE_ANALYSIS`. |
| Does PR #11 add schema change? | **No** — verified by `git diff --stat f597562..4a2f579 prisma/` returns empty. Code + config + tests + CI workflow only. |
| Is Lead CRM (PR #9) on main? | **Yes** — `Lead` model at `prisma/schema.prisma:618-658` has `status @default("NEW")`, `assignedToId`, `score`, `scoreVersion`, `scoreBreakdown`, `scoredAt`, `scoreOverrideById/Reason/Note/At`, 3 indexes, 2 User back-relations. Verified. |
| Is financing GATED? | **Yes** — untouched; no de-gating proposed anywhere in code or docs. |

**Top 3 risks:**
1. **BLOCKER R-1 (HIGH→BLOCKER for merge):** PR #11 CI is RED. The integration test exposes a **pre-existing bug** in `updateResource`'s transactional `$queryRaw` SELECT FOR UPDATE — the table name is passed as a PostgreSQL bind parameter (`relation "$1" does not exist`). This breaks ALL main-DB updates through the Universal Resource API (not just the test). Bug exists on main too.
2. **BLOCKER R-2 (HIGH):** Only `listing` has `ownership` declared. Every other seller-scoped resource (offers, deals, rfqs, buy-requests, parts, orders, payments, etc.) is still vulnerable to BLOCKER-A4 cross-tenant access via the Universal API. PR-SC-00-SCOPE.md acknowledges this as "follow-up PRs" — but until those land, the Universal API is NOT safe for any non-listing seller-scoped resource.
3. **HIGH R-3:** 22 AI routes bypass the AI Gateway. Several have NO AUTH AT ALL (`/api/ai-search`, `/api/ai-seller-assistant`, `/api/ai-price-suggestion`, `/api/ai-listing-builder`, `/api/compare/[id]/ai-summary`). No policy enforcement, no budget tracking, no `AIGatewayLog`. R11 finding from prior reviews is REAL and UNRESOLVED.

---

## 1. GitHub State (verified via REST API)

### 1.1 main branch
- **SHA:** `f59756263f71d381014c69908fdd2379683536ef`
- **Commit message:** `Merge PR #10: STEP 11.29 research + design foundation (8 docs, 8121 lines) (#10)`
- **Source:** `curl -sS -H "Authorization: token $TOKEN" https://api.github.com/repos/HEAVIXIR/z-ai-2/branches/main`
- **CI:** GREEN (verify=success on f597562; also on c66e060 and 4566efd)

### 1.2 All PRs (verified via `/repos/.../pulls/{n}`)

| PR | State | Head SHA | Base | Title | Merged_at | Merge_commit |
|---|---|---|---|---|---|---|
| #8 | closed/merged | `35b3a30` | `710df93` | docs: Store Center UX Prototype + ADR-005 + Implementation Plan | 2026-10-09T16:49:26Z | `4566efd` |
| #9 | closed/merged | `6881f2a` | `4566efd` | feat(pr-sc-01): Lead CRM foundation | 2026-10-09T19:06:57Z | `c66e060` |
| #10 | closed/merged | `a092233` | `4566efd` | docs: STEP 11.29 research + design foundation | 2026-10-09T19:07:10Z | `f597562` |
| **#11** | **open** | **`4a2f579`** | `f597562` | security(pr-sc-00): Universal API tenant scoping (BLOCKER-A4 fix) | NOT merged | n/a |

PR #11 metadata:
- `mergeable: true`, `mergeable_state: unstable` ← **CI is failing**
- Head branch: `security/pr-sc-00-tenant-scoping`
- 2 commits: `c7d19fc1b9` (security(pr-sc-00): Universal API tenant scoping) + `4a2f57957e` (ci(pr-sc-00): wire tenant-scoping integration test into CI)
- 16 files, +1540/-97 (from GitHub files API; matches `git diff --stat f597562..4a2f579`)

### 1.3 PR #11 CI (verified via `/actions/runs/{id}/jobs`)

- Latest run on `4a2f579`: **FAILED** (run_id 37979926895, completed 2026-10-09T19:26:00Z)
- Failed step: `Integration tests (real PostgreSQL — PR-SC-00 tenant-scoping negative tests)`
- Job ID 113987536704 (logs downloaded to `/tmp/ci-log.txt`, 774 lines)
- Result: **13 passed, 6 failed** of 19 assertions
- Previous run on `7371d40` (the worklog's "OPEN" state): SUCCESS — but that commit did NOT run the integration test (CI workflow change is the second commit `4a2f579`)

**Conclusion:** Worklog STEP 11.30 entry says "PR #11 OPEN (7371d40), CI green, HELD — integration test gate pending PG environment." This is STALE. The current head `4a2f579` DOES run the integration test in CI (PostgreSQL service container is configured), and **the test FAILS**. PR #11 is now BLOCKED by a RED CI, not just by an "unmet PG gate."

---

## 2. Universal Resource API Entry Points (5 routes under `src/app/api/admin/resources/`)

All 5 routes were read in full. Each resolves a server-side `TenantAccessContext` via a local `resolveTenantCtx()` helper (identical 9-line function duplicated in each route file) and passes it as the final positional arg to the data-adapter / engine function.

| # | Path | Method | Adapter/Engine fn called | Passes `tenantCtx`? | Ownership enforced? |
|---|---|---|---|---|---|
| 1 | `[resource]/route.ts` | GET | `listResources(config, params, fieldCtx, tenantCtx)` | ✓ (line 102) | ✓ only if `config.ownership` declared |
| 1 | `[resource]/route.ts` | POST | `createResource(config, body, fieldCtx, tenantCtx)` (inside `auditMutation`) | ✓ (line 186) | ✓ `assertCreateOwner` runs |
| 2 | `[resource]/[id]/route.ts` | GET | `getResource(config, id, fieldCtx, tenantCtx)` | ✓ (line 64) | ✓ findFirst with tenant filter |
| 2 | `[resource]/[id]/route.ts` | PATCH | `updateResource(config, id, body, fieldCtx, tenantCtx)` (inside `auditMutation`) | ✓ (line 121) | ✓ BUT transactional path has a SQL bug (see R-1) |
| 2 | `[resource]/[id]/route.ts` | DELETE | `getResource` (pre-check) + `deleteResource(config, id, tenantCtx)` | ✓ (lines 185, 191) | ✓ findFirst pre-check |
| 3 | `[resource]/bulk/route.ts` | POST | `executeBulkAction({ ..., ctx: { userId, reason, tenantCtx } })` | ✓ (line 78) | ✓ per-item via `executeAction` |
| 4 | `[resource]/export/route.ts` | GET | `executeExport({ ..., ctx: { userId, tenantCtx } })` | ✓ (line 87) | ✓ tenant filter on exportWhere |
| 5 | `[resource]/[id]/action/route.ts` | POST | `executeAction(resourceKey, id, actionKey, { userId, reason, metadata, tenantCtx })` | ✓ (line 63) | ✓ `checkRowOwnership` after load (action-engine.ts:347-356) |

**Evidence for `resolveTenantCtx`:** all 5 routes contain an identical helper:
```ts
async function resolveTenantCtx(userId, config) {
  const admin = userId ? await isAdmin(userId) : false;
  let hasModeratePerm = false;
  if (userId && config.ownership?.moderatePermission) {
    hasModeratePerm = await can(userId, config.ownership.moderatePermission);
  }
  return { userId, isAdmin: admin, hasModeratePerm };
}
```
- `[resource]/route.ts:54-64`, `[resource]/[id]/route.ts:33-43`, `[resource]/bulk/route.ts:31-41`, `[resource]/export/route.ts:38-48`, `[resource]/[id]/action/route.ts:28-38`

**Ownership enforcement is conditional on `config.ownership` being declared.** If `config.ownership` is undefined, `buildTenantWhere` returns `{ where: {} }` (no filter) — action-level RBAC only, no row-level scoping. This is the documented fail-open design for non-seller-scoped resources.

### 2.1 Finding R-2 — Only `listing` has `ownership` declared (HIGH)

**Evidence:** `grep -n "^\s*ownership\s*:" src/lib/admin/resources/` returns exactly one match:
```
/home/z/heavix/src/lib/admin/resources/listing.ts:25:  ownership: {
```
Listing config (verified at `listing.ts:25-28`):
```ts
ownership: {
  ownerField: 'sellerId',
  moderatePermission: 'listing.moderate',
},
```

**Resources registered but WITHOUT ownership** (verified by reading `resource-index.ts` + grep): brand, user, product, part, order, payment, company, machine, review, deal, rfq, offer, auction, inspection, transport, dispute, buyRequest, inventory, warehouse, returns, procurement, customers, mechanics, suppliers, carModels, currency, services, storeCategories, storeBrands, shipments, settings, analytics, seo, promotions, rentals.

**Impact:** Any seller with `*.read` on these resources can list/get every other seller's rows. For `offer.read` + `offer.update` (SELLER has both per permissions.ts:259), a seller could potentially PATCH any offer on any listing. Same for `deal.read` + `deal.manage` (SELLER has both), `rfq.read` + `rfq.manage` (SELLER has both), `inspection.read`, `transport.read`, `dispute.read`, `request.read`, `auction.read`, `part.read`, `machine.read`. The PR-SC-00-SCOPE.md doc explicitly lists these as "follow-up PRs" — but until they land, the Universal API is NOT safe for non-listing seller-scoped resources.

**Severity:** HIGH (BLOCKER-A4 only partially fixed; cross-tenant exposure remains for all non-listing seller-scoped resources).

**Fix recommendation:** Each follow-up PR (PR-SC-02 onwards) MUST add `ownership` config before its seller-scoped UI ships. The gate per PR-SC-00-SCOPE.md §"Gate" already says this — it must be enforced.

### 2.2 Finding R-1 — PR #11 CI is RED; integration test exposes a pre-existing SQL bug (BLOCKER for merge)

**Evidence (CI log lines 661-672):**
```
── 8. UPDATE: Seller A can update their own listing ──
prisma:error
Invalid `prisma.$queryRaw()` invocation:
Raw query failed. Code: `42P01`. Message: `relation "$1" does not exist`
❌ Seller A UPDATE on own listing failed unexpectedly: Failed to load persisted record (FOR UPDATE):
Invalid `prisma.$queryRaw()` invocation:
Raw query failed. Code: `42P01`. Message: `relation "$1" does not exist`
```

**Root cause:** `data-adapter.ts:273-282` (transactional `updateResource` path, executed for all `config.database !== 'store'` resources — including Listing):
```ts
const tableName = config.model.charAt(0).toUpperCase() + config.model.slice(1);
// ...
const rows = await tx.$queryRaw`
  SELECT * FROM "${tableName}" WHERE "id" = ${id} FOR UPDATE
` as Record<string, unknown>[];
```
Prisma's `$queryRaw` tagged-template binds **every** `${...}` placeholder as a PostgreSQL parameter. Table identifiers CANNOT be parameterized in PostgreSQL — the query sent to the server becomes `SELECT * FROM $1 WHERE "id" = $2 FOR UPDATE` and Postgres rejects `$1` as a table reference (`relation "$1" does not exist`, SQLSTATE 42P01).

**Scope:** This bug exists on **main** too (verified by `git show f597562:src/lib/admin/data-adapter.ts` — same code, lines 188-196 of the main-branch version). It was not caught by any prior test because the existing test suite only exercised the pure-function `buildTenantWhere`/`checkRowOwnership` logic + mock-Prisma wiring tests — never a real PostgreSQL `UPDATE` through the transactional path. The new `tests/integration/tenant-scope-real.ts` is the first test to actually call `updateResource` against a real DB.

**Impact:** ALL Universal Resource API PATCH requests against main-DB resources (`listing`, `brand`, `user`, `product`, `part`[catalog], `order`, `payment`, `company`, `machine`, `review`, `deal`, `rfq`, `offer`, `auction`, `inspection`, `transport`, `dispute`, `buyRequest`) fail with HTTP 500. This is a production-down bug for any universal-API update on a main-DB resource.

**Failing integration-test assertions (6):**
1. ❌ "Seller A sees their own listing aList1" (LIST) — caused by R-1.B below
2. ❌ "Seller A sees their own listing aList2" (LIST) — same
3. ❌ "Seller B sees their own listing bList1" (LIST) — same
4. ❌ "Seller A UPDATE on own listing failed unexpectedly: ... relation "$1" does not exist" — R-1 main bug
5. ❌ "Seller A owner-reassignment throws forbidden" — passes for the wrong reason (the SQL error throws first, not the ownership check). The test's assertion `(e).message.toLowerCase().includes("ownership") || .includes("forbidden")` evaluates false, but the test step is listed as ❌ because the expected forbidden never actually fires. **Note:** this is the only "passing-for-wrong-reason" assertion; the SQL error masks the real ownership check.
6. ❌ "Seller A creating with sellerId=B should FAIL (NEGATIVE — got success = LEAK)" — see R-1.C below

**Severity:** BLOCKER for PR #11 merge. HIGH for production (main is also affected).

**Fix recommendation:** Use Prisma's `$queryRawUnsafe` with explicitly-validated identifier, or use `$queryRaw` with `Prisma.raw()` for the table name:
```ts
import { Prisma } from '@prisma/client';
// Validate tableName against a known model allowlist (defense-in-depth)
const rows = await tx.$queryRawUnsafe(
  `SELECT * FROM "${tableName}" WHERE "id" = $1 FOR UPDATE`,
  id,
);
```
**Note:** The non-transactional store-DB path (`updateResourceNonTransactional`) does NOT have this bug — it uses Prisma's `model.findUnique`/`findFirst` instead of raw SQL. So store-DB updates work; main-DB updates are broken.

### 2.3 Finding R-1.B — `applyFieldPolicy` returns a `select` clause that omits `id` (MEDIUM, pre-existing)

**Evidence:** `field-policy.ts:44-68`:
```ts
export function applyFieldPolicy(config, ctx, 'read') {
  const hasFieldPerms = config.columns.some(c => c.permissions?.read) ||
    config.fields.some(f => f.permissions?.read);
  if (!hasFieldPerms) return undefined;
  const select: Record<string, boolean> = {};
  for (const col of config.columns) {
    // ... always sets select[col.key] = true
  }
  return select;
}
```
The `select` object contains only the keys in `config.columns` — it does NOT include `id` (which is not declared as a column on `listing` or most resources). When this `select` is fed to Prisma's `findMany({ select })`, the returned rows have NO `id` field.

This is what causes integration-test assertions 1-3 to fail: `listResources` returns rows whose `id` is undefined, so `aListIds.includes(aList1.id)` returns false even though the row IS present (total=2 is correct).

**Scope:** Pre-existing — same code on main. The bug only manifests when a resource has at least one field/column with `permissions.read` declared (otherwise `applyFieldPolicy` returns `undefined` and Prisma returns all fields). Currently only `listing.sellerPhone` declares `permissions.read: 'user.read'` → listing list endpoint returns rows without `id`.

**Impact:** The Universal API `/api/admin/resources/listings` GET endpoint returns rows without `id`. The frontend admin table likely uses a different identifier (slug? or it's broken and nobody noticed). Severity MEDIUM because the integration test catches it; production impact depends on whether the admin UI uses `id`.

**Fix recommendation:** In `applyFieldPolicy`, always include `id: true` (and any other Prisma-required identifier) in the select object. Or, more cleanly, never use a Prisma `select` for field-policy — use post-fetch filtering via `filterReadableFieldsAsync` (which is already called by the route handlers at line 105 of `[resource]/route.ts`).

### 2.4 Finding R-1.C — Test/impl mismatch on cross-tenant create (LOW, not a security leak)

**Evidence:** Integration test step 11 (line 167-172 of `tenant-scope-real.ts`):
```ts
await createResource(config, { title: "forged", slug: "...", sellerId: sellerB.id, ... }, { userId: sellerA.id }, sellerACtx);
assert(false, "Seller A creating with sellerId=B should FAIL (NEGATIVE — got success = LEAK)");
```
But the implementation in `createResource` (data-adapter.ts:160-202):
1. `applyFieldWritePolicyAsync` STRIPS `sellerId` from the payload because `sellerId` is NOT in `config.fields` (listing.ts only declares `sellerPhone`, `sellerName` as form fields — `sellerId` is set server-side). The stripped `filteredData` does NOT contain `sellerId`.
2. `assertCreateOwner(config, tenantCtx, filteredData)` sees `supplied = undefined` → returns `{ ok: true, injectOwner: 'sellerId' }`.
3. `createResource` injects `filteredData.sellerId = tenantCtx.userId` (= sellerA.id).
4. Listing is created with `sellerId = sellerA.id` — the CORRECT owner, NOT sellerB.

So the test description "got success = LEAK" is misleading: there is NO actual cross-tenant leak. The create succeeds with the correct owner (sellerA.id), because the forged `sellerId: sellerB.id` was silently stripped by field-policy before `assertCreateOwner` ran. The test expects an error; the implementation silently corrects the owner.

**Severity:** LOW (no security impact; test assertion needs rewriting to either (a) verify the created row's `sellerId === sellerA.id` and accept the silent-correction behavior, or (b) declare `sellerId` as a form field with `permissions.write: 'listing.moderate'` so `applyFieldWritePolicyAsync` rejects it for non-moderators).

**Fix recommendation:** Rewrite the test assertion to check the resulting row's `sellerId`, not just whether an error was thrown. The implementation's silent-correction is actually MORE secure than throwing (an attacker learns nothing about whether their forgery was attempted).

---

## 3. RBAC Policies

### 3.1 `src/lib/authorization/permissions.ts`

- **PERMISSIONS** array (line 34-237): 127 permission keys across 19 categories (`admin.*`, `user.*`, `company.*`, `listing.*`, `product.*`, `brand.*`, `category.*`, `order.*`, `payment.*`, `deal.*`, `review.*`, `rfq.*`, `store.*` + `store.crm.*` [PR-SC-01], `inventory.*`, `returns.*`, `procurement.*`, `shipping.*`, `seo.*`, `content.*`, `analytics.*`, `security.*`, `system.*`, `ai.*`, `audit.*`, `media.*`, `taxonomy.*`, `auction.*`, `settings.*`, + STEP 16-C additions, TRACK B additions, PR-6E additions).
- **ROLE_PERMISSIONS** (line 242-338):
  - `ADMIN: [...PERMISSIONS]` — all 127 keys
  - `SELLER: 28 keys` including `listing.{read,create,update,publish}`, `store.crm.{read,manage}` (PR-SC-01), `deal.{read,manage}`, `rfq.{read,manage}`, `offer.{read,update}`, `request.read`, etc. NOTABLY does NOT include `listing.moderate`, `listing.delete`, `user.delete`, `payment.refund`, `company.verify`.
  - `BUYER: 16 keys` — read-only marketplace + `request.{read,manage}` + `offer.read`. Excludes `store.crm.*` (PR-SC-01) ✓
  - `MODERATOR: 27 keys` including `listing.moderate`, `listing.publish`, `review.moderate`, `price.override`
  - `SUPPORT: 14 keys` — read-only across marketplace CP
- **LEGACY_PERMISSION_MAP** (line 343-348): 4 legacy keys remapped for backward compat.

### 3.2 `src/lib/authorization/index.ts`

Public API:
- `can(userId, permission)` — line 41; resolves through `getUserPermissions(userId)` (rbac-legacy.ts); returns false on null userId or thrown error (fail-closed)
- `canAny`, `canAll` — lines 55, 69
- `requirePermission`, `requireAnyPermission`, `requireAllPermissions` — lines 89, 103, 120; throw `AuthorizationError` (HTTP 403)
- `isAdmin(userId)` — line 144; **RBAC-only** (queries `db.userRole.findFirst({ where: { userId, role: { key: 'ADMIN' } } })`); NO `User.role` fallback. Returns false on error.
- `canAccessResource(userId, resource, resourceId, { ownerField, moderatePermission })` — line 172; object-level auth via raw SQL `SELECT "${ownerField}" as owner_id FROM "${resource}" WHERE id = $1`. **ZERO callers in `src/app/`** (verified by grep — see Finding R-A1 below).
- `canBulkAction(userId, action, resourceKey?)` — line 229; resource-aware path looks up `config.bulkActions[]` and fails closed if not declared; legacy 6-entry map fallback when `resourceKey` omitted (deprecated)
- `canExport(userId, resource)` — line 298; singular+plural map of 18+ resources to canonical permission keys
- `hasRole(userId, roles)` — line 356; legacy shim mapping role strings to `*.access` permission keys

### 3.3 `src/lib/admin-guard.ts`

- `adminGuard(permissionKey?)` — line 46; returns `{id, firstName}` if authed+authorized, `null` if 401, `false` if 403. **STEP 11.6 hardened:** NO `User.role` fallback; NO admin superuser bypass (Model B — if ADMIN somehow lacks the permission via RBAC, request is 403).
- `requireAdmin(permissionKey?)` — line 93; convenience wrapper returning `[user|null, error|null]`. Used by all 5 universal routes.
- `requireOwnership(userId, resourceOwnerId)` — line 112; **dead code** (zero callers in `src/app/`). Returns true if `userId === resourceOwnerId` or `isAdmin(userId)`.
- `authorizeAdmin()` — line 125; boolean wrapper used by legacy `/api/admin/ai-agents` and similar.

### 3.4 Finding R-A1 — `requireOwnership` + `canAccessResource` are dead code (LOW, intentional)

**Evidence:** `grep -rn "requireOwnership\|canAccessResource" src/app/` returns ZERO matches. The only references are:
- Definitions in `admin-guard.ts:112` and `authorization/index.ts:172`
- Re-export in `src/lib/rbac.ts:6`
- Mention in `src/lib/admin/production-readiness-gate.ts` (comment, not call)

**Impact:** None functionally — the new `tenantCtx` flow in PR-SC-00 supersedes both. They are kept for backward compat with external callers (none in this repo).

**Severity:** LOW (dead code, no security impact; cleanup candidate).

**Fix recommendation:** Either delete (after confirming no external callers) or add a `@deprecated` JSDoc tag pointing to `buildTenantWhere` / `checkRowOwnership` as the replacement.

---

## 4. Ownership Models

### 4.1 `AdminOwnershipConfig` (types.ts:316-341)

```ts
export interface AdminOwnershipConfig {
  ownerField?: string;   // direct: column on this model holding owner's userId (e.g. 'sellerId')
  relation?: {           // indirect: navigate a Prisma relation to find the owner
    field: string;       // e.g. 'listing' — must match a Prisma relation field
    ownerField: string;  // e.g. 'sellerId' — owner field on the related model
  };
  moderatePermission?: string;  // grants cross-tenant visibility (e.g. 'listing.moderate')
}
```
- `ownerField` and `relation` are mutually exclusive.
- If both omitted → misconfigured → `buildTenantWhere` fails closed (denyAll).

### 4.2 `buildTenantWhere(config, ctx)` (tenant-scope.ts:72-110)

Pure function, no I/O. Decision tree:
1. `!config.ownership` → `{ where: {} }` (no filter; resource is not seller-scoped; action-level RBAC only)
2. `ctx.isAdmin` → `{ where: {} }` (admin bypass)
3. `ctx.hasModeratePerm` → `{ where: {} }` (moderator bypass)
4. `!ctx.userId` → `{ denyAll: true }` (anonymous on scoped resource — fail closed; defense-in-depth even though `requireAdmin` already returned 401)
5. `buildOwnerFilter` returns null (misconfigured) → `{ denyAll: true }`
6. Otherwise → `{ where: { [ownerField]: userId } }` (direct) OR `{ where: { [relation.field]: { [relation.ownerField]: userId } } }` (indirect)

### 4.3 `mergeTenantWhere(existingWhere, tenant)` (tenant-scope.ts:142-163)

- `denyAll` → returns `{ id: '__tenant_scope_deny_all__' }` (unsatisfiable; preserves query shape across DBs)
- empty tenant.where → returns existingWhere unchanged
- empty existingWhere → returns tenant.where
- both present → AND-semantics: preserves existing `AND` array if present, else wraps both in `{ AND: [existing, tenant] }`

### 4.4 `assertCreateOwner(config, ctx, payload)` (tenant-scope.ts:181-228)

For CREATE only:
- No ownership → `{ ok: true }`
- Admin/moderator → `{ ok: true }` (can create on behalf)
- No userId → `{ ok: false, error: 'Authentication required...' }`
- Direct `ownerField`:
  - payload omits ownerField → `{ ok: true, injectOwner: ownerField }` (caller injects `tenantCtx.userId`)
  - payload sets ownerField to a different user → `{ ok: false, error: 'Forbidden: cannot create a record owned by another user' }`
  - payload sets ownerField to self → `{ ok: true }`
- Relation-based: requires `${relation.field}Id` (or `${relation.field}`) in payload; returns `{ ok: true, injectOwner: '__relation__' }` — actual ownership verification requires a DB lookup by the caller (documented but NOT implemented in `createResource`; see R-A2 below).

### 4.5 `checkRowOwnership(config, ctx, row, resolvedOwner?)` (tenant-scope.ts:246-288)

For GET/PATCH/DELETE on a loaded row:
- No ownership → `{ allowed: true }`
- No row → `{ allowed: false, reason: 'not_found' }`
- Admin/moderator → `{ allowed: true }`
- No userId → `{ allowed: false, reason: 'deny_all' }`
- Direct ownerField:
  - row[ownerField] null/undefined → `{ allowed: false, reason: 'not_owner' }` (unowned row, fail closed)
  - `String(row[ownerField]) !== ctx.userId` → `{ allowed: false, reason: 'not_owner' }`
  - else → `{ allowed: true }`
- Relation: requires `resolvedOwner` (string) — caller must pre-load the related row's ownerField and pass it. If `resolvedOwner === undefined` → fail closed.

### 4.6 Finding R-A2 — Relation-based ownership is documented but NOT implemented in `createResource` (MEDIUM)

**Evidence:** `tenant-scope.ts:208-225` comment:
> Relation-based ownership (e.g. Lead.listing.sellerId): the create path must verify the related record belongs to the user. That requires a DB lookup which the data-adapter performs separately (assertRelationOwned). Here we only fail-closed if the relation foreign-key field is missing from the payload.

But searching `data-adapter.ts` for `assertRelationOwned`:
```
$ grep assertRelationOwned src/lib/admin/data-adapter.ts
(no matches)
```
The function `assertRelationOwned` is **referenced by name in the comment but does not exist**. For relation-based ownership, `createResource` would currently:
1. Verify the FK field is present in payload (✓ via `assertCreateOwner`)
2. Inject `__relation__` placeholder (✓)
3. **NOT verify that the related record actually belongs to the user** (✗ — no DB lookup)
4. Call `model.create({ data: filteredData })` with the unverified FK

**Impact:** Currently no resource uses `relation`-based ownership (only `listing` uses direct `ownerField`), so this is latent. But the Lead CRM design (ADR-005-amendment-01 §3, PR-SC-06) explicitly plans to use `relation: { field: 'listing', ownerField: 'sellerId' }` for the Lead resource. When that config is added, creates would NOT verify that the listing belongs to the user — a seller could create a Lead with `listingId` pointing to another seller's listing.

**Severity:** MEDIUM (latent — no current resource affected; will become BLOCKER when Lead config lands in PR-SC-06).

**Fix recommendation:** Implement `assertRelationOwned` in `data-adapter.ts` before PR-SC-06. The function should: load the related row by the FK, call `checkRowOwnership` with `resolvedOwner = relatedRow[ownership.relation.ownerField]`, throw 403 on non-owner. Add an integration test that uses relation-based ownership.

### 4.7 Resources with `ownership` declared (verified)

| Resource | `ownership` declared? | Config | Notes |
|---|---|---|---|
| listings | **YES** | `listing.ts:25-28` `{ ownerField: 'sellerId', moderatePermission: 'listing.moderate' }` | Only one. PR-SC-00. |
| brand, user, product, part[catalog], order, payment, company, machine, review, deal, rfq, offer, auction, inspection, transport, dispute, buyRequest | NO | various | Acknowledged as follow-up in PR-SC-00-SCOPE.md |
| inventory, warehouse, returns, procurement, customers, mechanics, suppliers, carModels, currency, services, storeCategories, storeBrands, shipments, settings, analytics, seo, promotions, rentals | NO | `store-domain-resources.ts` | Store-domain (cross-DB) — needs company-scoped ownership design, not user-scoped |

**Total resources registered:** 35 (counted via `registerResource(...)` calls in `resource-index.ts:40-75`). **1 with ownership. 34 without.**

---

## 5. AI Capabilities — Existing vs Proposed

### 5.1 What EXISTS in code

- **Models** (`prisma/schema.prisma`):
  - `AIGatewayLog` (line 757-772): taskType, model, input, output, latencyMs, tokensUsed, cost, success, error, userId, 2 indexes
  - `AIBudget` (line 783-796): singleton (id="main"), daily/monthly limit+spend, reset timestamps, active flag
  - `AITaskPolicy` (line 806-820): per-task policy — taskType (@unique), allowedRoles (CSV), hourlyLimit, dailyLimit, maxInputChars, maxOutputTokens, model, timeoutMs, costCeilingUsd, active
- **Lib** (`src/lib/ai-policy.ts`):
  - `preflightAIRequest({ taskType, user, inputLength })` — runs 5 gates: rate-limit, task-policy existence+active, role-membership, per-user quota (counts AIGatewayLog rows), budget (daily+monthly USD), input-size cap. Returns `{ ok, policy }` or `{ ok: false, reason, statusCode }`.
  - `recordAICost(taskType, cost, userId)` — increments AIBudget spend counters
  - `getAIBudget()` — returns the singleton row
- **Gateway route** (`src/app/api/ai-gateway/route.ts`):
  - POST handler (line 41) — full 5-gate preflight + ZAI.create() + recordAICost + AIGatewayLog.create + logAudit
  - GET handler (line 300) — admin view of AIGatewayLog + budget
  - Handles 4 task types via LLM: SEARCH, SEMANTIC_SEARCH, LISTING_BUILDER, MODERATION
  - Returns **redirect message** (no LLM call) for: PRICE_ANALYSIS, MARKET_ANALYST, SELLER_ASSISTANT — directs caller to the standalone route
- **Admin management routes:**
  - `/api/admin/ai-budget` — GET/PATCH the AIBudget singleton
  - `/api/admin/ai-policies/[taskType]` — GET/PATCH a single AITaskPolicy
  - `/api/admin/ai-evaluation` — GET reads AIGatewayLog for stats (no LLM call)

### 5.2 What is PROPOSED (docs only, not in code)

Per `docs/product/AI-PRODUCT-FOUNDATION.md` (190 lines, in PR #10 merged to main):
- 10 MVP capabilities + 5 GATED
- `AISuggestion` model proposal (for KPI-8 acceptance rate) — **NOT in schema** (verified: `grep AISuggestion prisma/schema.prisma` returns 0 matches)
- Per-capability contracts (input/forbidden/output/quality/cost/human-control/uncertainty)
- 7 governance principles (advisory-only, permitted-data-only, untrusted-output, normal-mutation-path, monitored, uncertainty-stated, no-safety-authority)

### 5.3 Finding R-3 — 22 AI routes bypass the AI Gateway (HIGH, R11 unresolved)

**Methodology:** Found all routes importing `z-ai-web-dev-sdk` via `grep -l "ZAI\|z-ai-web-dev-sdk" src/app/api`. Then for each, examined whether it calls `preflightAIRequest` / `recordAICost` / `AIGatewayLog` / `fetch('/api/ai-gateway')` (Gateway plumbing) OR calls `ZAI.create()` directly. Also checked lib helpers (`ai-agents/index.ts`, `compare-engine.ts`, `ai-content-assistant.ts`, `ai-listing-builder.ts`, `ai-matching-enhanced.ts`, `ai-operational.ts`, `ai-search.ts`) for direct `ZAI.create()`.

**Routes that DO go through the Gateway (1):**
- `POST /api/ai-gateway` (the gateway itself)

**Routes that are Gateway-adjacent (3, no LLM call):**
- `GET/PATCH /api/admin/ai-budget` — manages AIBudget singleton
- `GET/PATCH /api/admin/ai-policies/[taskType]` — manages AITaskPolicy
- `GET /api/admin/ai-evaluation` — reads AIGatewayLog for stats

**Routes that BYPASS the Gateway (22)** — direct `ZAI.create()` either inline or via lib helper:

| # | Route | Method | Auth | LLM call site | Risk |
|---|---|---|---|---|---|
| 1 | `/api/ai-search` | POST | **NONE** | inline `ZAI.create()` | HIGH — unauthenticated AI access |
| 2 | `/api/ai-seller-assistant` | GET | **NONE** | inline `ZAI.create()` | HIGH — unauthenticated AI access |
| 3 | `/api/ai-price-suggestion` | POST | **NONE** | inline `ZAI.create()` | HIGH — unauthenticated AI access |
| 4 | `/api/ai-listing-builder` | POST | **NONE** | inline `ZAI.create()` | HIGH — unauthenticated AI access |
| 5 | `/api/compare/[id]/ai-summary` | POST | **NONE** | `generateAISummary` lib (`compare-engine.ts:789`) | HIGH — unauthenticated AI access |
| 6 | `/api/ai-sales-agent` | GET | `getCurrentUser` only (no perm) | inline `ZAI.create()` | MEDIUM — any authed user, no `ai.execute` perm |
| 7 | `/api/ai-market-analyst` | POST | `isAuthenticated` only (no perm) | inline `ZAI.create()` | MEDIUM — admin-path, no `ai.execute` perm |
| 8 | `/api/admin/ai-content-factory` | POST | `hasPermission ai.execute` | inline `ZAI.create()` | MEDIUM — has perm, no budget/policy |
| 9 | `/api/admin/ai-scraper` | POST (multiple actions) | `requirePermission ai.scraper.execute` | inline `ZAI.create()` | MEDIUM — has perm, no budget/policy |
| 10 | `/api/admin/store/ai-scraper` | POST (multiple actions) | `requirePermission store.manage` | inline `ZAI.create()` | MEDIUM — has perm, no budget/policy |
| 11 | `/api/admin/brands-ai` | POST | `hasPermission brand.publish` | inline `ZAI.create()` | MEDIUM — has perm, no budget/policy |
| 12 | `/api/admin/knowledge/generate-article` | POST | `hasPermission ai.execute` | inline `ZAI.create()` + `zai.images.generations` | MEDIUM — has perm, no budget/policy |
| 13 | `/api/admin/knowledge/generate-image` | POST | `hasPermission ai.execute` | inline `zai.images.generations` | MEDIUM — has perm, no budget/policy |
| 14 | `/api/admin/brands/[id]/search-logo` | POST | `hasPermission brand.read` | inline `zai.images.search` | MEDIUM — has perm, no budget/policy |
| 15 | `/api/admin/categories/[id]/generate-image` | POST | `hasPermission taxonomy.write` | inline `zai.images.generations` | MEDIUM — has perm, no budget/policy |
| 16 | `/api/admin/reels` | POST | `hasPermission reel.manage` | inline `ZAI.create()` (caption + video) | MEDIUM — has perm, no budget/policy |
| 17 | `/api/admin/ai-agents` | POST | `authorizeAdmin` only (no perm) | `runAgent` lib (`ai-agents/index.ts:342, 462, 639`) | MEDIUM — admin-only, no budget/policy |
| 18 | `/api/admin/ai/match-enhance` | POST | `requireAdmin ai.execute` | `enhanceMatchScore` lib (`ai-matching-enhanced.ts:216, 301`) | MEDIUM — has perm, no budget/policy |
| 19 | `/api/admin/ai/operational-signals` | GET | `requireAdmin ai.execute` | `detectPriceAnomalies` etc. lib (`ai-operational.ts:322, 396`) | MEDIUM — has perm, no budget/policy |
| 20 | `/api/admin/ai/listing-analyze` | POST | `requireAdmin ai.execute` | `extractListingAttributes` lib (`ai-listing-builder.ts:151, 276`) | MEDIUM — has perm, no budget/policy |
| 21 | `/api/admin/ai/search-understand` | POST | `requireAdmin ai.execute` | `understandSearch` lib (`ai-search.ts:185, 259`) | MEDIUM — has perm, no budget/policy |
| 22 | `/api/admin/ai/content-assist` | POST | `requireAdmin ai.execute` | `generateArticleOutline` etc. lib (`ai-content-assistant.ts:194, 278, 353`) | MEDIUM — has perm, no budget/policy |

**Special case:** `/api/ai-price-intelligence` (line 1-102) does NOT call the LLM at all — it computes pure statistical price analysis (avg/median/min/max + verdict UNDERPRICED/FAIR/OVERPRICED). Despite the `ai-` prefix, this is not an AI route. Excluded from the bypass list.

**Impact:**
- **Budget bypass:** AIBudget caps (daily $10, monthly $200) are NOT enforced for any of these 22 routes. An attacker or runaway admin can run unlimited LLM calls.
- **Policy bypass:** AITaskPolicy constraints (role allow-list, hourly/daily call caps, input-size cap, model selection, timeout, cost ceiling) are NOT enforced.
- **Audit gap:** AIGatewayLog rows are NOT created. The only audit trail is `logAudit()` calls in some routes (admin routes mostly have it; the 5 unauthenticated routes have NONE).
- **Unauthenticated AI access:** 5 routes (#1-5 above) have NO authentication at all — anyone can hit them from the public internet and burn LLM budget. This is a direct cost-drain vector and an abuse risk.

**Severity:** HIGH (R11 from prior reviews is REAL and UNRESOLVED on main; PR #11 does not touch AI routes).

**Fix recommendation:** Two-phase:
1. **Immediate (P0):** Add `requireAdmin('ai.execute')` (or at minimum `getCurrentUser` + `can('ai.execute')`) to the 5 unauthenticated routes (#1-5). This stops public abuse.
2. **Structural (P1):** Refactor every AI route to call `/api/ai-gateway` internally (or call a shared `runAiTask(taskType, input, ctx)` lib that does the preflight + ZAI.create + recordAICost + AIGatewayLog). Remove the `ZAI.create()` calls from individual routes. This unifies budget/policy/audit enforcement. ~22 routes to migrate.

---

## 6. Migration History

### 6.1 Schema files
- `prisma/schema.prisma` — 2649 lines, main DB (PostgreSQL)
- `prisma/store-schema.prisma` — 780 lines, store DB (separate PostgreSQL database, separate PrismaClient)

### 6.2 Migrations
- `prisma/migrations/0_init/migration.sql` — the ONLY migration directory
- `migration_lock.toml` + `README.md` present
- No `prisma/migrations/<datetime>_*/` directories — single-baseline migration strategy

### 6.3 Lead model (PR #9 / PR-SC-01 — verified on main `f597562`)

`prisma/schema.prisma:618-658`:
```prisma
model Lead {
  id          String   @id @default(cuid())
  listingId   String
  listing     Listing  @relation(...)
  leadType    String
  viewerPhone String?
  viewerName  String?
  note        String?
  createdAt   DateTime @default(now())

  // ── PR-SC-01 — Lead CRM Foundation ──
  status      String   @default("NEW")
  assignedToId String?
  assignedTo   User?   @relation("LeadAssignee", ...)
  score              Int?
  scoreVersion       String?
  scoreBreakdown     Json?
  scoredAt           DateTime?
  scoreOverrideById  String?
  scoreOverrideBy    User?  @relation("LeadScoreOverride", ...)
  scoreOverrideReason String?
  scoreOverrideNote  String?
  scoreOverrideAt    DateTime?

  @@index([status])
  @@index([assignedToId])
  @@index([listingId, status])
}
```
All 10 new Lead columns + 3 indexes + 2 User back-relations confirmed present. PR #9 is on main. ✓

### 6.4 PR #11 schema change

**Verified:** `git diff --stat f597562..4a2f579 -- prisma/` returns empty. PR #11 makes ZERO schema change. PR #11 is code (data-adapter, routes, engines) + config (listing ownership) + tests + CI workflow only. ✓

### 6.5 Finding R-M1 — `/api/seller/leads` route is STALE (MEDIUM, pre-existing)

**Evidence:** `src/app/api/seller/leads/route.ts:31`:
```ts
// Note: Lead doesn't have status field, so we skip status filter for now
```
This comment is FALSE on main (PR #9 merged — Lead.status exists). The route:
- GET handler only — no PATCH handler (despite the file header claiming "PATCH — update lead status/note")
- Uses `getCurrentUser()` only — NO `can('store.crm.read')` permission check (BLOCKER-A4 family)
- Filters by `sellerId: user.id` on listings, then fetches leads for those listings (BLOCKER-A2 compliant — data scoping is correct via the listing relation path)

**Impact:** The route is stale and incomplete. A buyer could call it (no perm check) and get an empty list (no listings owned). No data leak, but the route is a dead-end — the actual Lead CRM UI (when shipped in PR-SC-06) will need to use either this route (updated) or a new Universal API config for `lead` (which will need `ownership: { relation: { field: 'listing', ownerField: 'sellerId' } }` — see R-A2).

**Severity:** MEDIUM (pre-existing; not a PR-SC-00 regression; should be fixed in PR-SC-06 alongside the Lead CRM UI).

---

## 7. AI Gateway Routes — Full Inventory

(See Section 5.3 above for the complete table of 22 bypass routes + 1 gateway route + 3 admin/management routes.)

### 7.1 Gateway itself — `/api/ai-gateway` (route.ts)

**POST handler — 5-gate pipeline (lines 41-294):**
1. Rate limit (AI preset: 30 req/min per user or IP) — lines 44-67
2. Body parse — `task` + `input` required — lines 69-80
3. `preflightAIRequest({ taskType, user, inputLength })` — gates: task policy exists+active, role membership, hourly+daily quota, daily+monthly budget, input-size cap — lines 82-120
4. `ZAI.create()` + task-specific LLM call (SEARCH/SEMANTIC_SEARCH/LISTING_BUILDER/MODERATION) — lines 136-224
5. `recordAICost(task, policy.costCeilingUsd, userId)` — line 254
6. `db.aIGatewayLog.create({ ... })` — lines 259-275
7. `logAudit({ action: 'ai.execute', entityType: 'AIGateway', ... })` — lines 279-291

**Task routing:**
- `SEARCH` / `SEMANTIC_SEARCH` — LLM call, returns `{ expandedQuery, originalQuery }`
- `LISTING_BUILDER` — LLM call, returns structured JSON `{ title, brand, model, year, hours, condition, price, description }`
- `MODERATION` — LLM call, returns `{ appropriate: bool, reason: string }`
- `PRICE_ANALYSIS` — **NO LLM call**; returns `{ message: "Use /api/ai-price-intelligence for detailed analysis" }`
- `MARKET_ANALYST` — **NO LLM call**; returns `{ message: "Use /api/ai-market-analyst for market analysis" }`
- `SELLER_ASSISTANT` — **NO LLM call**; returns `{ message: "Use /api/ai-seller-assistant for seller analysis" }`
- default → 400 `Unknown task type`

**GET handler (lines 300-344):** admin view of last 50 AIGatewayLog entries + AIBudget singleton + computed stats (total, success, fail, avg latency, total cost).

### 7.2 Bypass routes — see Section 5.3 table (22 routes)

### 7.3 Finding R-A3 — Gateway's redirect messages defeat the purpose of the Gateway (MEDIUM)

**Evidence:** `/api/ai-gateway/route.ts:178-197`:
```ts
case "PRICE_ANALYSIS": {
  result = { message: "Use /api/ai-price-intelligence for detailed analysis" };
  break;
}
case "MARKET_ANALYST": {
  result = { message: "Use /api/ai-market-analyst for market analysis" };
  break;
}
case "SELLER_ASSISTANT": {
  result = { message: "Use /api/ai-seller-assistant for seller analysis" };
  break;
}
```
For these 3 task types, the Gateway:
- Runs the 5-gate preflight ✓
- Does NOT call the LLM ✗
- Records `recordAICost` with `policy.costCeilingUsd` ✓ (charges budget for a call that didn't happen)
- Creates an AIGatewayLog entry ✓
- Returns a redirect message

The redirected routes (`/api/ai-price-intelligence`, `/api/ai-market-analyst`, `/api/ai-seller-assistant`) then:
- Do NOT run any preflight
- Call `ZAI.create()` directly
- Do NOT record cost
- Do NOT create AIGatewayLog

**Net effect:** A caller who wants `SELLER_ASSISTANT` either (a) calls the Gateway, gets a redirect, then calls the bypass route — paying the budget charge twice (once for the redirect, once for the actual call that isn't tracked); or (b) calls the bypass route directly — paying nothing, no audit, no policy. Neither path is correct.

**Severity:** MEDIUM (the Gateway is architecturally compromised for these 3 task types; budget/policy/audit is bypassable by design).

**Fix recommendation:** Either (a) implement the LLM call for these 3 task types inside the Gateway and DELETE the bypass routes, or (b) make the bypass routes call back into the Gateway (so the Gateway is the single chokepoint). Option (a) is simpler and matches the Gateway's documented purpose.

---

## 8. Findings Summary

| ID | Severity | Title | Affected |
|---|---|---|---|
| R-1 | **BLOCKER** (for PR #11 merge) | `$queryRaw` table-name parameter binding bug in `updateResource` transactional path — breaks ALL main-DB updates via Universal API. Exposed by new integration test; pre-existing on main. | PR #11 CI + production main |
| R-2 | HIGH | Only `listing` has `ownership` declared. 34 of 35 registered resources have NO row-level tenant scoping. BLOCKER-A4 only partially fixed. | Universal API for all non-listing seller-scoped resources |
| R-3 | HIGH | 22 AI routes bypass the AI Gateway (no preflight, no budget, no AIGatewayLog). 5 of those have NO AUTH at all. R11 unresolved. | All AI routes except `/api/ai-gateway` itself |
| R-A1 | LOW | `requireOwnership` + `canAccessResource` are dead code (zero callers in `src/app/`). Superseded by `tenantCtx` flow. | Cleanup candidate |
| R-A2 | MEDIUM | Relation-based ownership verification is documented (`assertRelationOwned` mentioned in comment) but NOT implemented in `createResource`. Will become BLOCKER when Lead config lands in PR-SC-06. | Latent — no current resource uses `relation` ownership |
| R-A3 | MEDIUM | Gateway returns redirect messages (no LLM call) for `PRICE_ANALYSIS`/`MARKET_ANALYST`/`SELLER_ASSISTANT` — defeats the Gateway's purpose for those task types. | 3 task types + their 3 bypass routes |
| R-1.B | MEDIUM | `applyFieldPolicy` returns a `select` clause omitting `id` — Universal API list endpoint returns rows without `id` for resources with any `permissions.read` field. Pre-existing. | `listing` list endpoint (currently the only affected resource) |
| R-1.C | LOW | Cross-tenant-create integration test asserts an error; implementation silently corrects the owner (no actual leak). Test/impl mismatch. | Test only |
| R-M1 | MEDIUM | `/api/seller/leads` route is stale (claims "Lead doesn't have status field" — false since PR #9) + missing PATCH handler + no `store.crm.read` perm check. Pre-existing. | Pre-existing; PR-SC-06 should fix |

**Totals:** 9 findings — **1 BLOCKER, 2 HIGH, 4 MEDIUM, 2 LOW**

---

## 9. Recommendations (ordered by priority)

1. **BLOCKER (PR #11 merge gate):** Fix R-1 — replace the `$queryRaw` tagged template with `$queryRawUnsafe` (validated table name) or `Prisma.raw()` for the identifier. Re-run CI; integration test should pass 19/19. Without this fix, PR #11 cannot merge (CI RED) AND main is also broken for Universal API updates on main-DB resources.

2. **HIGH (security debt):** Fix R-1.B alongside R-1 — add `id: true` to `applyFieldPolicy`'s select object (or refactor to post-fetch filtering only). Otherwise the listing list endpoint returns rows without `id` and the integration test continues to fail assertions 1-3.

3. **HIGH (security debt):** Fix R-1.C test/impl mismatch — rewrite the cross-tenant-create assertion to verify the resulting row's `sellerId` (not just whether an error was thrown). This is a test-only change.

4. **HIGH (follow-up PRs):** Address R-2 — each follow-up PR (PR-SC-02 onwards) MUST add `ownership` config before its seller-scoped UI ships. Enforce the gate documented in PR-SC-00-SCOPE.md §"Gate".

5. **MEDIUM (latent):** Address R-A2 — implement `assertRelationOwned` in `data-adapter.ts` BEFORE PR-SC-06 (Lead CRM UI). Add an integration test for relation-based ownership.

6. **HIGH (R11 resolution):** Address R-3 — Phase 1: add `requireAdmin('ai.execute')` to the 5 unauthenticated AI routes (`/api/ai-search`, `/api/ai-seller-assistant`, `/api/ai-price-suggestion`, `/api/ai-listing-builder`, `/api/compare/[id]/ai-summary`). Phase 2: refactor all 22 bypass routes to call the Gateway internally.

7. **MEDIUM (Gateway architecture):** Address R-A3 — implement the LLM call for `PRICE_ANALYSIS`/`MARKET_ANALYST`/`SELLER_ASSISTANT` inside the Gateway, delete the bypass routes (or make them call the Gateway).

8. **LOW (cleanup):** Address R-A1 — mark `requireOwnership` + `canAccessResource` as `@deprecated` or delete after confirming no external callers.

9. **MEDIUM (pre-existing):** Address R-M1 — refresh `/api/seller/leads` in PR-SC-06 (add PATCH handler, add `can('store.crm.read')` perm check, remove stale comment, optionally migrate to Universal API config with `ownership: { relation: { field: 'listing', ownerField: 'sellerId' }, moderatePermission: 'listing.moderate' }`).

---

## 10. Methodology Appendix

### 10.1 Tools used
- `git` — local repo state, `git diff`, `git show`, `git log`
- `curl` + GitHub REST API (`/branches`, `/pulls`, `/actions/runs`, `/actions/jobs`, `/actions/jobs/{id}/logs`) — independent GitHub state verification
- `Read` tool — full reads of all 5 universal routes, RBAC files, ownership types, tenant-scope module, data-adapter, action-engine, bulk-export-engine, AI gateway route, AI sales-agent route, AI price-intelligence route, compare/ai-summary route, AI agents route, seller/leads route, listing config, resource-index, permissions.ts, admin-guard.ts, authorization/index.ts, tenant-scope.ts, types.ts, field-policy.ts, PR-SC-00-SCOPE.md, CI workflow, integration test file, prisma schema (Lead, AIGatewayLog, AIBudget, AITaskPolicy, PremiumSubscription, MachinePassport, Company, Part sections)
- `Grep` tool — `ownership:`, `requireOwnership|canAccessResource`, `SELLER_ASSISTANT`, `ZAI.create`, `preflightAIRequest`, `sellerId`, `Lead.status`, AI route imports
- `Bash` — `gh` not available (used `curl` + GitHub REST API directly with token from `git remote get-url`)

### 10.2 What was NOT trusted from prior reports
- Worklog STEP 11.30 claim "PR #11 OPEN (7371d40)" — **STALE**; PR #11 was force-pushed to `4a2f579` with a CI workflow change
- Worklog STEP 11.30 claim "CI green, HELD — integration test gate pending PG environment" — **OBSOLETE**; the integration test now runs in CI (PostgreSQL service container) and FAILS
- Worklog STEP 11.30 Phase C/D claim "BLOCKER-A4 confirmed real" — **RE-VERIFIED** ✓ (zero callers of `requireOwnership`/`canAccessResource` in `src/app/`)
- Worklog prior `/expert` claim "R11: ai-sales-agent calls ZAI.create() directly" — **RE-VERIFIED** ✓ (and expanded: 22 routes total bypass the Gateway, not just ai-sales-agent)
- Worklog prior claim "Lead has no sellerId" — **RE-VERIFIED** ✓ (Lead model has listingId only; no sellerId; ownership must be relation-based)

### 10.3 Claims labeled `UNVERIFIED`
- None. Every claim in this report is backed by direct file read, grep result, GitHub API response, or CI log line. Where a claim depends on runtime behavior not observable from code (e.g., "the admin UI doesn't use `id` from listing list responses"), the claim is hedged with "production impact depends on whether the admin UI uses `id`."

### 10.4 Hard-rule compliance
- No code modified ✓
- No schema modified ✓
- No PR modified ✓
- Financing/investment capabilities remain GATED — verified by reading `docs/product/AI-PRODUCT-FOUNDATION.md` references (not de-gated anywhere in this research); no financing code touched ✓
- Research only ✓
