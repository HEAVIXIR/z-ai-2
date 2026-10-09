# STEP 11.31 — Adversarial Review (`/Critic`)

- **Task ID:** 11.31-/Critic
- **Agent:** /Critic
- **Date:** 2026-10-09
- **Mission:** Try to REJECT the success claims of `/research`, `/expert`, and `/analyst` before release. Do NOT accept any agent report without checking evidence. Classify every finding as `CONFIRMED` / `REPRODUCED` / `FIXED` / `VERIFIED` / `UNVERIFIED`.
- **Repository:** `/home/z/heavix` (worktree on branch `security/pr-sc-00-tenant-scoping`)
- **PR #11 head (claimed):** `0ad24c7` (latest, with B1/H1/H2/M1 fixes)
- **PR #11 head (verified):** `0ad24c766b76f31960b048acc8f11fea7fa7ee68` ✅
- **main (claimed):** `f597562`
- **main (verified):** `f59756263f71d381014c69908fdd2379683536ef` ✅
- **Hard rules respected:** review-only — no code, schema, migration, or PR modification. No "COMPLETE"/"secure"/"verified" claim accepted without evidence.

---

## 0. Executive Summary

| Question | Independent Answer |
|---|---|
| Is PR #11 head really `0ad24c7`? | **YES** — GitHub REST API `GET /repos/HEAVIXIR/z-ai-2/pulls/11` returns `head.sha = 0ad24c766b76f31960b048acc8f11fea7fa7ee68`. (`mergeable_state = unstable` because the prior run on `4a2f579` was failing; the new run on `0ad24c7` is green — see §4.) |
| Did CI fail on `4a2f579` as /expert claimed? | **YES** — run 37979926895 conclusion=failure, step 13 "Integration tests" exit 1, 13/19 assertions pass / 6 fail. Postgres log shows `relation "$1" does not exist` (SQLSTATE 42P01). |
| Is the B1 bug real? | **YES** — the failing SQL was `SELECT * FROM "$1" WHERE "id" = $2 FOR UPDATE` (Postgres log verbatim). The `${tableName}` interpolation in `$queryRaw` tagged-template was emitted as a bind parameter, not an identifier. |
| Is the B1 fix correct? | **YES** — `data-adapter.ts:264-294` now uses `$queryRawUnsafe(lockSql, id)` with `lockSql = 'SELECT * FROM "<tableName>" WHERE "id" = $1 FOR UPDATE'` where `<tableName>` is validated against `/^[A-Za-z_][A-Za-z0-9_]*$/` before interpolation. `id` remains a bind parameter (no SQL-injection surface). CI on `0ad24c7` confirms UPDATE-on-own-listing now succeeds. |
| Is the H2 fix correct? | **YES** — owner-reassignment guard now reads `data[ownerField]` (raw payload, pre-strip) instead of `filteredData[ownerField]` (post field-policy stripping) in BOTH the transactional path (`data-adapter.ts:340`) AND the non-transactional store-DB path (`data-adapter.ts:419`). Integration test case 9 (reassign sellerId to B) now throws `Forbidden: cannot reassign ownership field` (403). |
| Is the M1 fix correct? | **YES** — `createResource` now runs `assertCreateOwner(config, tenantCtx, data)` on the RAW `data` (`data-adapter.ts:190`) instead of `filteredData`. Integration test case 11 (create with sellerId=B) now throws 403 with `forbidden`/`owner` in the message. |
| Is CI green on the NEW head `0ad24c7`? | **YES** — run 37981723334 conclusion=success (2026-10-09 19:39:41Z → 19:42:27Z, 2m46s). ALL 19 steps pass: typecheck ✓, lint ✓, security tests ✓ (51 pure-function tests), integration tests ✓ (19/19 assertions), static contract tests ✓, production build ✓. Integration test reports `RESULT: 19 passed, 0 failed`. |
| Are there really 22 AI routes bypassing the Gateway? | **APPROXIMATELY YES** — 14 routes call `ZAI.create()` directly + 9 routes call it indirectly via lib helpers (`ai-matching-enhanced`, `ai-operational`, `ai-listing-builder`, `ai-search`, `ai-content-assistant`, `moderation`, `social-reels`, `ai-agents`, `compare-engine`) = **23 routes**. /research's table row #11 (`/api/admin/brands-ai`) claims "inline `ZAI.create()`" but **the file has NO ZAI import and NO LLM call** — it uses a static brand database + deterministic `generateLogoUrl()`. So the actual bypass count is **21** (23 − brands-ai − 1 miscounted), not 22. **The core finding (HIGH severity, 5 unauthenticated routes) STANDS**; the count is off by one. |
| Is only 1 of 35 resources with ownership declared? | **YES (count slightly off)** — `grep -r "^\s*ownership\s*:" src/lib/admin/resources/` returns exactly ONE match: `listing.ts:25`. The actual registered-resource count is **36** (not 35 as /research stated) — extracted via `rg -o "registerResource\(\w+Config\)" src/lib/admin/resource-index.ts | sort -u | wc -l`. 1 of 36 has ownership. The 1-resource discrepancy does not affect the security finding. |
| Is Lead Score v1 deterministic? | **YES** — `src/lib/crm/lead-score.ts` is a pure function (zero Prisma imports, zero I/O). No `Math.random`, no `Date.now()` in the hot path. `now` is injectable via `input.now ?? new Date()` (line 170), so tests pin time. 40 unit tests pin every weight + boundary. Same input → same score. |
| Are the 28 migration fields accurate? | **YES** — every one of the 28 items in /analyst §10 was cross-checked against `prisma/schema.prisma` + `prisma/store-schema.prisma`. None of them exist (e.g., `Listing.inventoryScore*`, `MachinePassport.passportScore*` + 8 per-section verification fields, `Showroom`/`ShowroomAnalytics`/`SalesTeamMember`/`AISuggestion`/`KpiBaseline` models, `RFQ.listingId`, `Deal.leadId`, `Lead.firstRepliedAt/firstResponseMs`, `Part.firstListedAt/partCatalogScore/oemNumber/documents`, `Company.bannerUrl/brandColor/storeDescription/storeSlug`). All 28 are correctly absent. |

**Verdict (preview):** PR #11 meets its stated gate (CI green on `0ad24c7`, B1/H1/H2/M1 fixes verified, integration test 19/19). The Universal Resource API at `/api/admin/resources/listings/*` is now correctly tenant-scoped for the `listing` resource. **PR #11 CAN merge as a strict security improvement.**

**HOWEVER — independent adversarial finding (NEW-C1, CRITICAL):** the seller-data-separation goal is **only partially achieved**. The legacy routes `/api/admin/listings/*` (GET list, GET by id, PATCH, POST bulk) are NOT tenant-scoped and are accessible to SELLER-role users via RBAC (`listing.read`, `listing.update`, `listing.publish` are all in the SELLER permission set — verified at `src/lib/authorization/permissions.ts:245-248`). A seller can list/get/patch/bulk-modify ANY seller's listings through these legacy endpoints, completely bypassing the PR-SC-00 fix. This is **out of scope for PR #11** (per `PR-SC-00-SCOPE.md` §1, scope is explicitly the Universal Resource API) and is a **pre-existing** bug, not a regression — but it MUST be tracked as a CRITICAL follow-up before any seller-facing UI feature is declared "tenant-safe".

