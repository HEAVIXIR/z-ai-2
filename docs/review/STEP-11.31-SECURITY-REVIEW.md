# STEP 11.31 — Security Review of PR #11 (PR-SC-00 Tenant-Scoping)

**Task ID:** 11.31-/expert
**Agent:** /expert
**Date:** 2026-10-09
**Reviewer mandate:** Own the security + architecture health of PR #11 (PR-SC-00 tenant-scoping / BLOCKER-A4 fix).
**Repository:** /home/z/heavix
**Branch:** `security/pr-sc-00-tenant-scoping`
**Head SHA:** `4a2f57957e998daccc2d5ead47158edd535c9ff2`
**Base SHA:** `f59756263f71d381014c69908fdd2379683536ef` (main)
**GitHub PR:** https://github.com/HEAVIXIR/z-ai-2/pull/11
**CI run on 4a2f579:** https://github.com/HEAVIXIR/z-ai-2/actions/runs/37979926895

---

## 0. Executive Summary

**Verdict: PR #11 is NOT VERIFIED.**

The pure-function core of the tenant-scoping fix (`src/lib/admin/tenant-scope.ts`) is correct, fail-closed, and well-tested (40 unit tests + 11 wiring tests = 51 tests, all green in CI step 11). The wiring through the data-adapter and route handlers is structurally complete — every read/write path threads a server-resolved `TenantAccessContext`.

**However, the real-API-path integration test (`tests/integration/tenant-scope-real.ts`) — which the PR itself wires into CI in commit `4a2f579` — FAILS on the PR HEAD.** GitHub Actions run 37979926895 completed with `conclusion: failure`; the integration test step exited with 6 of 19 assertions failing and `Process completed with exit code 1`.

The root cause is a single BLOCKER-level defect in `src/lib/admin/data-adapter.ts` lines 273–281 (and the parallel branch at 279–281): Prisma's `$queryRaw` tagged-template literal treats ALL `${...}` interpolations as bound parameters, so `"${tableName}""` becomes `"$1"` in the emitted SQL, producing `SELECT * FROM "$1" WHERE "id" = $2 FOR UPDATE` — which PostgreSQL rejects with `relation "$1" does not exist` (SQLSTATE 42P01). This breaks UPDATE-on-own-listing for every non-admin/non-moderator user on a tenant-scoped resource (the primary positive use case the PR is supposed to enable), and it makes the STEP 11.23 SELECT-FOR-UPDATE TOCTOU mitigation unreachable for tenant-scoped updates.

Per the worklog's recorded gate (STEP 11.30 Phase B): *"the gate is 'seller data separation confirmed by independent negative tests that run the real API path.'"* Per the /expert task brief: *"if CI runs the integration test and it passes, that IS the authorized PG environment."* CI runs the integration test. It FAILS. The gate is not met.

| Severity | Count |
|----------|-------|
| BLOCKER  | 2     |
| HIGH     | 3     |
| MEDIUM   | 4     |
| LOW      | 3     |
| **Total**| **12**|

---

## 1. Scope of Review

### 1.1 Files audited (full read, not skim)

**New code (PR-SC-00):**
- `src/lib/admin/tenant-scope.ts` (288 lines) — pure-function core
- `src/lib/admin/types.ts` — `AdminOwnershipConfig` interface added (L287–339)
- `src/lib/admin/resources/listing.ts` — `ownership` declared on listingConfig
- `tests/integration/tenant-scope-real.ts` (202 lines) — real-API integration test
- `tests/security/tenant-scope.test.ts` (291 lines) — 40 pure-function unit tests
- `tests/security/tenant-scope-wiring.test.ts` (215 lines) — 11 wiring contract tests
- `.github/workflows/ci.yml` — two CI steps added (Seed RBAC + Integration tests)

**Modified code (PR-SC-00 wiring):**
- `src/lib/admin/data-adapter.ts` — all 5 functions (`listResources`, `getResource`, `createResource`, `updateResource`, `deleteResource`) + new `updateResourceNonTransactional`
- `src/app/api/admin/resources/[resource]/route.ts` — GET + POST
- `src/app/api/admin/resources/[resource]/[id]/route.ts` — GET + PATCH + DELETE
- `src/app/api/admin/resources/[resource]/bulk/route.ts` — POST bulk
- `src/app/api/admin/resources/[resource]/export/route.ts` — GET export
- `src/app/api/admin/resources/[resource]/[id]/action/route.ts` — POST action
- `src/lib/admin/action-engine.ts` — `ActionContext.tenantCtx` + ownership check inside `executeAction`
- `src/lib/admin/bulk-export-engine.ts` — `executeExport` threads tenant filter; `executeBulkAction` passes `tenantCtx` via `ActionContext`

### 1.2 Methodology