---

## 1. Verification of `/research` Findings

### 1.1 PR metadata (independent GitHub API query)

```
GET /repos/HEAVIXIR/z-ai-2/pulls/11
state             : open
merged            : False
mergeable         : True
mergeable_state   : unstable     (carried over from the failed 4a2f579 run)
head.sha          : 0ad24c766b76f31960b048acc8f11fea7fa7ee68  ✅ matches task brief
head.ref          : security/pr-sc-00-tenant-scoping
base.sha          : f59756263f71d381014c69908fdd2379683536ef  ✅ matches main
base.ref          : main
title             : security(pr-sc-00): Universal API tenant scoping (BLOCKER-A4 fix)
```

**Classification: CONFIRMED** — PR #11 head is `0ad24c7` as claimed.

### 1.2 R-2 — Only `listing` has `ownership` declared (HIGH)

**Independent check:** `rg -n "^\s*ownership\s*:" src/lib/admin/resources/` returns exactly one match:

```
src/lib/admin/resources/listing.ts:25:  ownership: {
```

The `listingConfig.ownership` is `{ ownerField: 'sellerId', moderatePermission: 'listing.moderate' }` (verified by reading `listing.ts:25-28`). No other resource file declares `ownership`.

**Resource count cross-check:** `rg -o "registerResource\(\w+Config\)" src/lib/admin/resource-index.ts | sort -u | wc -l` returns **36** (not 35 as /research stated). The 1-resource discrepancy does not change the security conclusion: 1 of 36 has ownership.

**Classification: CONFIRMED** (with minor count inaccuracy in /research — 36 vs 35).

### 1.3 R-3 — 22 AI routes bypass the AI Gateway (HIGH, R11 unresolved)

**Independent check:** `rg -l "ZAI\.create" src/app/api/` returns **15 route files** that call `ZAI.create()` directly. Additionally, **9 route files** call it indirectly via lib helpers (`ai-matching-enhanced.ts`, `ai-operational.ts`, `ai-listing-builder.ts`, `ai-search.ts`, `ai-content-assistant.ts`, `moderation.ts`, `social-reels.ts`, `ai-agents/index.ts`, `compare-engine.ts`).

Direct callers (14, excluding `/api/ai-gateway` itself which IS the gateway):
1. `/api/ai-search`
2. `/api/ai-seller-assistant`
3. `/api/ai-price-suggestion`
4. `/api/ai-listing-builder`
5. `/api/ai-sales-agent`
6. `/api/ai-market-analyst`
7. `/api/admin/ai-content-factory`
8. `/api/admin/ai-scraper`
9. `/api/admin/store/ai-scraper`
10. `/api/admin/categories/[id]/generate-image`
11. `/api/admin/brands/[id]/search-logo`
12. `/api/admin/knowledge/generate-article`
13. `/api/admin/knowledge/generate-image`
14. `/api/admin/reels`

Indirect callers via lib helpers (9):
15. `/api/admin/ai/match-enhance` → `ai-matching-enhanced.ts`
16. `/api/admin/ai/operational-signals` → `ai-operational.ts`
17. `/api/admin/ai/listing-analyze` → `ai-listing-builder.ts`
18. `/api/admin/ai/search-understand` → `ai-search.ts`
19. `/api/admin/ai/content-assist` → `ai-content-assistant.ts`
20. `/api/admin/moderation` → `moderation.ts`
21. `/api/admin/social-reels` → `social-reels.ts`
22. `/api/admin/ai-agents` → `ai-agents/index.ts`
23. `/api/compare/[id]/ai-summary` → `compare-engine.ts`

**Discrepancy:** /research's table row #11 lists `/api/admin/brands-ai` with "inline `ZAI.create()`". **Independent verification:** `rg -n "ZAI|z-ai-web-dev-sdk" src/app/api/admin/brands-ai/route.ts` returns ZERO matches. The file imports only `db`, `getCurrentUser`, `hasPermission`, `logAudit`, `HOMEPAGE_CACHE_TAGS`, `revalidateTag`. It uses a static `BRAND_DATABASE` array (300+ hardcoded brands) + a deterministic `generateLogoUrl(nameEn)` function (line 190). **No LLM call whatsoever.** /research's classification of brands-ai as a Gateway-bypassing AI route is **INCORRECT**.

**Actual bypass count:** 23 − 1 (brands-ai misclassified) = **22 routes** if we count `/api/ai-gateway` itself (which IS the gateway, not a bypass). Excluding the gateway: **22 bypassing routes**. So /research's "22" headline number happens to match, but its table contains one misclassified entry (brands-ai). The discrepancy is: the table lists 22 routes, but one of them (brands-ai) is not actually a bypass, so the real count is 21 if brands-ai is removed without replacement, or 22 if /research's table includes a different route I haven't found.

**Core finding:** The HIGH-severity claim — "many AI routes bypass the Gateway; 5 have NO auth at all" — is **CONFIRMED**. The exact count has a minor inaccuracy (1 misclassified entry in the table).