1. Read worklog for context (STEP 11.29 / 11.30 — A4 confirmed real on main 4566efd→f597562; PR #11 opened at 7371d40, rebased + CI-wired at 4a2f579).
2. Checked out `security/pr-sc-00-tenant-scoping` at HEAD `4a2f579`. Working tree clean.
3. Read every changed file end-to-end (not just diffs).
4. Traced every read/write path from route handler → data-adapter → Prisma query.
5. Independently verified the pure-function logic by running `bunx vitest run tests/security/tenant-scope.test.ts tests/security/tenant-scope-wiring.test.ts` locally — **51/51 pass**.
6. Queried GitHub API for CI status on `4a2f579` and downloaded the failed job's log blob.
7. Did NOT modify any code, schema, migration, or PR.

---

## 2. CI Status on HEAD `4a2f579` (Authoritative)

### 2.1 PR metadata (GitHub REST API)

```
state             : open
merged            : False
mergeable         : True
mergeable_state   : unstable     ← CI is failing
head.sha          : 4a2f57957e998daccc2d5ead47158edd535c9ff2
base.sha          : f59756263f71d381014c69908fdd2379683536ef
changed_files     : 16
additions         : 1540
deletions         : 97
```

### 2.2 Check-runs on `4a2f579`

```
total_count : 1
name        : verify
status      : completed
conclusion  : failure      ← GATE NOT MET
run_id      : 37979926895
job_id      : 113987536704
html_url    : https://github.com/HEAVIXIR/z-ai-2/actions/runs/37979926895/job/113987536704
started_at  : 2026-10-09T19:23:46Z
completed_at: 2026-10-09T19:26:05Z  (≈2m19s)
```

### 2.3 Per-step result (from job log)

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
| 11 | Security tests (`bun run test:security`) | ✓ success ← 51/51 pure-function tests pass |
| 12 | Seed RBAC | ✓ success |
| **13** | **Integration tests (`bunx tsx tests/integration/tenant-scope-real.ts`)** | **✗ failure** |
| 14 | Static contract tests | ⤵ skipped (prior step failed) |
| 15 | Production build | ⤵ skipped (prior step failed) |

### 2.4 Integration test output (verbatim from CI log)

```
═══════════════════════════════════════════
  PR-SC-00 — Real PostgreSQL Tenant Scoping
═══════════════════════════════════════════

── 1. LIST: Seller A sees only their own listings ──
  ❌ Seller A sees their own listing aList1
  ❌ Seller A sees their own listing aList2
  ✅ Seller A does NOT see Seller B's listing (NEGATIVE)
  ✅ Seller A total = 2 (got 2)

── 2. LIST: Seller B sees only their own listing ──
  ❌ Seller B sees their own listing bList1
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
prisma:error
Invalid `prisma.$queryRaw()` invocation:

Raw query failed. Code: `42P01`. Message: `relation "$1" does not exist`
  ❌ Seller A UPDATE on own listing failed unexpectedly: Failed to load persisted record (FOR UPDATE):
Invalid `prisma.$queryRaw()` invocation:

Raw query failed. Code: `42P01`. Message: `relation "$1" does not exist`

── 9. UPDATE: Seller A cannot reassign owner to another user ──
prisma:error
Invalid `prisma.$queryRaw()` invocation:

Raw query failed. Code: `42P01`. Message: `relation "$1" does not exist`
  ❌ Seller A owner-reassignment throws forbidden (NEGATIVE ✓)

── 10. DELETE: Seller A cannot delete Seller B's listing ──
  ✅ Seller A DELETE on B's listing throws not-found (NEGATIVE ✓)
  ✅ Seller B's listing still exists after A's failed delete

── 11. CREATE: Seller A cannot create a listing with sellerId = B ──
  ❌ Seller A creating with sellerId=B should FAIL (NEGATIVE — got success = LEAK)

── 12. CREATE: Seller A can create a listing (owner injected) ──
  ✅ Seller A create injects their own sellerId (POSITIVE)

── 13. buildTenantWhere: pure function confirms the filter shape ──
  ✅ buildTenantWhere for seller A = { sellerId: A }

── Cleanup ──

═══════════════════════════════════════════
  RESULT: 13 passed, 6 failed
═══════════════════════════════════════════
##[error]Process completed with exit code 1.
```

Postgres log captured the exact failing statement:
```
2026-10-09 19:26:00.746 UTC [175] ERROR:  relation "$1" does not exist at character 30
2026-10-09 19:26:00.746 UTC [175] STATEMENT:
              SELECT * FROM "$1" WHERE "id" = $2 FOR UPDATE
```

**CI integration test result on `4a2f579`: FAILS (13/19 pass, 6/19 fail, exit 1).**

---

## 3. Path-by-Path Audit

For each Universal Resource API path: trace `tenantCtx` from route handler → data-adapter → Prisma query. Verify fail-closed on anonymous, misconfigured ownership, null owner, and non-admin-without-moderate-perm.

### 3.1 LIST — GET `/api/admin/resources/:resource`

| Layer | File:Line | Behavior |
|-------|-----------|----------|
| Route | `src/app/api/admin/resources/[resource]/route.ts:67–136` | `requireAdmin(readPerm)` → 401 anon / 403 no-perm. Then `resolveTenantCtx(user?.id ?? null, config)` calls `isAdmin(userId)` + `can(userId, config.ownership?.moderatePermission)`. Passes `tenantCtx` to `listResources`. |
| Adapter | `src/lib/admin/data-adapter.ts:74–113` | `buildTenantWhere(config, tenantCtx)` → `mergeTenantWhere` into BOTH `prismaQuery.where` (findMany) AND `countWhere` (count). ✓ Count is tenant-filtered. |
| Prisma | `model.findMany({ where: listWhere })` + `model.count({ where: totalWhere })` | Both queries carry the tenant filter. ✓ |

**Fail-closed verification:**
- Anonymous: `requireAdmin` returns 401 before `tenantCtx` is built. Defense-in-depth: `buildTenantWhere` would return `{ denyAll: true }` → `mergeTenantWhere` produces `{ id: '__tenant_scope_deny_all__' }` (matches no row). ✓
- Non-admin without `moderatePermission`: `{ sellerId: userId }` filter. ✓
- Admin: `{}` filter (no restriction). ✓
- Moderator: `{}` filter (no restriction). ✓
- Misconfigured ownership (neither ownerField nor relation): `{ denyAll: true }`. ✓
- Null ownerField on a row: row's `sellerId` is null → does not match `{ sellerId: 'user-id' }` → excluded. ✓

**Count-leak verification:** `totalWhere = mergeTenantWhere(countWhere, tenantResult)` — the count is filtered identically to the list. The response's `pagination.total` reflects only the user's own rows. ✓ No leak via count.

**Wiring test proof:** `tests/security/tenant-scope-wiring.test.ts:96–153` mocks the Prisma model and verifies `findMany` and `count` both receive `{ sellerId: 'seller-A' }`. ✓ (These tests pass in CI step 11.)

### 3.2 GET single — GET `/api/admin/resources/:resource/:id`

| Layer | File:Line | Behavior |
|-------|-----------|----------|
| Route | `src/app/api/admin/resources/[resource]/[id]/route.ts:46–78` | `requireAdmin(readPerm)` → `resolveTenantCtx` → `getResource(config, id, { userId }, tenantCtx)`. If `null` → 404. |
| Adapter | `src/lib/admin/data-adapter.ts:120–147` | `tenantCtx` present → `buildTenantWhere` → `mergeTenantWhere({ id }, tenantResult)` → `model.findFirst({ where })`. Non-owner → `null` → route returns 404. ✓ |
| Prisma | `model.findFirst({ where: { AND: [{ id }, { sellerId: userId }] } })` | Tenant filter applied at DB layer — row never loaded into app memory for non-owners. ✓ |

**No `FOR UPDATE` / `$queryRaw` in this path** — uses `findFirst`, which is safe. ✓ (This is why test 4 and test 5 pass.)

### 3.3 CREATE — POST `/api/admin/resources/:resource`

| Layer | File:Line | Behavior |
|-------|-----------|----------|
| Route | `src/app/api/admin/resources/[resource]/route.ts:139–220` | `requireAdmin(createPerm)` → `validateResourcePayload` → `resolveTenantCtx` → `createResource(config, body, { userId }, tenantCtx)`. Catches `statusCode=403` → returns 403. |
| Adapter | `src/lib/admin/data-adapter.ts:160–202` | 1. `applyFieldWritePolicyAsync` (strips unknown fields, enforces `permissions.write` per field, fail-closed). 2. `assertCreateOwner(config, tenantCtx, filteredData)`. 3. If `injectOwner` (direct ownership + payload omitted ownerField), inject `tenantCtx.userId`. 4. `model.create`. |

**Mass-assignment audit:**
- Field-policy strips any field not in `config.fields` (L150–155: `if (!field) continue;`). For Listing, `sellerId` is NOT in `config.fields` → **always stripped**.
- After stripping, `assertCreateOwner` checks the (now-stripped) payload. Since `sellerId` is absent, it returns `{ ok: true, injectOwner: 'sellerId' }` → `filteredData.sellerId = tenantCtx.userId`.
- **Net security outcome:** a non-admin cannot create a Listing owned by another user. The forged `sellerId` is silently replaced with the authenticated user's id. **No cross-tenant create is possible.** ✓
- **API surface issue:** the API returns 201 (success) when the user submitted a forged `sellerId`, rather than 403. The user's intent is silently overridden. See M1 / M2.

**Owner-reassignment-via-PATCH audit:** see §3.4.

### 3.4 UPDATE — PATCH `/api/admin/resources/:resource/:id`  ← BLOCKER HERE

| Layer | File:Line | Behavior |
|-------|-----------|----------|
| Route | `src/app/api/admin/resources/[resource]/[id]/route.ts:81–154` | `requireAdmin(updatePerm)` → `validateResourcePayload` → `resolveTenantCtx` → `updateResource(config, id, body, { userId }, tenantCtx)`. Catches `statusCode=404` → 404, `statusCode=403` → 403. |
| Adapter (main-DB) | `src/lib/admin/data-adapter.ts:218–342` | `db.$transaction(async (tx) => { ... })`. Inside: build `tenantWhere`; if non-empty → `txModel.findFirst({ where: { id, ...tenantWhere } })` (confirms ownership); if found → `tx.$queryRaw\`SELECT * FROM "${tableName}" WHERE "id" = ${id} FOR UPDATE\`` (re-lock); then `checkRowOwnership` defense-in-depth; then `applyFieldWritePolicyAsync`; then owner-reassignment guard (L326–336); then `txModel.update`. |
| Adapter (store-DB) | `src/lib/admin/data-adapter.ts:344–418` | Non-transactional: `findFirst` (tenant-filtered) → `checkRowOwnership` → field-policy → owner-reassignment guard → `model.update`. |

#### 3.4.1 BLOCKER B1 — `$queryRaw` identifier interpolation bug

**Evidence (file:line + code quote):**

`src/lib/admin/data-adapter.ts:268–283`:
```ts
if (Object.keys(tenantWhere).length > 0) {
  const locked = await txModel.findFirst({ where: { id, ...tenantWhere }, select: { id: true } });
  if (!locked) {
    persistedRecord = null;
  } else {
    const rows = await tx.$queryRaw`
      SELECT * FROM "${tableName}" WHERE "id" = ${id} FOR UPDATE
    ` as Record<string, unknown>[];
    persistedRecord = rows.length > 0 ? rows[0] : null;
  }
} else {
  const rows = await tx.$queryRaw`
    SELECT * FROM "${tableName}" WHERE "id" = ${id} FOR UPDATE
  ` as Record<string, unknown>[];
  persistedRecord = rows.length > 0 ? rows[0] : null;
}
```

**The bug:** Prisma's `$queryRaw` tagged-template literal treats **every** `${...}` interpolation as a *bound parameter*, never as a SQL identifier. So `"${tableName}"` emits `"$1"` (a parameter placeholder quoted as a string literal), and `${id}` emits `$2`. The resulting SQL sent to PostgreSQL is:

```sql
SELECT * FROM "$1" WHERE "id" = $2 FOR UPDATE
```

PostgreSQL parses `"$1"` as a literal table name (the string `$1`), looks it up in the catalog, and returns:

```
ERROR: relation "$1" does not exist  SQLSTATE 42P01
```

This is a well-known Prisma gotcha documented at https://www.prisma.io/docs/orm/prisma-client/queries/raw-database-access/raw-queries (tagged templates support *values*, not identifiers; for identifiers one must use `Prisma.raw()` or `$queryRawUnsafe` with manual validation).

**Reproduction scenario (executed by CI on 4a2f579):**
1. Seller A authenticates.
2. PATCH `/api/admin/resources/listings/{aList1.id}` with `{ "title": "renamed" }`.
3. `resolveTenantCtx` returns `{ userId: sellerA, isAdmin: false, hasModeratePerm: false }`.
4. `buildTenantWhere` returns `{ where: { sellerId: sellerA } }` — non-empty.
5. `txModel.findFirst({ where: { id, sellerId: sellerA } })` returns the row (Seller A owns it).
6. `tx.$queryRaw\`SELECT * FROM "${'Listing'}" WHERE "id" = ${id} FOR UPDATE\`` throws `PrismaClientKnownRequestError: Raw query failed. Code: 42P01. Message: relation "$1" does not exist`.
7. The catch block at L284–288 wraps it as `Error('Failed to load persisted record (FOR UPDATE): ...')` — no `statusCode` is set, so the route's `if (errorWithStatus.statusCode === 404)` and `=== 403` both miss, and the route returns HTTP 500 with `error: 'Failed to update', details: 'Failed to load persisted record (FOR UPDATE): ...'`.

**Impact:**
1. **Owner cannot UPDATE their own listing.** The primary positive use case of PR-SC-00 — a seller editing their own listing through the Universal Resource API — is broken for every non-admin / non-moderator user on every tenant-scoped resource.
2. **STEP 11.23 TOCTOU mitigation is unreachable for tenant-scoped updates.** The SELECT-FOR-UPDATE lock never acquires because the SQL fails before the lock. The TOCTOU window is reopened for tenant-scoped UPDATEs (until B1 is fixed).
3. **Owner-reassignment guard (data-adapter.ts:326–336) is dead code on the main-DB path.** The guard runs after the persisted-record load. Since the load fails, the guard is never reached. Test 9 (owner-reassignment) therefore fails with the wrong error message — "Failed to load persisted record" instead of "Forbidden: cannot reassign ownership field". See H2.
4. **CI integration test FAILS** (6/19 assertions, exit 1, GitHub Actions run 37979926895 conclusion=failure).
5. **PR #11 gate not met.** Per worklog STEP 11.30: *"the gate is 'seller data separation confirmed by independent negative tests that run the real API path.'"* CI runs the integration test. It FAILS.

**Fix recommendation:**

Use `Prisma.raw()` to interpolate the identifier safely (Prisma validates it's treated as SQL, not a parameter), or validate `tableName` against an allowlist and use `$queryRawUnsafe`:

```ts
// Option A — Prisma.raw for the identifier (preferred):
import { Prisma } from '@prisma/client';
const rows = await tx.$queryRaw`
  SELECT * FROM ${Prisma.raw(`"${tableName}"`)} WHERE "id" = ${id} FOR UPDATE
`;

// Option B — $queryRawUnsafe with allowlist validation:
if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(tableName)) {
  throw new Error(`Invalid table name: ${tableName}`);
}
const rows = await tx.$queryRawUnsafe(
  `SELECT * FROM "${tableName}" WHERE "id" = $1 FOR UPDATE`,
  id,
);
```

Option A is preferred because it keeps the parameter binding for `id` (no SQL-injection surface). The `tableName` is derived from `config.model`, which is a hardcoded string in the resource registry — but defense-in-depth still validates via Prisma's identifier handling.

After fixing B1, re-run the integration test in CI. Tests 8 and 9 should pass.

#### 3.4.2 HIGH H2 — Owner-reassignment guard unreachable until B1 fixed

**Evidence:** `src/lib/admin/data-adapter.ts:326–336` (guard) runs after `src/lib/admin/data-adapter.ts:273–283` (FOR UPDATE load that fails per B1).

```ts
// L326–336 — owner-reassignment guard
if (tenantCtx && config.ownership?.ownerField && !tenantCtx.isAdmin && !tenantCtx.hasModeratePerm) {
  const ownerField = config.ownership.ownerField;
  const newOwner = filteredData[ownerField];
  if (newOwner !== undefined && newOwner !== null && String(newOwner) !== tenantCtx.userId) {
    const err = new Error(
      `Forbidden: cannot reassign ownership field "${ownerField}" to another user`,
    ) as Error & { statusCode: number };
    err.statusCode = 403;
    throw err;
  }
}
```

The guard logic is **correct** (verified by reading + the pure-function test in `tenant-scope.test.ts`). But it runs after the persisted-record load. With B1 unfixed, the load throws before the guard is reached. The CI log shows test 9 failing because the thrown message is "Failed to load persisted record (FOR UPDATE): ..." — which contains neither "forbidden" nor "ownership".

**Reproduction:** Run integration test case 9 (Seller A PATCH with `{ sellerId: sellerB.id }` on their own listing).

**Impact:** The owner-reassignment defense-in-depth check is not currently reachable on the main-DB path. After B1 is fixed, this guard becomes reachable and test 9 should pass (the test asserts the message includes "ownership" or "forbidden" — the guard throws exactly that).

**Note on field-policy interaction:** for the Listing resource specifically, `sellerId` is NOT in `config.fields`, so `applyFieldWritePolicyAsync` (L308–320) strips `sellerId` from `filteredData` before the guard runs. The guard then sees `newOwner === undefined` → skips. So even after B1 is fixed, the guard is **unreachable for the Listing resource** because of the field-policy stripping. See L3.

**Fix:** Fix B1 first. Then either (a) add `sellerId` to `listingConfig.fields` so the field-policy keeps it through (then the guard fires), or (b) run the owner-reassignment guard on `data` (pre-strip) rather than `filteredData` (post-strip).

#### 3.4.3 Store-DB TOCTOU window (MEDIUM M3)

The store-DB path (`updateResourceNonTransactional`, L344–417) uses `findFirst` (tenant-filtered) then `update` (NOT tenant-filtered). Between the two, a concurrent request could change ownership:

1. T1 (Seller A): `findFirst({ where: { id, sellerId: A } })` → row returned, ownership ✓.
2. T2 (Admin): `update({ where: { id }, data: { sellerId: B } })` — admin reassigns listing to B.
3. T1: `update({ where: { id }, data: {...A's payload...} })` — writes A's payload to a row now owned by B. Cross-tenant write.

The comment at L207–211 explicitly acknowledges this: *"For store-DB resources, cross-DB transactions aren't supported — KNOWN LIMITATION, same as audit."*

**Mitigating factors:**
- No store-DB resource currently has `ownership` declared (only Listing, which is main-DB). The window is not currently exploitable.
- The pre-PR-SC-00 code had no tenant scoping at all, so this is strictly better.

**Fix recommendation:** For future store-DB tenant-scoped resources (e.g., if inventory gets ownership), use optimistic concurrency control (version column) or move to main DB. Document this as a known limitation in `PR-SC-00-SCOPE.md`.

### 3.5 DELETE — DELETE `/api/admin/resources/:resource/:id`

| Layer | File:Line | Behavior |
|-------|-----------|----------|
| Route | `src/app/api/admin/resources/[resource]/[id]/route.ts:157–212` | `requireAdmin(deletePerm)` → `resolveTenantCtx` → inside `auditMutation`: `getResource(config, id, { userId }, tenantCtx)` pre-check (non-owner → 404) → `deleteResource(config, id, tenantCtx)`. |
| Adapter | `src/lib/admin/data-adapter.ts:424–458` | `tenantCtx` present → `buildTenantWhere` → if `denyAll` → 404. Else `mergeTenantWhere({ id }, tenantResult)` → `model.findFirst({ where, select: { id: true } })`. If null → 404. Else soft/hard delete by `id`. |
| Prisma | `model.findFirst({ where: { AND: [{ id }, { sellerId: userId }] } })` then `model.update`/`model.delete` | Pre-check uses tenant filter; the actual delete is keyed only by `id` (the pre-check proved ownership). ✓ No `$queryRaw`. ✓ |

**Verified by CI:** Test 10 (Seller A DELETE on B's listing) passes — non-owner → 404, B's listing still exists. ✓

### 3.6 BULK — POST `/api/admin/resources/:resource/bulk`

| Layer | File:Line | Behavior |
|-------|-----------|----------|
| Route | `src/app/api/admin/resources/[resource]/bulk/route.ts:43–92` | `requireAdmin(actionDef.permission)` → `can(userId, actionDef.permission) || canBulkAction(...)` → `resolveTenantCtx` → `executeBulkAction({ ..., ctx: { userId, reason, tenantCtx } })`. |
| Engine | `src/lib/admin/bulk-export-engine.ts:59–173` | Per-id: `executeAction(resourceKey, id, actionKey, ctx)` — `ctx` carries `tenantCtx`. |
| Action-engine | `src/lib/admin/action-engine.ts:303–356` | `findUnique({ where: { id } })` (NO tenant filter — see H3) → `checkRowOwnership(config, ctx.tenantCtx, before)` → if not allowed → `{ success: false, message: 'Entity not found' }` (fail-closed, no leak). |

**Per-id ownership enforcement:** ✓ — `executeAction` checks ownership on every id in the bulk. Non-owners get "Entity not found" for that id; other ids proceed. Partial-failure result correctly reports per-id status.

**H3 (see below):** the `findUnique` loads the row into memory before the ownership check. Not a leak (row is discarded on rejection), but inconsistent with the data-adapter's filtered-`findFirst` approach.

### 3.7 EXPORT — GET `/api/admin/resources/:resource/export`

| Layer | File:Line | Behavior |
|-------|-----------|----------|
| Route | `src/app/api/admin/resources/[resource]/export/route.ts:50–107` | `requireAdmin(exportPerm || readPerm)` → `resolveTenantCtx` → `executeExport({ ..., ctx: { userId, tenantCtx } })`. |
| Engine | `src/lib/admin/bulk-export-engine.ts:197–228` | `buildTenantWhere(config, ctx.tenantCtx)` → `mergeTenantWhere(filters, tenantResult)` → `model.findMany({ where: exportWhere, take: 5000 })`. Then `filterExportableFieldsAsync` (field-level export permission). |
| Prisma | `model.findMany({ where: { AND: [filters, { sellerId: userId }] }, take: 5000 })` | Tenant filter applied at DB layer. ✓ |

**Count-leak verification:** the response's `X-Export-Row-Count` header reflects `exportableItems.length` (the post-filter, post-tenant-filter count). ✓ No leak via row count.

**Take-limit note:** `take: 5000` is a per-request cap on rows fetched. If a seller owns >5000 rows, the export truncates at 5000 — but this is a UX limitation, not a leak (no cross-tenant data is exposed). The cap applies equally to all users.

### 3.8 ACTION — POST `/api/admin/resources/:resource/:id/action`

| Layer | File:Line | Behavior |
|-------|-----------|----------|
| Route | `src/app/api/admin/resources/[resource]/[id]/action/route.ts:40–71` | `requireAdmin(actionDef.permission)` → `can(userId, actionDef.permission)` → `resolveTenantCtx` → `executeAction(resourceKey, id, body.action, { userId, reason, metadata, tenantCtx })`. |
| Engine | `src/lib/admin/action-engine.ts:303–356` | Permission check → `findUnique({ where: { id } })` → if `tenantCtx && config.ownership` → `checkRowOwnership(config, ctx.tenantCtx, before)` → if not allowed → `{ success: false, message: 'Entity not found' }` (fail-closed). |

**Fail-closed:** non-owners get "Entity not found" — no existence leak, no row mutation. ✓

**Transactional path:** for `action.transactional === true && config.database !== 'store'`, the action-engine re-fetches inside `db.$transaction` via `txModel.findUnique` (NOT raw FOR UPDATE). No `$queryRaw` bug here. ✓ But the transactional path does NOT re-check ownership inside the transaction — only the outer `findUnique` does. This means: if ownership changes between the outer check and the inner transactional handler, the handler could mutate a row no longer owned by the user. However, this is the same TOCTOU window that SELECT-FOR-UPDATE was supposed to close for the data-adapter; for the action-engine, the transactional path uses `findUnique` (no lock), so the window is open. Note: no action on Listing currently sets `transactional: true`, so this is latent.

---

## 4. Findings

### 4.1 BLOCKER B1 — `$queryRaw` identifier interpolation breaks UPDATE-on-own for tenant-scoped resources

- **Severity:** BLOCKER
- **File:Line:** `src/lib/admin/data-adapter.ts:273–281` (and parallel `:279–281`)
- **Code:**
  ```ts
  const rows = await tx.$queryRaw`
    SELECT * FROM "${tableName}" WHERE "id" = ${id} FOR UPDATE
  ` as Record<string, unknown>[];
  ```
- **Bug:** Prisma's `$queryRaw` tagged template treats `${tableName}` as a bound parameter, emitting `SELECT * FROM "$1" WHERE "id" = $2 FOR UPDATE` — PostgreSQL rejects with `relation "$1" does not exist` (42P01).
- **Reproduction:** `bunx tsx tests/integration/tenant-scope-real.ts` (CI does this on every PR). 6/19 assertions fail, exit 1.
- **Impact:**
  1. Owner cannot UPDATE their own listing via Universal Resource API (HTTP 500).
  2. STEP 11.23 SELECT-FOR-UPDATE TOCTOU mitigation unreachable for tenant-scoped UPDATEs.
  3. Owner-reassignment guard (L326–336) unreachable on main-DB path (see H2).
  4. CI integration test FAILS → PR #11 gate not met.
- **Fix:** Use `Prisma.raw(\`"${tableName}"\`)` for the identifier, or `$queryRawUnsafe` after allowlist validation. Example:
  ```ts
  import { Prisma } from '@prisma/client';
  const rows = await tx.$queryRaw`
    SELECT * FROM ${Prisma.raw(`"${tableName}"`)} WHERE "id" = ${id} FOR UPDATE
  `;
  ```
- **Status:** Must fix before merge.

### 4.2 BLOCKER B2 — CI integration test gate not met on `4a2f579`

- **Severity:** BLOCKER (meta-finding — captures the CI-level verdict)
- **Evidence:**
  - GitHub Actions run 37979926895: `conclusion: failure`, job 113987536704 step 13 exit 1.
  - Integration test result: 13 passed, 6 failed.
  - PR `mergeable_state: unstable`.
- **Gate (per worklog STEP 11.30 Phase B):** *"seller data separation confirmed by independent negative tests that run the real API path."*
- **Verdict:** CI runs the integration test (in the authorized PG environment per the /expert task brief). It FAILS. Gate NOT met.
- **Fix:** Fix B1, then re-run CI. The 6 failing assertions should reduce to ~3 (B1 fixes tests 8 and 9; tests 1, 2, 5-listing-portion need H1 fix; test 11 needs M1 or M2 fix).
- **Status:** Must fix before merge.

### 4.3 HIGH H1 — Integration test LIST assertions cannot verify items (`id` excluded by field-policy select)

- **Severity:** HIGH
- **File:Line:** `tests/integration/tenant-scope-real.ts:101, 109, 116` (pass `{ userId }` as `fieldCtx`)
- **Code:**
  ```ts
  const aListResult = await listResources(config, queryParams, { userId: sellerA.id }, sellerACtx);
  const aListIds = (aListResult.items as { id: string }[]).map((i) => i.id).sort();
  assert(aListIds.includes(aList1.id), "Seller A sees their own listing aList1");
  ```
- **Bug:** When `fieldCtx` is passed, `applyFieldPolicy` (field-policy.ts:44–68) checks if any column/field has `permissions.read`. For Listing, `sellerPhone` has `permissions.read: 'user.read'`, so `hasFieldPerms = true`. The function returns a `select` object containing only `config.columns` keys: `title, status, listingType, price, condition, city, year, viewCount, featured, verified, createdAt`. **`id` is NOT in this list.** So `findMany` returns items WITHOUT an `id` field. `(i) => i.id` returns `undefined`.
- **Reproduction:** CI log lines 611, 612, 617 (3 of the 6 failures).
- **Impact:**
  1. The integration test CANNOT verify that LIST returns the correct items. Only the count is verified.
  2. The negative assertion `!aListIds.includes(bList1.id)` passes accidentally — `[undefined, undefined].includes(bList1.id)` is `false`, so `!false === true`. The negative case passes for the wrong reason.
  3. The LIST tenant-scoping IS correctly applied (verified by count: 2 for Seller A, 1 for Seller B, 3 for Admin), but the test cannot prove it at the item level.
- **Fix:** In the integration test, either:
  - Pass `undefined` as `fieldCtx` (so `applyFieldPolicy` is not called → `select` is `undefined` → all fields returned including `id`), or
  - Use a separate non-field-policy read for the verification: `db.listing.findMany({ where: { sellerId: sellerA.id } })` and compare id sets.
- **Status:** Must fix before merge (otherwise the LIST tenant-scoping is not actually proven by the integration test).

### 4.4 HIGH H2 — Owner-reassignment guard unreachable on main-DB path (depends on B1)

- **Severity:** HIGH (defense-in-depth check dead until B1 fixed)
- **File:Line:** `src/lib/admin/data-adapter.ts:326–336` (guard) runs after `:273–283` (load that fails per B1)
- **Code:** see §3.4.1 quote.
- **Reproduction:** Integration test case 9 (Seller A PATCH with `{ sellerId: sellerB.id }` on own listing) — throws "Failed to load persisted record" not "Forbidden: cannot reassign ownership".
- **Impact:** Even after B1 is fixed, the guard is unreachable for the Listing resource specifically, because `applyFieldWritePolicyAsync` (L308–320) strips `sellerId` before the guard runs (see L3). The guard only fires for resources whose `config.fields` declares `sellerId` (none currently do).
- **Fix:** Fix B1 first. Then either (a) add `sellerId` to `listingConfig.fields` so the field-policy keeps it through, or (b) run the owner-reassignment guard on the raw `data` (pre-strip) rather than `filteredData` (post-strip). Option (b) is preferred — the guard should not depend on field-policy behavior.
- **Status:** Must fix before merge (otherwise owner-reassignment is not testable).

### 4.5 HIGH H3 — Action-engine loads row via `findUnique` (no tenant filter) before ownership check

- **Severity:** HIGH (defense-in-depth inconsistency; not a leak)
- **File:Line:** `src/lib/admin/action-engine.ts:340`
- **Code:**
  ```ts
  before = await model.findUnique({ where: { id: entityId } });
  ```
- **Issue:** The action-engine loads the row by `id` only (no tenant filter), then calls `checkRowOwnership(config, ctx.tenantCtx, before)` to enforce ownership in application memory. The data-adapter, by contrast, uses `findFirst` with the merged tenant filter — so the DB never returns the row to the app for non-owners.
- **Security analysis:** For a non-owner, the row's content is briefly loaded into server memory, then `checkRowOwnership` rejects → "Entity not found" returned to client. The row is never returned, never logged, never serialized. **This is not a leak.** ✓
- **Impact:**
  1. Inconsistent with the data-adapter's defense-in-depth approach.
  2. The row's potentially sensitive fields (e.g., `sellerPhone` for Listing) are in memory briefly. Server-side only — no client leak.
  3. Relies on `checkRowOwnership` being correct for every action. If a future refactor forgets to call it, the action-engine would mutate any row by id.
- **Fix:** Change to `findFirst` with merged tenant filter when `tenantCtx` is provided:
  ```ts
  const tenantResult = ctx.tenantCtx ? buildTenantWhere(config, ctx.tenantCtx) : null;
  if (tenantResult && 'denyAll' in tenantResult) {
    return { success: false, action: actionKey, entityId, message: 'Entity not found' };
  }
  const where = tenantResult
    ? mergeTenantWhere({ id: entityId }, tenantResult)
    : { id: entityId };
  before = await model.findFirst({ where });
  ```
- **Status:** Should fix before merge (defense-in-depth hardening).

### 4.6 MEDIUM M1 — CREATE silently overwrites forged owner instead of explicitly rejecting

- **Severity:** MEDIUM
- **File:Line:** `src/lib/admin/data-adapter.ts:184–198`
- **Code:**
  ```ts
  if (tenantCtx) {
    const ownerCheck = assertCreateOwner(config, tenantCtx, filteredData);
    if (!ownerCheck.ok) { ... throw err; }
    if (ownerCheck.injectOwner && ownerCheck.injectOwner !== '__relation__') {
      filteredData = { ...filteredData, [ownerCheck.injectOwner]: tenantCtx.userId };
    }
  }
  ```
- **Issue:** `assertCreateOwner` runs AFTER `applyFieldWritePolicyAsync` (L168–182) which strips fields not in `config.fields`. For Listing, `sellerId` is not in `config.fields` → stripped. `assertCreateOwner` then sees no `sellerId` in `filteredData` → returns `{ ok: true, injectOwner: 'sellerId' }` → `filteredData.sellerId = tenantCtx.userId`. The user's intent (create listing owned by someone else) is silently overridden, and the API returns 201.
- **Reproduction:** Integration test case 11 (Seller A POST with `{ sellerId: sellerB.id }`) — succeeds (creates listing with sellerId=sellerA), test labels it "LEAK".
- **Security outcome:** ✓ No cross-tenant create possible (the listing ends up owned by the authenticated user). The "LEAK" label is misleading (see M2).
- **API surface issue:** The API returns 201 when the user submitted a forged owner, rather than 403. The user's intent is silently overridden.
- **Fix:** Run `assertCreateOwner` on the raw `data` (pre-strip) before `applyFieldWritePolicyAsync`, so the explicit rejection branch fires:
  ```ts
  if (tenantCtx) {
    const ownerCheck = assertCreateOwner(config, tenantCtx, data);  // raw data, pre-strip
    if (!ownerCheck.ok) { ... throw err; }
    // ... then applyFieldWritePolicyAsync, then inject owner if needed
  }
  ```
- **Status:** Should fix before merge (defense-in-depth + clear API semantics).

### 4.7 MEDIUM M2 — Integration test "LEAK" label is misleading (no actual leak)

- **Severity:** MEDIUM (test-quality)
- **File:Line:** `tests/integration/tenant-scope-real.ts:168–172`
- **Code:**
  ```ts
  try {
    await createResource(config, { ..., sellerId: sellerB.id, ... }, { userId: sellerA.id }, sellerACtx);
    assert(false, "Seller A creating with sellerId=B should FAIL (NEGATIVE — got success = LEAK)");
  } catch (e) {
    assert(... "forbidden" || "owner", "Seller A cross-tenant create throws forbidden (NEGATIVE ✓)");
  }
  ```
- **Issue:** The test labels a successful create as "LEAK", but per M1 the create actually creates a listing owned by sellerA (not sellerB). No leak occurs. The test would fail identically whether the implementation creates with sellerId=A (correct) or sellerId=B (real leak) — so it provides no real security guarantee.
- **Fix:** Either (a) fix M1 so the code rejects the forged sellerId (then this test passes as written), or (b) change the test to verify the resulting listing's `sellerId === sellerA.id` (proving no leak) instead of expecting a rejection. Option (a) is preferred.
- **Status:** Should fix before merge.

### 4.8 MEDIUM M3 — TOCTOU window in store-DB non-transactional path

- **Severity:** MEDIUM (latent — no store-DB resource currently has `ownership`)
- **File:Line:** `src/lib/admin/data-adapter.ts:344–417` (`updateResourceNonTransactional`)
- **Code:** `findFirst({ where: { id, ...tenantWhere } })` → `model.update({ where: { id } })` — the update is keyed only by `id`, not by the tenant filter.
- **Issue:** A concurrent request could change ownership between the findFirst and the update. See §3.4.3 for the full trace.
- **Mitigating factors:**
  - No store-DB resource currently has `ownership` declared (only Listing, which is main-DB).
  - Pre-PR-SC-00 code had no tenant scoping at all → strictly better.
  - Documented as a known limitation in code comments (L207–211).
- **Fix:** For future store-DB tenant-scoped resources, use optimistic concurrency control (version column) or move to main DB. Document in `PR-SC-00-SCOPE.md`.
- **Status:** Defer to PR-SC-05+ (when store-DB resources get ownership). Note in scope doc.

### 4.9 MEDIUM M4 — Relation-based ownership path is dead code in PR #11

- **Severity:** MEDIUM (coverage gap)
- **File:Line:** `src/lib/admin/tenant-scope.ts:107–118` (`buildOwnerFilter` for `relation`)
- **Issue:** The `relation` branch of `buildOwnerFilter` is exercised by pure-function unit tests (`tenant-scope.test.ts:97–105`) but NOT by any integration test. No resource in PR #11 declares `relation`-based ownership — only Listing (direct `ownerField`). PR-SC-05 (Lead CRM) is expected to add `relation: { field: 'listing', ownerField: 'sellerId' }` for Lead.
- **Latent bug:** When PR-SC-05 adds relation-based ownership, `updateResource` will hit the same `$queryRaw` bug (B1) because the tenant filter is non-empty (`{ listing: { sellerId: userId } }`) → enters the FOR UPDATE branch → same `relation "$1" does not exist` error.
- **Fix:** When PR-SC-05 adds relation-based ownership, also:
  1. Extend the integration test to cover Lead (relation-based).
  2. Verify the data-adapter's `findFirst` correctly handles the nested filter (Prisma supports `{ listing: { sellerId: x } }` natively — should work).
  3. The $queryRaw bug must already be fixed by then (B1).
- **Status:** Note for PR-SC-05. Not a PR #11 blocker (no resource uses it yet).

### 4.10 LOW L1 — Action-engine loads row into memory before ownership check (subset of H3)

- Already covered by H3. Listed separately for traceability.

### 4.11 LOW L2 — Integration test cleanup is non-transactional; failures leave test data

- **Severity:** LOW (test maintainability)
- **File:Line:** `tests/integration/tenant-scope-real.ts:188–191`
- **Issue:** Cleanup runs only at the end of `main()`. If the test fails mid-way (e.g., on assertion 8 — which it does in CI), the cleanup still runs (because `main()` continues after assertion failures — `assert` doesn't throw). However, if `main()` throws (e.g., a Prisma error during setup), cleanup is skipped. The test creates users with hardcoded emails (`sc00-seller-a@test.local` etc.) — re-runs after a setup failure would hit the email `@unique` constraint.
- **Fix:** Wrap setup + body + cleanup in `try/finally`, or use `upsert`, or use unique emails per run.
- **Status:** Non-blocking. Note for test hardening.

### 4.12 LOW L3 — Listing config does not declare `sellerId` in `config.fields`

- **Severity:** LOW (defense-in-depth gap)
- **File:Line:** `src/lib/admin/resources/listing.ts:65–109` (fields array — no `sellerId` entry)
- **Issue:** Because `sellerId` is not in `config.fields`, `applyFieldWritePolicyAsync` strips it on every CREATE/PATCH. This means:
  - `assertCreateOwner`'s explicit rejection branch (`{ ok: false, error: 'Forbidden: cannot create...' }`) is unreachable for Listing — the field is stripped before the check. See M1.
  - `updateResource`'s owner-reassignment guard (L326–336) is unreachable for Listing — `newOwner` is always `undefined` after stripping. See H2.
  - The security outcome is still correct (no cross-tenant write possible), but the explicit guards are dead code for Listing.
- **Fix:** Either (a) add `sellerId` to `config.fields` with `permissions: { write: 'admin.sellerId' }` (no real permission grants this — so non-admins can't write it, and assertCreateOwner's rejection branch becomes reachable), or (b) re-order checks per M1 (run `assertCreateOwner` on raw `data` before field-policy).
- **Status:** Non-blocking. Recommend (b) for cleanest semantics.

---

## 5. Path Coverage Matrix

| Path | Route | Adapter | tenantCtx threaded? | Real-API test? | CI result |
|------|-------|---------|---------------------|----------------|-----------|
| LIST | `route.ts:67` | `listResources:74` | ✓ both findMany + count | ✓ test 1–3 | ❌ H1 (item-id select bug; count assertions pass) |
| GET single | `[id]/route.ts:46` | `getResource:120` | ✓ findFirst with merged where | ✓ test 4–6 | ✅ all pass |
| CREATE | `route.ts:139` | `createResource:160` | ✓ assertCreateOwner + injectOwner | ✓ test 11–12 | ❌ M1/M2 (test 11 expectation mismatch) |
| UPDATE | `[id]/route.ts:81` | `updateResource:218` | ✓ buildTenantWhere → findFirst → FOR UPDATE | ✓ test 8–9 | ❌ B1 ($queryRaw bug) |
| DELETE | `[id]/route.ts:157` | `deleteResource:424` | ✓ buildTenantWhere → findFirst | ✓ test 10 | ✅ pass |
| BULK | `bulk/route.ts:43` | `executeBulkAction → executeAction` | ✓ via ActionContext | ✗ not integration-tested | n/a (wiring-only) |
| EXPORT | `export/route.ts:50` | `executeExport:197` | ✓ mergeTenantWhere into findMany | ✗ not integration-tested | n/a (wiring-only) |
| ACTION | `[id]/action/route.ts:40` | `executeAction:303` | ✓ checkRowOwnership after findUnique | ✗ not integration-tested | n/a (wiring-only) |

**Coverage gaps:**
- BULK: no integration test exercises a bulk action with mixed owner/non-owner ids.
- EXPORT: no integration test verifies that Seller A's export contains only their own rows.
- ACTION: no integration test verifies that Seller A cannot `publish` Seller B's listing.
- Relation-based ownership: no resource uses it; pure-function tests only.

---

## 6. Fail-Closed Verification

| Scenario | Expected | Actual | Status |
|----------|----------|--------|--------|
| Anonymous → seller-scoped resource | 401 (requireAdmin) | `requireAdmin` returns 401 before tenantCtx built | ✓ |
| Anonymous → seller-scoped (defense-in-depth) | denyAll | `buildTenantWhere` returns `{ denyAll: true }` → `mergeTenantWhere` produces `{ id: '__tenant_scope_deny_all__' }` | ✓ (wiring test L131–140) |
| Misconfigured ownership (neither ownerField nor relation) | denyAll | `buildTenantWhere` returns `{ denyAll: true }` | ✓ (unit test L118–130) |
| Owner field is null on a row | deny | `checkRowOwnership` returns `{ allowed: false, reason: 'not_owner' }`; `buildTenantWhere`'s `{ sellerId: userId }` doesn't match null | ✓ (unit test L228–230) |
| Non-admin without moderatePermission | scoped | `{ sellerId: userId }` filter applied | ✓ (unit test L81–95) |
| Admin | bypass | `{}` filter (no restriction) | ✓ (unit test L67–72) |
| Moderator with `moderatePermission` | bypass | `{}` filter (no restriction) | ✓ (unit test L74–79) |
| Relation-based ownership (Lead.listing.sellerId) | nested filter | `{ listing: { sellerId: userId } }` | ✓ (unit test L97–105) — but no resource uses it yet (M4) |

---

## 7. Verdict

**PR #11 is NOT VERIFIED.**

### 7.1 What's correct

- **Pure-function core** (`tenant-scope.ts`): correct, fail-closed, well-tested (40 unit tests pass).
- **Wiring through data-adapter** (`listResources`, `getResource`, `deleteResource`): correct, verified by 11 wiring tests + CI integration tests 4, 5, 6, 7, 10, 12, 13.
- **Wiring through route handlers**: all 5 routes + bulk + export + action resolve `tenantCtx` server-side and pass it down. No path skips `tenantCtx`.
- **Count/export data leakage**: count and export both apply the tenant filter. No leak via count.
- **Fail-closed on anonymous / misconfigured / null owner**: all verified.
- **Admin and moderator bypass**: correct.

### 7.2 What's broken

- **BLOCKER B1**: `$queryRaw` identifier interpolation bug breaks UPDATE-on-own for tenant-scoped resources. The primary positive use case is broken. CI integration test FAILS.
- **BLOCKER B2**: CI integration test gate not met on `4a2f579` (6/19 assertions fail, conclusion=failure).
- **HIGH H1**: Integration test LIST assertions cannot verify items (field-policy select excludes `id`). The negative assertion passes accidentally.
- **HIGH H2**: Owner-reassignment guard unreachable on main-DB path until B1 fixed; unreachable for Listing even after B1 due to field-policy stripping (L3).
- **HIGH H3**: Action-engine loads row via `findUnique` (no tenant filter) before ownership check — defense-in-depth inconsistency.

### 7.3 What's acceptable but improvable

- **MEDIUM M1**: CREATE silently overwrites forged owner instead of explicitly rejecting. Security outcome correct, API surface misleading.
- **MEDIUM M2**: Integration test "LEAK" label is misleading. Test provides no real security guarantee.
- **MEDIUM M3**: Store-DB TOCTOU window (documented limitation; no store-DB resource has ownership yet).
- **MEDIUM M4**: Relation-based ownership path is dead code in PR #11 (latent for PR-SC-05).
- **LOW L1–L3**: defense-in-depth gaps, test maintainability, field-config completeness.

### 7.4 Required actions before merge

1. **Fix B1** — replace `tx.$queryRaw\`SELECT * FROM "${tableName}" ...\`` with `Prisma.raw()` for the identifier (or `$queryRawUnsafe` with allowlist validation). Verify the fix locally with a PG database, then push.
2. **Fix H1** — in `tests/integration/tenant-scope-real.ts`, pass `undefined` as `fieldCtx` to `listResources` (or otherwise ensure `id` is in the projected fields), so LIST assertions can verify items by id.
3. **Fix H2** — either add `sellerId` to `listingConfig.fields` so the owner-reassignment guard fires, or run the guard on raw `data` (pre-strip). Re-run integration test case 9 to confirm it passes with the correct error message.
4. **Fix M1/M2** — either run `assertCreateOwner` on raw `data` (pre-strip) so the explicit rejection fires on forged `sellerId`, OR change the integration test to verify the resulting listing's `sellerId === sellerA.id` (proving no leak) instead of expecting a rejection.
5. **Re-run CI** — confirm the integration test passes (all 19 assertions) on the new HEAD.
6. **(Recommended) Fix H3** — change action-engine's `findUnique` to `findFirst` with merged tenant filter for defense-in-depth consistency.

### 7.5 Verdict

**NOT VERIFIED.** PR #11 must NOT be merged until B1 + B2 + H1 + H2 + M1/M2 are fixed and the CI integration test passes on the new HEAD. The pure-function logic and wiring are correct; the real-API-path execution is broken by the `$queryRaw` identifier bug.

---

## 8. Review Metadata

- **Reviewer:** /expert agent (STEP 11.31)
- **Method:** Full file reads (not diffs), path tracing, GitHub API queries, CI log download, local test execution (51/51 pure-function tests pass).
- **Independence:** Reviewer did not author PR #11. Reviewer's prior STEP 11.29 /expert doc (BLOCKER-A4) is referenced but re-verified against current code.
- **Files modified by reviewer:** None. Review only.
- **Tools used:** `git`, `curl` (GitHub REST API), `bunx vitest`, file reads.
- **CI log blob:** Downloaded from GitHub Actions (58KB), parsed for integration test output and Postgres error log.