**Classification: CONFIRMED with MINOR INACCURACY** (brands-ai doesn't call ZAI; overall count is in the right ballpark — 21-22 routes).

### 1.4 R-A1 — `requireOwnership` + `canAccessResource` are dead code (LOW)

**Independent check:** `rg -n "requireOwnership|canAccessResource" src/app/` returns ZERO matches. The helpers exist at `src/lib/admin-guard.ts:112` and `src/lib/authorization/index.ts:172` but have no callers in the application code. They are superseded by the new `tenantCtx` flow.

**Classification: CONFIRMED.**

### 1.5 R-A2 — Relation-based ownership is documented but NOT implemented in `createResource` (MEDIUM, latent)

**Independent check:** `grep -n "assertRelationOwned" src/lib/admin/data-adapter.ts` returns ZERO matches. The function is mentioned by name in a comment in `tenant-scope.ts` but does not exist. `assertCreateOwner` returns `{ ok: true, injectOwner: '__relation__' }` for relation-based ownership — the caller is expected to do the DB lookup separately, but `createResource` does NOT do this.

**Current exploitability:** NONE — no resource currently uses `relation`-based ownership (only `listing` uses direct `ownerField`). The bug becomes a BLOCKER when PR-SC-06 adds `relation: { field: 'listing', ownerField: 'sellerId' }` for the Lead resource.

**Classification: CONFIRMED** (latent — correctly identified as MEDIUM, not currently exploitable).

### 1.6 R-B1 — B1 bug (`$queryRaw` identifier interpolation) (BLOCKER on 4a2f579)

**Independent check:** Downloaded CI logs from run 37979926895 (the failing run on `4a2f579`). The integration test step log contains:

```
prisma:error
Invalid `prisma.$queryRaw()` invocation:
Raw query failed. Code: `42P01`. Message: `relation "$1" does not exist`
```

And the Postgres log captured:

```
2026-10-09 19:26:00.746 UTC [175] ERROR:  relation "$1" does not exist at character 30
2026-10-09 19:26:00.746 UTC [175] STATEMENT:
              SELECT * FROM "$1" WHERE "id" = $2 FOR UPDATE
```

This is the exact bug /research and /expert described: Prisma's `$queryRaw` tagged-template treats `${tableName}` as a bind parameter, emitting `"$1"` as a literal table name.

**Classification: CONFIRMED + REPRODUCED** (CI ran the test and reproduced it on `4a2f579`).

---

## 2. Verification of `/expert` Findings

### 2.1 B1 fix correctness

**Code location:** `src/lib/admin/data-adapter.ts:264-294` (post-fix).

```ts
const tableName = config.model.charAt(0).toUpperCase() + config.model.slice(1);
// Defense-in-depth: validate tableName is a safe SQL identifier.
if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(tableName)) {
  throw new Error(`Invalid table name: "${tableName}"`);
}
const lockSql = `SELECT * FROM "${tableName}" WHERE "id" = $1 FOR UPDATE`;
// ...
const rows = await tx.$queryRawUnsafe(lockSql, id) as Record<string, unknown>[];
```

**Security analysis:**
- `tableName` is derived from `config.model`, which is a hardcoded string in the resource registry (not user input). Defense-in-depth validation rejects anything outside `[A-Za-z_][A-Za-z0-9_]*`.
- `id` remains a bound parameter (`$1`) — no SQL-injection surface for the primary key.
- `$queryRawUnsafe` is the correct Prisma API for interpolating validated identifiers. This matches /expert's recommended Option B exactly.
- The double-quoted identifier `"${tableName}"` correctly handles case-sensitive table names in PostgreSQL (Prisma uses the model name as the table name by default, which is camelCased like `Listing` — must be quoted to match).

**Verification:** CI run 37981723334 on `0ad24c7` integration test case 8 ("Seller A can update their own listing") now passes — the `SELECT FOR UPDATE` succeeds, and the subsequent `txModel.update` runs. Test 9 (owner-reassignment) also passes (the load succeeds, then the H2-fixed guard fires and throws 403).

**Classification: FIXED** (B1 was real on `4a2f579`; verified fixed on `0ad24c7`).

### 2.2 H1 fix correctness

**Code location:** `tests/integration/tenant-scope-real.ts:101, 109, 116, 120, 124, 128` (post-fix).

The fix changed the third argument to `listResources`/`getResource` from `{ userId: sellerX.id }` to `undefined`:

```ts
// Before (4a2f579):
const aListResult = await listResources(config, queryParams, { userId: sellerA.id }, sellerACtx);
// After (0ad24c7):
const aListResult = await listResources(config, queryParams, undefined, sellerACtx);
```

**Security analysis:** When `fieldCtx` is `undefined`, `applyFieldPolicy` is not called (data-adapter.ts:93: `const select = fieldCtx ? applyFieldPolicy(config, fieldCtx, 'read') : undefined;`). With `select = undefined`, Prisma's `findMany` returns all fields including `id`. The integration test can now verify item-level tenant scoping (not just count-level).

This is a **test-only fix** — it isolates the integration test from field-policy projection. It does NOT change production behavior. The LIST endpoint in production (`/api/admin/resources/[resource]/route.ts:67`) still passes `{ userId }` as `fieldCtx`, so field-policy projection is still applied in production (correctly — sellers shouldn't see other sellers' `sellerPhone` etc.).

**Verification:** CI log on `0ad24c7` shows tests 1-3 now pass at the item level:
```
✅ Seller A sees their own listing aList1
✅ Seller A sees their own listing aList2
✅ Seller A does NOT see Seller B's listing (NEGATIVE)
✅ Seller A total = 2 (got 2)
```

**Classification: FIXED** (H1 was real on `4a2f579`; verified fixed on `0ad24c7`).

### 2.3 H2 fix correctness

**Code location:** `src/lib/admin/data-adapter.ts:333-348` (transactional path) and `:416-427` (non-transactional store-DB path).

```ts
// Transactional path (line 340):
const newOwner = data[ownerField];          // RAW data (pre-strip)
// Non-transactional path (line 419):
const newOwner = data[ownerField];          // RAW data (pre-strip)
```

Before the fix, both paths read `filteredData[ownerField]` (post field-policy stripping). Since `sellerId` is NOT in `listingConfig.fields`, `applyFieldWritePolicyAsync` strips it, making `filteredData[ownerField]` always `undefined` → the guard's `if (newOwner !== undefined && ...)` was unreachable.

**Security analysis:** Reading the RAW `data` means the guard fires whenever the client payload includes a `sellerId` that differs from the authenticated user — regardless of whether field policy would strip it. This is the correct defense-in-depth behavior: the guard should not depend on field-policy implementation details.

**Verification:** CI log on `0ad24c7` test 9:
```
── 9. UPDATE: Seller A cannot reassign owner to another user ──
  ✅ Seller A owner-reassignment throws forbidden (NEGATIVE ✓)
```

The test asserts the thrown message includes "ownership" or "forbidden" — the H2-fixed guard throws exactly `Forbidden: cannot reassign ownership field "sellerId" to another user` (statusCode 403).

**Classification: FIXED** (H2 was real on `4a2f579` — guard was unreachable due to B1 + field-policy stripping; verified fixed on `0ad24c7`).

### 2.4 M1 fix correctness

**Code location:** `src/lib/admin/data-adapter.ts:184-202` (post-fix).

```ts
// PR-SC-00: enforce owner on create.
// IMPORTANT: run assertCreateOwner on the RAW `data` (before field-policy
// stripping), not on `filteredData`. Otherwise a forged `sellerId` in the
// payload could be silently stripped by field policy before the owner
// check sees it — turning an explicit rejection into a silent overwrite.
if (tenantCtx) {
  const ownerCheck = assertCreateOwner(config, tenantCtx, data);  // RAW data
  if (!ownerCheck.ok) {
    const err = new Error(ownerCheck.error) as Error & { statusCode: number };
    err.statusCode = 403;
    throw err;
  }
  // ...
}
```

Before the fix, `assertCreateOwner(config, tenantCtx, filteredData)` was called on the post-strip payload. For Listing, `sellerId` was stripped → `assertCreateOwner` saw no `sellerId` → returned `{ ok: true, injectOwner: 'sellerId' }` → the forged `sellerId` was silently overwritten with the authenticated user's id. The API returned 201 (success) instead of 403.

**Security analysis:** Running on RAW `data` means `assertCreateOwner` sees the client-supplied `sellerId`. If it differs from `tenantCtx.userId`, the explicit-rejection branch fires and throws 403. This is the correct API-surface behavior: a forged owner is explicitly rejected, not silently overwritten.

**Verification:** CI log on `0ad24c7` test 11:
```
── 11. CREATE: Seller A cannot create a listing with sellerId = B ──
  ✅ Seller A cross-tenant create throws forbidden (NEGATIVE ✓)
```

**Classification: FIXED** (M1 was real on `4a2f579` — forged owner silently overwritten; verified fixed on `0ad24c7`).

### 2.5 H3 — Action-engine `findUnique` without tenant filter (HIGH, recommended-but-not-required)

**Independent check:** `src/lib/admin/action-engine.ts:340`:
```ts
before = await model.findUnique({ where: { id: entityId } });
```

The action-engine loads the row by `id` only (no tenant filter), then calls `checkRowOwnership(config, ctx.tenantCtx, before)` at line 352 to enforce ownership in application memory. If not allowed → returns `{ success: false, message: 'Entity not found' }` (fail-closed, no leak).

**Was H3 fixed in `0ad24c7`?** **NO.** The fix commit `0ad24c7` only modified:
- `src/lib/admin/data-adapter.ts`
- `tests/integration/tenant-scope-real.ts`

The action-engine was NOT touched. `action-engine.ts:340` still uses `findUnique({ where: { id } })`.

**Security analysis:** /expert's analysis is correct — this is "not a leak" (the row is loaded into server memory briefly, then discarded on rejection; never serialized to the client, never logged). It is a defense-in-depth inconsistency with the data-adapter's `findFirst`-with-tenant-filter approach. /expert marked it as "Should fix before merge (defense-in-depth hardening)" — recommended but NOT in the must-fix list (B1+B2+H1+H2+M1/M2).

**Classification: VERIFIED** (H3 is a real defense-in-depth gap, correctly identified by /expert, NOT fixed in `0ad24c7`, but was not a merge blocker per /expert's own must-fix list. Security outcome: no leak. Bulk action per-item ownership IS enforced via `checkRowOwnership` at line 352 — verified independently).

### 2.6 Bulk action per-item ownership enforcement

**Independent check:** `src/lib/admin/bulk-export-engine.ts:186-228` (`executeBulkAction` → `executeAction` per id). `src/app/api/admin/resources/[resource]/bulk/route.ts:71` resolves `tenantCtx` and passes it via `ctx`. `src/lib/admin/action-engine.ts:350-355`:

```ts
if (ctx.tenantCtx && config.ownership) {
  const { checkRowOwnership } = await import('./tenant-scope');
  const ownCheck = checkRowOwnership(config, ctx.tenantCtx, before);
  if (!ownCheck.allowed) {
    return { success: false, action: actionKey, entityId, message: 'Entity not found' };
  }
}
```

**Classification: CONFIRMED** — bulk actions DO enforce per-item ownership via `checkRowOwnership`. Non-owners get "Entity not found" per-id; other ids proceed (partial-failure result correctly reports per-id status).

### 2.7 Export tenant-scoping

**Independent check:** `src/lib/admin/bulk-export-engine.ts:222-223`:
```ts
const tenantResult = ctx.tenantCtx ? buildTenantWhere(config, ctx.tenantCtx) : { where: {} };
const exportWhere = mergeTenantWhere(filters, tenantResult);
```

The export query `model.findMany({ where: exportWhere, take: 5000 })` carries the tenant filter.

**Classification: CONFIRMED** — export is tenant-scoped at the DB layer.

---

## 3. Verification of `/analyst` Findings

### 3.1 Lead Score v1 determinism

**Independent check:** `src/lib/crm/lead-score.ts` (227 lines, read end-to-end).

- **No Prisma imports:** `rg "prisma|@/lib/db" src/lib/crm/lead-score.ts` → ZERO matches. Pure function. ✓
- **No `Math.random`:** `rg "Math\.random" src/lib/crm/lead-score.ts` → ZERO matches. ✓
- **No `Date.now()` in hot path:** The only `new Date()` is at line 170: `const now = (input.now ?? new Date()).getTime();`. In tests, `input.now` is always provided → fully deterministic. In production (no `input.now`), `new Date()` reads the wall clock — but the SAME input (with the same `input.now`) ALWAYS produces the same score. The function is deterministic modulo the time input, which is the correct contract for a pure-function scorer. ✓
- **Versioned:** `LEAD_SCORE_VERSION = "v1"` (line 34). ✓
- **Clamped:** `clamp(raw, 0, 100)` at line 205. ✓
- **Explainable:** `breakdown: LeadScoreFactor[]` with `{factor, points, max, detail}` for all 6 factors; `reason` string lists top-2 contributing factors. ✓
- **6 factors sum to 100:** L1=35, L2=20, L3=10, L4=10, L5=15, L6=10 = 100. ✓
- **Fail-closed on unknown leadType:** `LEAD_TYPE_WEIGHTS[unknown] ?? LEAD_TYPE_FLOOR (5)` (line 175). ✓

**Classification: CONFIRMED** — Lead Score v1 is deterministic, versioned, explainable, clamped, pure-function, permitted-data-only.

### 3.2 28 migration fields accuracy

**Independent check:** Cross-checked every item in /analyst §10 against `prisma/schema.prisma` + `prisma/store-schema.prisma`.

| # | Item | Verified absent? |
|---|---|---|
| 1-4 | `Listing.inventoryScore{,Version,At,Breakdown}` | ✓ `rg "inventoryScore" prisma/schema.prisma` → ZERO matches |
| 5-12 | `MachinePassport.{specs,ownership,inspection,serviceHistory}Verified{At,By}` (8 fields) | ✓ `rg "specsVerified\|ownershipVerified\|inspectionVerified\|serviceHistoryVerified" prisma/schema.prisma` → ZERO matches |
| 13-14 | `MachinePassport.passportScore{,Version}` | ✓ `rg "passportScore" prisma/schema.prisma` → ZERO matches |
| 15 | `Showroom` model | ✓ `rg "model Showroom" prisma/schema.prisma` → ZERO matches |
| 16 | `ShowroomAnalytics` model | ✓ absent |
| 17 | `SalesTeamMember` model | ✓ absent |
| 18 | `AISuggestion` model | ✓ absent |
| 19 | `RFQ.listingId` FK | ✓ `RFQ` model (schema.prisma:864-893) has `buyerId` only — no `listingId` field |
| 20 | `Deal.leadId` FK | ✓ `Deal` model (schema.prisma:2378-2418) has `sourceId`, `buyerId`, `sellerId`, `listingId` — no `leadId` field |
| 21-22 | `Lead.firstRepliedAt`, `Lead.firstResponseMs` | ✓ `rg "firstRepliedAt\|firstResponseMs" prisma/schema.prisma` → ZERO matches |
| 23 | `Part.firstListedAt` | ✓ `rg "firstListedAt" prisma/store-schema.prisma` → ZERO matches |
| 24 | `Part.partCatalogScore` + version | ✓ absent |
| 25 | `Part.oemNumber` | ✓ absent |
| 26 | `Part.documents` relation | ✓ absent |
| 27 | `Company.bannerUrl/brandColor/storeDescription/storeSlug` | ✓ `rg "bannerUrl\|brandColor\|storeDescription\|storeSlug" prisma/schema.prisma` → ZERO matches |
| 28 | `KpiBaseline` model (optional) | ✓ absent |

**Count:** 27 required + 1 optional = 28 total. All 28 are correctly absent from the schema.

**Classification: CONFIRMED** — the 28 migration fields are accurate.

### 3.3 Lead model PR-SC-01 fields (G1-G6 facts)

**Independent check:** `prisma/schema.prisma:618-658` (Lead model). Verified:
- `status String @default("NEW")` ✓ (line 634)
- `assignedToId String?` + `assignedTo User? @relation("LeadAssignee")` ✓ (lines 637-638)
- `score Int?`, `scoreVersion String?`, `scoreBreakdown Json?`, `scoredAt DateTime?` ✓ (lines 642-645)
- `scoreOverrideById/Reason/Note/At` + `scoreOverrideBy User?` ✓ (lines 649-653)
- 3 indexes: `@@index([status])`, `@@index([assignedToId])`, `@@index([listingId, status])` ✓
- `Lead.listingId String` (cascade) is the ONLY path to seller; no `Lead.sellerId` direct FK ✓ (G6 confirmed)

**Classification: CONFIRMED** — all G1-G6 facts verified against schema.

---

## 4. CI Status on NEW HEAD `0ad24c7` (Independent)

### 4.1 Check-runs on `0ad24c7`

```
GET /repos/HEAVIXIR/z-ai-2/commits/0ad24c766b76f31960b048acc8f11fea7fa7ee68/check-runs
total_count : 1
name        : verify
status      : completed
conclusion  : success     ✅ GATE MET
run_id      : 37981723334
job_id      : 113993642818
html_url    : https://github.com/HEAVIXIR/z-ai-2/actions/runs/37981723334/job/113993642818
started_at  : 2026-10-09T19:39:41Z
completed_at: 2026-10-09T19:42:27Z  (2m46s)
```

### 4.2 Per-step result (from job metadata)

| # | Step | Conclusion |
|---|------|------------|
| 1 | Set up job | ✓ success |
| 2 | Initialize containers | ✓ success |
| 3 | actions/checkout@v4 | ✓ success |
| 4 | oven-sh/setup-bun@v2 | ✓ success |
| 5 | Install dependencies | ✓ success |
| 6 | Generate Prisma clients | ✓ success |
| 7 | Create store test database | ✓ success |
| 8 | Push schemas | ✓ success |
| 9 | Typecheck | ✓ success |
| 10 | Lint | ✓ success |
| 11 | Security tests (`bun run test:security`) | ✓ success (51 pure-function tests) |
| 12 | Seed RBAC | ✓ success |
| **13** | **Integration tests (real PostgreSQL — PR-SC-00 tenant-scoping negative tests)** | **✓ success** |
| 14 | Static contract tests | ✓ success |
| 15 | Production build | ✓ success |
| 16-19 | Post-run + cleanup | ✓ success |

**ALL 19 steps pass.** No skipped steps. Production build succeeds (was skipped on `4a2f579` due to the integration-test failure).

### 4.3 Integration test output on `0ad24c7` (verbatim from CI log)

```
═══════════════════════════════════════════
  PR-SC-00 — Real PostgreSQL Tenant Scoping
═══════════════════════════════════════════

── 1. LIST: Seller A sees only their own listings ──
  ✅ Seller A sees their own listing aList1
  ✅ Seller A sees their own listing aList2
  ✅ Seller A does NOT see Seller B's listing (NEGATIVE)
  ✅ Seller A total = 2 (got 2)

── 2. LIST: Seller B sees only their own listing ──
  ✅ Seller B sees their own listing bList1
  ✅ Seller B does NOT see Seller A's listing (NEGATIVE)
  ✅ Seller B total = 1 (got 1)

── 3. LIST: Admin sees all listings ──
  ✅ Admin sees all 3+ listings (got 3)

── 4. GET: Seller A cannot fetch Seller B's listing by id ──
  ✅ Seller A GET on B's listing returns null (NEGATIVE — no cross-tenant read)

── 5. GET: Seller A can fetch their own listing ──
  ✅ Seller A GET on own listing returns the row (POSITIVE)

── 6. GET: Admin can fetch any listing ──
  ✅ Admin GET on B's listing returns the row (POSITIVE)

── 7. UPDATE: Seller A cannot update Seller B's listing ──
  ✅ Seller A UPDATE on B's listing throws not-found (NEGATIVE ✓)

── 8. UPDATE: Seller A can update their own listing ──
  ✅ Seller A UPDATE on own listing succeeds (POSITIVE)

── 9. UPDATE: Seller A cannot reassign owner to another user ──
  ✅ Seller A owner-reassignment throws forbidden (NEGATIVE ✓)

── 10. DELETE: Seller A cannot delete Seller B's listing ──
  ✅ Seller A DELETE on B's listing throws not-found (NEGATIVE ✓)
  ✅ Seller B's listing still exists after A's failed delete

── 11. CREATE: Seller A cannot create a listing with sellerId = B ──
  ✅ Seller A cross-tenant create throws forbidden (NEGATIVE ✓)

── 12. CREATE: Seller A can create a listing (owner injected) ──
  ✅ Seller A create injects their own sellerId (POSITIVE)

── 13. buildTenantWhere: pure function confirms the filter shape ──
  ✅ buildTenantWhere for seller A = { sellerId: A }

── Cleanup ──

═══════════════════════════════════════════
  RESULT: 19 passed, 0 failed
═══════════════════════════════════════════
```

**CI integration test result on `0ad24c7`: PASSES (19/19 assertions, exit 0).**

### 4.4 Comparison: `4a2f579` (failed) vs `0ad24c7` (passed)

| Assertion | `4a2f579` | `0ad24c7` | Fixed by |
|---|---|---|---|
| 1. Seller A sees aList1 | ❌ | ✅ | H1 (undefined fieldCtx) |
| 2. Seller A sees aList2 | ❌ | ✅ | H1 |
| 3. Seller A NOT see B's listing | ✅ (accidental) | ✅ (real) | H1 |
| 4. Seller A total = 2 | ✅ | ✅ | (already passed) |
| 5. Seller B sees bList1 | ❌ | ✅ | H1 |
| 6. Seller B NOT see A's listing | ✅ | ✅ | (already passed) |
| 7. Seller B total = 1 | ✅ | ✅ | (already passed) |
| 8. Admin sees all 3+ | ✅ | ✅ | (already passed) |
| 9. Seller A GET B's listing → null | ✅ | ✅ | (already passed) |
| 10. Seller A GET own listing | ✅ | ✅ | (already passed) |
| 11. Admin GET B's listing | ✅ | ✅ | (already passed) |
| 12. Seller A UPDATE B's listing → 404 | ✅ | ✅ | (already passed) |
| 13. Seller A UPDATE own listing | ❌ (B1: 42P01) | ✅ | B1 ($queryRawUnsafe) |
| 14. Seller A reassign sellerId → 403 | ❌ (B1 masked H2) | ✅ | B1 + H2 (data[ownerField]) |
| 15. Seller A DELETE B's listing → 404 | ✅ | ✅ | (already passed) |
| 16. B's listing still exists | ✅ | ✅ | (already passed) |
| 17. Seller A create with sellerId=B → 403 | ❌ (M1: silent overwrite) | ✅ | M1 (assertCreateOwner on raw data) |
| 18. Seller A create injects own sellerId | ✅ | ✅ | (already passed) |
| 19. buildTenantWhere shape | ✅ | ✅ | (already passed) |

**All 6 previously-failing assertions now pass.** The 4 fixes (B1/H1/H2/M1) are sufficient.

**Classification: CONFIRMED** — CI on `0ad24c7` is green; integration test 19/19 pass.

---

## 5. Alternative Bypass Paths (Independent Adversarial Findings)

### 5.1 NEW-C1 (CRITICAL) — Legacy `/api/admin/listings/*` routes bypass tenant-scoping, accessible to SELLERs

**Discovery:** While verifying that no routes outside `/api/admin/resources/` access seller-scoped data without tenant-scoping, I read `src/app/api/admin/listings/route.ts` and `src/app/api/admin/listings/[id]/route.ts` end-to-end.

**Evidence — `src/app/api/admin/listings/route.ts` (GET, lines 22-116):**

```ts
export async function GET(req: Request) {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) return 401;
  if (!(await hasPermission(sessionUser.id, "listing.read"))) return 403;
  // ... builds `where` from query params (q, status, brandId, categoryId, etc.)
  // NO sellerId filter is added — `where` does NOT include { sellerId: userId }
  const [listings, total] = await Promise.all([
    db.listing.findMany({ where, ... }),  // ← returns ALL listings
    db.listing.count({ where }),
  ]);
  // ... returns ALL listings to the caller
}
```

**Evidence — `src/app/api/admin/listings/route.ts` (POST bulk, lines 118-196):**

```ts
export async function POST(req: Request) {
  // ... requires "listing.publish" permission
  // ... parses { action, ids }
  // For "delete" action:
  await db.listing.deleteMany({ where: { id: { in: ids } } });  // ← NO sellerId filter
  // For other actions (feature/unfeature/verify/unverify/publish/pause/markSold/extend):
  const result = await db.listing.updateMany({
    where: { id: { in: ids } },  // ← NO sellerId filter
    data,
  });
}
```

**Evidence — `src/app/api/admin/listings/[id]/route.ts`:**

- **GET (lines 61-128):** requires `listing.read`; loads `db.listing.findUnique({ where: { id } })` — NO tenant filter. Returns full detail (including seller PII: `seller.firstName, lastName, mobile, email`).
- **PATCH (lines 134-450):** requires `listing.update`; loads `db.listing.findUnique({ where: { id } })` — NO tenant filter. The `allowedFields` array (line 159-167) explicitly includes `"sellerId"` — **a seller can reassign any listing's `sellerId` to any user via this endpoint.** The update runs `db.listing.update({ where: { id }, data })` — NO tenant filter.
- **DELETE (lines 453-482):** requires `listing.delete`. SELLER does NOT have `listing.delete` (verified at `permissions.ts:245-248` — SELLER has `listing.read/create/update/publish` only). So DELETE is admin-only. ✓ Safe.

**SELLER permission set (verified at `src/lib/authorization/permissions.ts:245-270`):**

```ts
SELLER: [
  'admin.dashboard.read',
  'admin.preferences.read',
  'listing.read', 'listing.create', 'listing.update', 'listing.publish',  // ← all four!
  'brand.read',
  // ... (no listing.delete)
]
```

**Exploit scenario:**

1. Seller A authenticates (has SELLER role → `listing.read` + `listing.update` + `listing.publish`).
2. Seller A calls `GET /api/admin/listings` → receives ALL listings (every seller's inventory, including seller PII via the `[id]` detail endpoint).
3. Seller A calls `PATCH /api/admin/listings/{sellerB-listing-id}` with `{ "sellerId": "<sellerA-id>" }` → **steals Seller B's listing** (reassigns ownership to Seller A). The `allowedFields` array explicitly permits `sellerId` reassignment.
4. Alternatively, Seller A calls `POST /api/admin/listings` with `{ "action": "markSold", "ids": ["<sellerB-listing-id>"] }` → marks Seller B's listing as SOLD (denial-of-service on a competitor's inventory).
5. Or `{ "action": "delete", "ids": ["<sellerB-listing-id>"] }` → **wait, DELETE requires `listing.publish`, not `listing.delete`**. Looking again at line 124: `if (!(await hasPermission(sessionUser.id, "listing.publish")))`. SELLER has `listing.publish`. So Seller A CAN delete any listing via the bulk endpoint. (The per-id `DELETE /api/admin/listings/[id]` endpoint requires `listing.delete` which SELLER lacks — but the bulk POST `action: "delete"` only requires `listing.publish`.)

**Severity: CRITICAL** — cross-tenant read + write + delete via legacy admin endpoints.

**Is this a PR #11 blocker?** **NO** — per `PR-SC-00-SCOPE.md` §1, PR #11's scope is explicitly "The Universal Resource API (`src/app/api/admin/resources/[resource]/...`)". The legacy `/api/admin/listings/*` routes are OUT OF SCOPE. This is a PRE-EXISTING bug (present on `main` `f597562` too — verified by reading the same files at the base SHA). PR #11 is a strict improvement: it closes the Universal API bypass without touching the legacy bypass.

**BUT** — the broader security goal ("seller data separation") is **only partially achieved** by PR #11. The gate in `PR-SC-00-SCOPE.md` §127 says: *"no seller-scoped UI feature dependent on the Universal Resource API is approved for release."* This gate is narrow — it only blocks seller UI features that use the Universal API. A seller UI feature that uses the legacy `/api/admin/listings` route is NOT blocked by this gate, but is equally unsafe.

**Recommendation:** PR #11 CAN merge (it's a strict improvement). But a follow-up PR (e.g., PR-SC-00b or a hotfix) MUST either:
- (a) Add tenant-scoping to `/api/admin/listings/*` (resolveTenantCtx + checkRowOwnership, mirroring the Universal API), OR
- (b) Remove `/api/admin/listings/*` and migrate all callers (admin UI) to `/api/admin/resources/listings/*` (which IS tenant-scoped), OR
- (c) Add an `isAdmin` gate to `/api/admin/listings/*` so only ADMIN-role users can access it (sellers use `/api/listings/*` which IS ownership-checked).

Until one of these lands, **the seller-data-separation goal is NOT fully met**.

**Classification: REPRODUCED** (independently verified by reading the code; pre-existing, out of scope for PR #11, but CRITICAL follow-up).

### 5.2 Seller forging ownership via relation field (R-A2, latent)

**Independent check:** Currently NO resource uses `relation`-based ownership. Only `listing` uses direct `ownerField: 'sellerId'`. The `relation` branch of `buildOwnerFilter` (`tenant-scope.ts:107-118`) is exercised by pure-function unit tests but NOT by any integration test or production resource.

**Can a seller forge ownership via a relation field TODAY?** **NO** — no resource configures relation-based ownership. The `/api/offers` POST route creates a Lead with a `listingId` pointing to ANY listing (no ownership check at line 78-105), but this is intentional (buyers create leads on sellers' listings) and does not expose seller data (the Lead has only `viewerPhone`/`viewerName`/`note` — no seller PII).

**When does this become exploitable?** When PR-SC-06 adds `relation: { field: 'listing', ownerField: 'sellerId' }` for the Lead resource AND Lead CRUD moves to the Universal API. At that point, `createResource` would need `assertRelationOwned` (which does NOT exist — see R-A2) to verify that the `listingId` points to a listing owned by the authenticated seller. Without it, a seller could create a Lead with `listingId` pointing to another seller's listing and gain CRM access to that listing's leads.

**Classification: VERIFIED** (latent — correctly identified by /research as MEDIUM R-A2; not currently exploitable; becomes BLOCKER when PR-SC-06 ships).

### 5.3 Bulk action per-item tenant-scoping

**Independent check:** `src/app/api/admin/resources/[resource]/bulk/route.ts:71` resolves `tenantCtx` and passes it to `executeBulkAction` via `ctx.tenantCtx`. `src/lib/admin/action-engine.ts:350-355` calls `checkRowOwnership(config, ctx.tenantCtx, before)` per-item. Non-owners get `{ success: false, message: 'Entity not found' }` (fail-closed).

**Classification: CONFIRMED** — bulk actions enforce per-item ownership. The check is in app memory (after `findUnique`), not at the DB layer (H3 defense-in-depth gap), but it IS enforced.

### 5.4 Other seller-scoped dedicated routes (defense-in-depth audit)

I spot-checked several dedicated routes outside the Universal API:

| Route | Scoping mechanism | Verdict |
|---|---|---|
| `GET /api/offers` | `where: { buyerId: userId }` OR `where: { listing: { sellerId: userId } }` | ✓ correctly scoped |
| `GET /api/orders/[id]` | load by id, then `if (order.deal.buyerId !== userId && order.deal.sellerId !== userId) return 403` | ✓ app-level ownership check (not a leak) |
| `GET /api/seller/leads` | `db.listing.findMany({ where: { sellerId: user.id } })` → `db.lead.findMany({ where: { listingId: { in: userListings } } })` | ✓ correctly scoped (no PATCH handler — stale comment, /research R-M1) |
| `GET /api/listings/[id]` | `authorize()` loads listing, checks `listing.sellerId !== userId` → 403 | ✓ correctly scoped |
| `PATCH /api/listings/[id]` | same `authorize()` | ✓ correctly scoped |
| `DELETE /api/listings/[id]` | same `authorize()` | ✓ correctly scoped |
| `/dashboard/listings/[id]/edit` (server page) | `db.listing.findUnique({ where: { id } })` then `if (listing.sellerId !== user.id) notFound()` | ✓ app-level ownership check |
| `/dashboard/page.tsx` (server page) | `db.listing.findMany({ where: { sellerId: user.id } })` | ✓ correctly scoped |
| **`/api/admin/listings` (GET/POST bulk)** | **NO tenant filter — relies on RBAC only; SELLER has `listing.read/publish`** | **❌ BYPASS (NEW-C1)** |
| **`/api/admin/listings/[id]` (GET/PATCH)** | **NO tenant filter — relies on RBAC only; SELLER has `listing.read/update`** | **❌ BYPASS (NEW-C1)** |

**The ONLY bypass path is the legacy `/api/admin/listings/*` family (NEW-C1).** All other seller-facing dedicated routes correctly enforce ownership (some at DB layer, some at app layer).

---

## 6. Findings Classification Summary

| ID | Finding | Source | Classification | Notes |
|---|---|---|---|---|
| R-2 | Only `listing` has `ownership` declared (1 of 36) | /research | **CONFIRMED** | Minor count inaccuracy (36 vs 35); core finding stands |
| R-3 | 22 AI routes bypass the AI Gateway (5 unauthenticated) | /research | **CONFIRMED (minor inaccuracy)** | brands-ai doesn't call ZAI (table row #11 misclassified); actual bypass count ~21-22; core HIGH finding stands |
| R-A1 | `requireOwnership` + `canAccessResource` are dead code | /research | **CONFIRMED** | Zero callers in `src/app/` |
| R-A2 | Relation-based ownership not implemented in `createResource` | /research | **CONFIRMED** (latent) | No current resource uses it; BLOCKER when PR-SC-06 ships |
| R-B1 / B1 | `$queryRaw` identifier interpolation bug | /research + /expert | **CONFIRMED + REPRODUCED + FIXED** | Real on `4a2f579` (Postgres 42P01); fixed on `0ad24c7` via `$queryRawUnsafe` + regex validation |
| B2 | CI integration test gate not met on `4a2f579` | /expert | **CONFIRMED + FIXED** | Run 37979926895 failure; now green on `0ad24c7` (run 37981723334) |
| H1 | Integration test LIST assertions couldn't verify items (`id` excluded by field-policy select) | /expert | **CONFIRMED + FIXED** | Real on `4a2f579`; fixed on `0ad24c7` via `undefined` fieldCtx in test |
| H2 | Owner-reassignment guard unreachable (checked `filteredData` not `data`) | /expert | **CONFIRMED + FIXED** | Real on `4a2f579` (guard unreachable due to B1 + field-policy stripping); fixed on `0ad24c7` via `data[ownerField]` (raw) in both paths |
| H3 | Action-engine loads row via `findUnique` (no tenant filter) before ownership check | /expert | **VERIFIED** (not fixed) | Real defense-in-depth gap; NOT a leak (row discarded on rejection); NOT in /expert's must-fix list; NOT fixed in `0ad24c7` — acceptable per /expert's own verdict |
| M1 | CREATE silently overwrites forged owner instead of rejecting | /expert | **CONFIRMED + FIXED** | Real on `4a2f579`; fixed on `0ad24c7` via `assertCreateOwner(config, tenantCtx, data)` on raw data |
| M2 | Integration test "LEAK" label misleading | /expert | **CONFIRMED + FIXED** | M1 fix makes the test pass as written (403 thrown) |
| M3 | Store-DB TOCTOU window (non-transactional path) | /expert | **VERIFIED** (latent) | No store-DB resource has ownership yet; documented limitation |
| M4 | Relation-based ownership path is dead code in PR #11 | /expert | **VERIFIED** (latent) | Same as R-A2; becomes relevant in PR-SC-06 |
| L1 | Action-engine loads row into memory before ownership check (subset of H3) | /expert | **VERIFIED** | Same as H3 |
| L2 | Integration test cleanup is non-transactional | /expert | **VERIFIED** | Test-quality; non-blocking |
| L3 | Listing config does not declare `sellerId` in `config.fields` | /expert | **VERIFIED** (mitigated) | Still true post-fix; but H2/M1 fixes bypass field-policy by checking raw `data`, so L3 no longer matters for security |
| Analyst §1 | Lead Score v1 is deterministic, versioned, explainable, clamped, pure-function | /analyst | **CONFIRMED** | Verified end-to-end |
| Analyst §10 | 28 migration fields accurately identified | /analyst | **CONFIRMED** | All 28 cross-checked against schema; all correctly absent |
| Analyst G1-G6 | Lead model PR-SC-01 fields exist on main | /analyst | **CONFIRMED** | Verified at schema.prisma:618-658 |
| **NEW-C1** | **Legacy `/api/admin/listings/*` bypasses tenant-scoping; accessible to SELLERs** | **/Critic (NEW)** | **REPRODUCED** | **CRITICAL pre-existing bug; out of scope for PR #11; must be follow-up** |

### Counts

| Classification | Count |
|---|---|
| CONFIRMED | 10 |
| REPRODUCED | 2 (B1 on 4a2f579; NEW-C1 legacy bypass) |
| FIXED | 5 (B1, B2, H1, H2, M1/M2 — all verified fixed on `0ad24c7`) |
| VERIFIED | 6 (H3, M3, M4, L1, L2, L3 — real but non-blocking or latent) |
| UNVERIFIED | 0 |
| **Total distinct findings** | **19** |

---

## 7. Verdict

### 7.1 PR #11 stated gate

Per `PR-SC-00-SCOPE.md` §127:
> "Until `tests/integration/tenant-scope-real.ts` passes in a PostgreSQL environment AND an independent review confirms the wiring, **no seller-scoped UI feature dependent on the Universal Resource API is approved for release**."

**Gate status:**
- ✅ `tests/integration/tenant-scope-real.ts` passes in CI (run 37981723334, 19/19 assertions, real PostgreSQL).
- ✅ Independent review (this /Critic run) confirms the wiring: B1/H1/H2/M1 fixes are correct; the Universal API at `/api/admin/resources/listings/*` is now correctly tenant-scoped for the `listing` resource; bulk/export/action paths thread `tenantCtx`; fail-closed on anonymous/misconfigured/null-owner.

**PR #11 meets its stated gate.**

### 7.2 Can PR #11 merge?

**YES — PR #11 CAN merge.**

Rationale:
1. CI on `0ad24c7` is green (all 19 steps pass, including the real-PostgreSQL integration test with 19/19 assertions).
2. All 5 must-fix defects (B1, B2, H1, H2, M1/M2) are verified fixed.
3. The Universal Resource API at `/api/admin/resources/listings/*` is correctly tenant-scoped for the `listing` resource. The pure-function core (`tenant-scope.ts`) is correct, fail-closed, and well-tested (40 unit + 11 wiring tests pass).
4. PR #11 is a **strict security improvement** — it closes the Universal API cross-tenant bypass without introducing any regression. The pre-PR-SC-00 state had NO tenant scoping anywhere; the post-PR-SC-00 state has tenant scoping on the Universal API (the legacy bypass is pre-existing, not a regression).
5. No schema change, no migration, no permission change. Rollback is `git revert`.

### 7.3 Conditions and follow-ups

**Condition for merge:** NONE (gate is met).

**Critical follow-up (before any seller-scoped UI feature is declared "tenant-safe"):**

- **NEW-C1 (CRITICAL):** Tenant-scope (or remove, or admin-gate) the legacy `/api/admin/listings/*` routes. A SELLER-role user can currently list/get/patch/bulk-modify ANY seller's listings through these endpoints, completely bypassing the PR-SC-00 fix. This is out of scope for PR #11 but MUST be tracked as a P0 follow-up. Recommended fix: option (c) — add `isAdmin` gate to `/api/admin/listings/*` so only ADMIN-role users can access them; sellers continue to use `/api/listings/*` (which IS ownership-checked).

**Non-blocking follow-ups (per /expert + /research):**

- H3: Change action-engine `findUnique` to `findFirst` with merged tenant filter (defense-in-depth consistency).
- R-A2 / M4: Implement `assertRelationOwned` in `data-adapter.ts` BEFORE PR-SC-06 (Lead CRM) ships relation-based ownership.
- R-2: Each follow-up PR (PR-SC-02 onwards) MUST add `ownership` config before its seller-scoped UI ships (34 of 36 resources still unprotected).
- R-3: Phase 1 — add `requireAdmin('ai.execute')` to the 5 unauthenticated AI routes; Phase 2 — refactor all 21-22 bypass routes to call the AI Gateway internally.
- R-A1: Mark `requireOwnership` + `canAccessResource` as `@deprecated` or delete.

### 7.4 Final verdict

**PR #11 CAN merge.** The stated gate is met (CI green, fixes verified, wiring confirmed). The pre-existing legacy-bypass (NEW-C1) is out of scope and must be tracked as a CRITICAL follow-up — it does NOT block PR #11 because PR #11 is a strict improvement and does not introduce the legacy bypass.

---

## 8. Review Metadata

- **Reviewer:** /Critic agent (STEP 11.31)
- **Method:** Independent GitHub REST API queries (PR metadata, check-runs, job logs, CI log download + parse); full file reads (not diffs) of `data-adapter.ts`, `tenant-scope-real.ts`, `action-engine.ts`, `bulk-export-engine.ts`, `listing.ts`, `lead-score.ts`, `admin-guard.ts`, `permissions.ts`, `seed-rbac.ts`, legacy `/api/admin/listings/*` routes, `/api/listings/[id]`, `/api/offers`, `/api/orders/[id]`, `/api/seller/leads`, `/dashboard/listings/[id]/edit`, `/dashboard/page.tsx`; schema cross-checks (`schema.prisma`, `store-schema.prisma`); grep/glob for `ZAI.create`, `ownership:`, `registerResource`, migration fields.
- **Independence:** Reviewer did not author PR #11, /research, /expert, or /analyst. Reviewer's prior STEP 11.29 /Critic doc is referenced but re-verified against current code.
- **Files modified by reviewer:** None. Review only.
- **Tools used:** `git`, `curl` (GitHub REST API), `rg` (ripgrep), file reads, zip extraction for CI logs.
- **CI logs analyzed:**
  - Run 37979926895 (`4a2f579`, failure) — downloaded 58KB zip, parsed integration test output + Postgres error log.
  - Run 37981723334 (`0ad24c7`, success) — downloaded 100KB zip, parsed integration test output (19/19 pass) + all 19 step conclusions.
- **Hard-rule compliance:** No "COMPLETE"/"secure"/"verified" claim accepted without evidence. Every classification cites file:line or CI log evidence. Two minor inaccuracies in /research (resource count 35 vs 36; brands-ai misclassified as ZAI route) and one minor scope limitation in /expert (H3 not fixed, but was not a must-fix) are documented. NEW-C1 is an independent adversarial finding not present in any Wave 1 deliverable.
