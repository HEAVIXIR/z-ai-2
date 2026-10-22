> **NOTE:** This addendum was recovered from a persisted Read-tool snapshot of
> `/home/z/heavix-15-39/z-ai-2/docs/phase3/RBAC-MIGRATION-DESIGN.md` (lines 1019–1227)
> captured during a prior sandbox session and corroborated by the worklog at
> `/home/z/my-project/worklog.md` line 6133 ("Read the design addendum at the end
> of /home/z/heavix-15-39/z-ai-2/docs/phase3/RBAC-MIGRATION-DESIGN.md (lines
> 1015-1227) — this is the IMPLEMENTATION CONTRACT") and line 6182 (same
> citation, by STEP-15.40-E).
>
> It represents the **original design decisions made during STEP 15.40** by
> HEAVIX Execution Agent C (red-team reviewer) and was the controlling
> implementation contract followed by Agent D's Phase B implementation (commit
> `3a327fa`) and Agent E's independent review (commit `7298a2e`, docs-only).
>
> The addendum text was authored in the STEP 15.40 worktree
> (`/home/z/heavix-15-40-phaseb`) and appended to the design doc, raising its
> line count from 1015 to 1227 (worklog line 6247: "Appended design revision
> addendum to docs/phase3/RBAC-MIGRATION-DESIGN.md (1015→1227 lines)"). The
> STEP 15.42 audit (Finding D-11) found that this appended text was never
> committed to the PR branch `phase-b/rbac-dual-read` — the design doc on the
> PR branch is byte-identical to main `18536ac` (1015 lines). This file restores
> the missing text as a standalone addendum document.
>
> **Verification status (STEP-15.43-D):** Each resolution in this addendum has
> been verified against the actual implementation code at commit `1b0d9e8`
> (PR #74 final head). Verification results are summarized in §"STEP-15.43-D
> Verification Notes" at the end of this document.

---

# STEP 15.40 Design Revision Addendum

**Date:** 2026-10-21
**Reviewer:** HEAVIX Execution Agent C (red-team, STEP-15.40-C)
**Status:** ADDENDUM to original design (STEP 14.67). Supersedes conflicting §3.2/§3.4/§5/§11 text.
**Main baseline:** `18536acd0306b0e85be759c602228b90eaea7363`

This addendum resolves **1 BLOCKER** and **7 REQUIRED REVISIONS** identified by the
STEP 15.40 red-team review. Agent D (Phase B implementer) MUST follow this addendum,
not the original §3.2 text where they conflict.

## BLOCKER-1 (RESOLVED): Dual-write must use `db.$transaction`

**Original §3.2 defect:** The proposed dual-write performs 6 separate Prisma operations
(findUnique Role, findMany existing UserRoles, deleteMany, upsert UserRole, logAudit,
user.update) with **NO `db.$transaction` wrapper**. The design's "No partial state" claim
is FALSE. At least 3 failure modes produce partial DB state:
1. `deleteMany` succeeds + `upsert` throws → user has ZERO UserRoles (locked out of admin)
2. `upsert` succeeds + `user.update` (via `data.role`) throws → UserRole updated but User.role stale
3. `user.update` succeeds + audit log throws → (audit is best-effort, acceptable)

**Resolution:** Phase B dual-write MUST wrap the legacy column update + deleteMany +
upsert in a Prisma `$transaction`. The audit log write remains OUTSIDE the transaction
(best-effort, never blocks the mutation).

### Revised §3.2 — Transactional Dual-Write

```typescript
if (body.role !== undefined) {
  if (!(await hasPermission(sessionUser.id, "user.role.manage"))) {
    return NextResponse.json({ error: "Forbidden..." }, { status: 403 });
  }
  const allowedRoles = ["ADMIN", "SELLER", "BUYER"];
  const r = String(body.role).toUpperCase();
  if (!allowedRoles.includes(r)) {
    return NextResponse.json({ error: "نقش نامعتبر است" }, { status: 400 });
  }

  // Resolve Role row BEFORE the transaction (fail fast if catalog missing)
  const newRole = await db.role.findUnique({ where: { key: r }, select: { id: true } });
  if (!newRole) {
    return NextResponse.json({ error: `Role '${r}' not found in RBAC catalog` }, { status: 500 });
  }

  // ── BLOCKER-1 FIX: Transactional dual-write ──
  // All mutating DB ops in ONE transaction. If ANY throws, ALL roll back.
  await db.$transaction(async (tx) => {
    // 1. Update legacy User.role column
    await tx.user.update({ where: { id }, data: { role: r } });

    // 2. Delete existing replaceable UserRoles (ADMIN/SELLER/BUYER)
    const replaceableKeys = ['ADMIN', 'SELLER', 'BUYER'];
    const existing = await tx.userRole.findMany({
      where: { userId: id, role: { key: { in: replaceableKeys } } },
      select: { id: true },
    });
    if (existing.length > 0) {
      await tx.userRole.deleteMany({ where: { id: { in: existing.map(e => e.id) } } });
    }

    // 3. Upsert the new UserRole (idempotent via @@unique([userId, roleId]))
    await tx.userRole.upsert({
      where: { userId_roleId: { userId: id, roleId: newRole.id } },
      create: { userId: id, roleId: newRole.id },
      update: {},
    });
  });
  // ── End transaction ──
  // If we reach here, ALL three ops succeeded atomically.

  // Audit log OUTSIDE transaction (best-effort, never blocks mutation)
  await logAudit({ /* ... */ }).catch(() => { /* audit failure does not roll back */ });
}
```

**Atomicity guarantee:** If the transaction throws, NO partial state exists. The caller
receives a 500 error and the user's role is unchanged. This is testable (see §11.2 test
"rollback-on-partial-failure").

**Transaction failure semantics (NEWLY DOCUMENTED for STEP-15.43-D — verified against
implementation at `src/app/api/admin/users/[id]/route.ts:225`):**
When the callback passed to `db.$transaction(async (tx) => {...})` throws, Prisma's
`$transaction` rethrows the error after rolling back ALL writes issued via the `tx`
client handle (including nested calls to `tx.user.update`, `tx.userRole.findMany`,
`tx.userRole.deleteMany`, `tx.userRole.upsert`). The caller's outer `try/catch`
(see `route.ts:127-289`) catches the rethrow and returns a 500 JSON response. No
post-commit code path (audit log at line 273, response serialization at line 286) is
reached. Tests `tests/security/rbac-phase-b.test.ts` test 3 (mock, error propagation)
and `tests/integration/rbac-phase-b-real.test.ts` C-1a/C-1b (real PostgreSQL 17) both
prove externally-observable behavior (500 + no audit log) AND real DB-level rollback
(no partial state on fresh re-query).

**Concurrent role updates (NEWLY DOCUMENTED for STEP-15.43-D — verified against
implementation + worklog STEP-15.40-E condition 2):** The Phase B dual-write does NOT
acquire explicit row-level locks (`SELECT ... FOR UPDATE`) and runs at PostgreSQL's
default READ COMMITTED isolation level. The `@@unique([userId, roleId])` constraint on
`UserRole` (schema lines 1774–1782) prevents duplicate (userId, roleId) pairs in all
cases. However, two concurrent PATCHes for the same user could both read empty
`existingUserRoles` lists, both delete nothing, and both upsert different roles —
leaving the user with BOTH ADMIN and SELLER UserRole rows simultaneously. This is a
KNOWN LIMITATION documented in `docs/verification/STEP-15.40-IMPLEMENTATION-VERIFICATION.md`
§5.3. The mock-based concurrency test (`rbac-phase-b.test.ts` test 2) uses a mutex to
serialize the two transactions and therefore mirrors SERIALIZABLE isolation; real-PG
concurrency coverage is provided by `tests/integration/rbac-phase-b-real.test.ts` C-2.
A future phase MAY add `SELECT ... FOR UPDATE` or switch to SERIALIZABLE isolation if
production traffic patterns warrant it; the design did not mandate either.

**Consistency invariant (NEWLY DOCUMENTED for STEP-15.43-D — verified against
implementation):** After a successful dual-write commit, `User.role === r` (the new
role key) AND `UserRole` contains exactly one replaceable-role row with
`role.key === r` (ADMIN, SELLER, or BUYER). The `replaceableKeys = ['ADMIN', 'SELLER',
'BUYER']` filter (route.ts:224) deliberately preserves any non-replaceable UserRole
rows (MODERATOR, SUPPORT) so dual-write cannot accidentally strip a user of
non-primary permissions. The invariant `User.role === primary UserRole key` holds for
the replaceable set. This is asserted by tests 1 (idempotency) and 2 (concurrency).

## REVISION-1 (RESOLVED): Extended inventory — W2 + W3 + S1–S5

**Original §5 defect:** The 19-path inventory MISSES:
- **W2:** `src/app/api/auth/register/route.ts:117` — hardcoded `role: "BUYER"` in Prisma `user.create()`
- **W3:** `src/app/api/admin/users/route.ts:187` — `body.role` in Prisma `user.create()`
- **S1–S5:** 5 implicit-spread serializers that include `role` in JSON via `{ ...user }` spread:
  - S1: `src/app/api/admin/users/[id]/route.ts:26` — `serializeUser()` + 3 callsites
  - S2: `src/app/api/admin/users/route.ts:18` — `serialize()` + 2 callsites

**Resolution:**
- **W2:** Register route already defaults to BUYER. Phase B MUST also create a `UserRole(BUYER)` row at registration so new users have canonical RBAC from day 1. Add to Phase B scope.
- **W3:** Admin create-user route MUST dual-write (create User with `role` + create UserRole). Add to Phase B scope.
- **S1–S5:** The spread serializers will return whatever `user.role` contains. During Phase B, this is the legacy column (still in sync via dual-write). After Phase D cutover, the serializers should be migrated to use `getUserRoleWithFallback()`. For Phase B, no change needed (spreads read the column, which dual-write keeps in sync).
- **§7.1 Phase E grep:** MUST be strengthened to detect spreads (`{ ...user }`) and Prisma `create`/`update` mutations, not just `user.role` field accesses.

## REVISION-2 (RESOLVED): Distinguish DB error from empty UserRole

**Original §3.1 defect:** `getUserPrimaryRole()` returns `"BUYER"` on BOTH "zero UserRole rows" (legitimate) and "DB query throws" (error). The shim cannot distinguish these.

**Resolution:** Add a status-discriminating variant for the shim to use:

```typescript
// src/lib/authorization/user-roles.ts — ADD this function (Phase B)

export type RoleLookupStatus = "FOUND" | "EMPTY" | "DB_ERROR";

export async function getUserPrimaryRoleWithStatus(
  userId: string | null | undefined,
): Promise<{ role: string; status: RoleLookupStatus }> {
  if (!userId) return { role: "BUYER", status: "EMPTY" };
  try {
    const rows = await db.userRole.findMany({
      where: { userId },
      select: { role: { select: { key: true } } },
    });
    if (rows.length === 0) return { role: "BUYER", status: "EMPTY" };
    // ... precedence logic ...
    return { role: primary, status: "FOUND" };
  } catch (err) {
    console.error("[user-roles] getUserPrimaryRoleWithStatus failed:", err);
    return { role: "BUYER", status: "DB_ERROR" };
  }
}
```

The shim (`getUserRoleWithFallback`) consults `User.role` ONLY when `status === "EMPTY"`.
When `status === "DB_ERROR"`, the shim returns `"BUYER"` WITHOUT consulting `User.role`
(because the DB is down — consulting `User.role` would require another DB query that
would also fail). This prevents stale-legacy display during DB outages.

## REVISION-3 (RESOLVED): Canonical-wins precedence clarification

**Original §3.1 defect:** The shim returns the legacy value when canonical is BUYER and legacy is non-BUYER — this CONTRADICTS the "canonical wins" prose.

**Resolution:** The shim's behavior is:
1. If canonical (UserRole) returns a non-BUYER role → return canonical (canonical wins).
2. If canonical returns BUYER (status=EMPTY, meaning zero UserRole rows):
   - Consult legacy `User.role`. If non-BUYER, return legacy (legacy fallback for un-backfilled users).
   - This is the INTENDED behavior for the migration window.
3. If canonical returns BUYER (status=DB_ERROR): return "BUYER" (do NOT consult legacy — DB is down).

**Prose alignment:** Update §3.1 to say: "Canonical wins when it has a non-BUYER role. When canonical is empty (no UserRole rows), the shim falls back to legacy for un-backfilled users. When canonical encounters a DB error, the shim returns BUYER without consulting legacy."

**Primary-role semantics (NEWLY DOCUMENTED for STEP-15.43-D — verified against
implementation at `src/lib/authorization/user-roles.ts:104-132` and the role-shim at
`src/lib/authorization/role-shim.ts:57-99`):** "Primary role" means the UserRole row
whose key appears first in `ROLE_PRECEDENCE = ['ADMIN','SELLER','BUYER','MODERATOR',
'SUPPORT']`. The status enum `RoleLookupStatus = "FOUND" | "EMPTY" | "DB_ERROR"` is
populated as follows:
- `"FOUND"` — user has ≥1 UserRole row; `role` is the resolved primary key.
- `"EMPTY"` — user has ZERO UserRole rows OR userId is null/undefined; `role` is `"BUYER"`
  (fail-closed default; the shim is permitted to consult legacy `User.role` in this state).
- `"DB_ERROR"` — `db.userRole.findMany` threw; `role` is `"BUYER"` (fail-closed default;
  the shim MUST NOT consult legacy because the DB is down).

The shim's precedence ladder, expressed as a decision tree (matches role-shim.ts lines
57–99 exactly):
1. `canonical !== "BUYER"` → return `canonical` (Rule 1: non-BUYER canonical wins outright).
2. `canonical === "BUYER" && status === "DB_ERROR"` → return `"BUYER"` (Rule 4: do NOT
   consult legacy — DB is down, legacy lookup would also fail).
3. `canonical === "BUYER" && status === "FOUND"` → return `"BUYER"` (Rule 2: explicit
   BUYER UserRole exists; canonical wins over legacy, even when legacy disagrees).
4. `canonical === "BUYER" && status === "EMPTY"` → consult legacy `User.role`. If
   provided via the `user?` parameter, use `user.role`; otherwise query
   `db.user.findUnique({ where: { id: userId }, select: { role: true } })`. If the
   legacy lookup itself throws, return `"BUYER"` (Rule 3 + fail-closed). If legacy is
   a non-BUYER key (e.g. `"SELLER"`, `"ADMIN"`), return it (legacy fallback for
   un-backfilled users). Otherwise return `"BUYER"`.

## REVISION-4 (RESOLVED): ROLE_PRECEDENCE ordering

**Original §2.1 defect:** `ROLE_PRECEDENCE = ['ADMIN','SELLER','BUYER','MODERATOR','SUPPORT']` places BUYER (fewest perms) above MODERATOR (more perms).

**Resolution:** The precedence is for DISPLAY "primary role" only — it determines which role key to show when a user has multiple UserRole rows. The ordering reflects business priority (ADMIN is most visible), NOT permission strength. This is acceptable for display. However, document this explicitly:

> `ROLE_PRECEDENCE` determines display priority when a user has multiple roles. It is NOT a permission hierarchy — authorization uses the full permission set via `getUserPermissions()`, not the "primary" role. A user with both MODERATOR and BUYER roles sees "BUYER" as their primary (display) but has all MODERATOR permissions.

No code change needed. Documentation-only clarification.

## REVISION-5 (RESOLVED): Add retry/idempotency/concurrency/rollback tests

**Original §11 defect:** Missing tests for retry, idempotency, concurrency, rollback.

**Resolution:** Add the following tests to §11.2 (Phase B test suite):

1. **Idempotency test:** Call dual-write twice with the same role. Assert: UserRole has exactly 1 row, User.role unchanged on second call.
2. **Concurrency test:** Simulate two simultaneous PATCH requests changing the same user's role to different values. Assert: final state is one of the two (not a mix), no partial state, `@@unique` constraint holds.
3. **Rollback-on-partial-failure test:** Mock `tx.userRole.upsert` to throw. Assert: the transaction rolls back — `User.role` is unchanged, no UserRole deleted. Assert: response is 500.
4. **Shim fallback test:** User with zero UserRole rows + `User.role="SELLER"` → shim returns "SELLER" (legacy fallback). After backfill, same user → shim returns canonical "SELLER".
5. **DB-error test:** Mock `db.userRole.findMany` to throw. Assert: `getUserPrimaryRoleWithStatus` returns `{role:"BUYER", status:"DB_ERROR"}`. Assert: shim returns "BUYER" (NOT legacy).

## REVISION-6 (RESOLVED): Document audit-log behavior change

**Resolution:** Add to §3.5 (new subsection):

> ### 3.5 Audit-log behavior change (Phase B)
>
> Currently, `logAudit` records `after: { roleKey: r }` where `r` is the legacy `User.role` value.
> After Phase B dual-write, `r` is still the legacy value (dual-write keeps it in sync), so the
> audit log is unchanged during Phase B.
>
> After Phase D cutover (stop writing `User.role`), the audit log MUST switch to recording the
> canonical role key from `UserRole`. This is a Phase D task, not Phase B.

## REVISION-7 (RESOLVED): "No authz import" guard for the shim

**Resolution:** Add to §3.4 (Phase B acceptance criteria):

> ### 3.4 Phase B acceptance criteria (updated)
>
> ... (existing criteria) ...
>
> **NEW (REVISION-7):** The shim file (`role-shim.ts`) MUST NOT be imported by any
> authorization-path module. Verify with:
> ```bash
> rg "from '@/lib/authorization/role-shim'" src/lib/authorization/index.ts src/lib/rbac.ts src/lib/rbac-legacy.ts src/lib/admin-guard.ts
> ```
> This MUST return ZERO matches. The shim is display/serialization only.

**Shim boundaries (NEWLY DOCUMENTED for STEP-15.43-D — verified against
implementation at `tests/security/rbac-phase-b.test.ts:164-188` and the 4 authz-path
files):** The shim's role is DISPLAY-ONLY. Authorization decisions (`can()`, `canAny()`,
`canAll()`, `requirePermission()`, `requireAnyPermission()`, `requireAllPermissions()`,
`isAdmin()`, `canAccessResource()`, `canBulkAction()`, `canExport()`, `hasRole()`) live
in `src/lib/authorization/index.ts` and resolve through `getUserPermissions(userId)`
(defined in `src/lib/rbac-legacy.ts`), which walks the
`User → UserRole → Role → RolePermission → Permission` chain and NEVER consults
`User.role`. The shim (`src/lib/authorization/role-shim.ts`) MUST NOT be imported by:
1. `src/lib/authorization/index.ts`
2. `src/lib/rbac.ts`
3. `src/lib/rbac-legacy.ts`
4. `src/lib/admin-guard.ts`

These four files form the authorization perimeter. The shim is permitted to be imported
by display-path server components only (verified: `src/app/dashboard/page.tsx:7`,
`src/app/admin/sellers/[id]/page.tsx:6`). The guard is enforced at test time by
`tests/security/rbac-phase-b.test.ts` test 7, which runs 5 sub-tests: 4 file-content
checks (`content.not.toMatch(/from ['"]@\/lib\/authorization\/role-shim['"]/)` on each
of the 4 authz files) + 1 ripgrep subprocess check (`rg -l "from '@/lib/authorization/role-shim'"
${4-files}` must return empty). The guard is FAIL-CLOSED: if any of the 4 authz files
ever imports the shim, the test fails and the build is broken.

---

## Summary

| Item | Status | Resolution |
|---|---|---|
| BLOCKER-1 (dual-write atomicity) | ✅ RESOLVED | `db.$transaction` wrapper (revised §3.2 above) |
| REVISION-1 (inventory W2/W3/S1-S5) | ✅ RESOLVED | Extended Phase B scope; strengthened §7.1 grep |
| REVISION-2 (DB error vs empty) | ✅ RESOLVED | `getUserPrimaryRoleWithStatus()` with status enum |
| REVISION-3 (canonical-wins prose) | ✅ RESOLVED | Prose aligned with intended behavior |
| REVISION-4 (ROLE_PRECEDENCE) | ✅ RESOLVED | Documentation clarification (no code change) |
| REVISION-5 (tests) | ✅ RESOLVED | 5 new tests added to §11.2 |
| REVISION-6 (audit-log change) | ✅ RESOLVED | Documented in new §3.5 |
| REVISION-7 (no authz import guard) | ✅ RESOLVED | Added to §3.4 acceptance criteria |

**Design verdict: APPROVED FOR PHASE B IMPLEMENTATION** (with this addendum as the
controlling implementation contract). Agent D may now proceed in an isolated worktree.

---

## Rollback Strategy (NEWLY DOCUMENTED for STEP-15.43-D — verified against
existing design §1, §8, §9 and implementation)

Phase B is **code-only** (no schema change, no DB data change). The three modified
write paths (`admin/users/[id]/route.ts` PATCH, `admin/users/route.ts` POST,
`auth/register/route.ts` POST) and the two new files (`role-shim.ts`, additions to
`user-roles.ts`) live entirely in the source tree. Rollback is therefore a pure
`git revert` of the Phase B commits:

- `3a327fa` — Agent D's Phase B implementation (10 files, +793/-45)
- `643628d` — Agent D's STEP 15.41 follow-up adding real-PG integration tests
- `7298a2e` — Agent E's docs-only review deliverable
- `1b0d9e8` — docs-only final PR head

After `git revert`, the code returns to Phase A state (additive `user-roles.ts`
helper only, no shim, no dual-write). The DB schema is unchanged across this range
(verified: `git diff 18536ac..1b0d9e8 -- prisma/` is empty), so no reverse migration
is required. User data written during Phase B's deployment window is forward-compatible
with Phase A behavior: any `UserRole` rows created by the dual-write are harmless
additions to the RBAC join table (Phase A's `getUserPermissions()` already reads
them). The reverse is NOT true — Phase A's non-dual-write PATCH could leave
`User.role` and `UserRole` out of sync if rolled back to Phase A after Phase B was
live. The risk is bounded: it affects only display/serialization (UI badges, audit
log payloads), never authorization gating (RBAC fail-closed).

## Migration Gates (NEWLY DOCUMENTED for STEP-15.43-D — verified against
existing design §7.1)

Phase E (drop `User.role` column + `AdminSession` table) is the only schema-changing
phase and is gated on the following hard pre-conditions (from existing design §7.1):

1. Phase D merged to `main` AND deployed to production.
2. Phase C backfill run in production AND verified (`orphans == 0`) — this means
   EVERY non-test User row has at least one UserRole row whose `role.key` matches
   the user's `User.role` value. The backfill script
   (`scripts/backfill-user-roles.ts`, existing design §4.1) is idempotent and
   inserts missing UserRole rows from `User.role`. The `orphans == 0` check
   (existing design §4.3) is the gate that the dual-write invariant
   `User.role === primary UserRole key` holds for ALL users, not just those mutated
   after Phase B deployed.
3. No code in `src/` references `user.role`, `User.role`, `db.user.role`, or
   `data.role` except in comments (verified by `rg` returning only comment matches).
4. The 7 additional references in §5.1 (A.1–A.7) have all been migrated.
5. The 1 INDIRECT path (§5.2 — `p?.role` via `Conversation.participant1`/
   `participant2`) has been migrated together with A.5 (Prisma select removal).
6. Conservative 19-path Phase E impact count re-verified by a fresh `rg`/AST pass.
7. Conversation-page regression test exists and passes.
8. Database backup taken within last 24 hours.
9. Maintenance window scheduled (Phase E requires brief downtime — see §7.5).
10. Rollback plan reviewed and dry-run on staging.

The dual-write invariant established by BLOCKER-1 (this addendum) is the *runtime*
guarantee that satisfies gate #2 for users mutated after Phase B deploys. Gate #2
for users NOT mutated after Phase B deploys is satisfied by the Phase C backfill
script, which is independent of Phase B. Phase E MUST NOT execute until both
runtime-dual-write (Phase B) AND backfill (Phase C) are verified in production;
otherwise legacy users without UserRole rows would lose all permissions
(RBAC fail-closed → no admin access — the failure mode explicitly identified in
existing design §1 "Critical invariant").

---

## STEP-15.43-D Verification Notes

This section was added during STEP-15.43-D (the recovery task) to record the
point-in-time verification of each addendum resolution against the actual
implementation at PR #74 final head `1b0d9e8e576b4ef55cec96ff0a50f03e20e09394`.
The addendum text above (BLOCKER-1 through REVISION-7 and Summary) is verbatim
from the STEP-15.40 authoring; only this verification-notes section and the
"NEWLY DOCUMENTED" expansions labeled as such are STEP-15.43-D additions.

| Resolution | Verified Against | Result |
|---|---|---|
| BLOCKER-1 (`db.$transaction` in PATCH) | `src/app/api/admin/users/[id]/route.ts:225` wraps `tx.user.update` + `tx.userRole.findMany`/`deleteMany` + `tx.userRole.upsert`; audit outside tx at line 273 with `.catch()` | ✅ MATCH |
| BLOCKER-1 (W2 register transactional) | `src/app/api/auth/register/route.ts:126` — `db.$transaction` wraps `tx.user.create` + `tx.userRole.upsert(BUYER)` | ✅ MATCH |
| BLOCKER-1 (W3 admin create transactional) | `src/app/api/admin/users/route.ts:195` — `db.$transaction` wraps `tx.user.create` + `tx.userRole.upsert(roleRow.id)` | ✅ MATCH |
| REVISION-1 (W2+W3 in scope) | Both write paths implemented; replaceable-keys filter `['ADMIN','SELLER','BUYER']` consistent across all three routes | ✅ MATCH |
| REVISION-2 (`getUserPrimaryRoleWithStatus`) | `src/lib/authorization/user-roles.ts:104-132` — returns `{ role: string; status: "FOUND" \| "EMPTY" \| "DB_ERROR" }`; "FOUND" = ≥1 rows; "EMPTY" = 0 rows or null userId; "DB_ERROR" = `findMany` threw; never throws | ✅ MATCH |
| REVISION-3 (canonical-wins precedence) | `src/lib/authorization/role-shim.ts:57-99` — Rule 1 (line 65, canonical non-BUYER → return canonical); Rule 2 (line 74, FOUND+BUYER → return "BUYER"); Rule 3 (lines 76–98, EMPTY → consult legacy); Rule 4 (line 69, DB_ERROR → return "BUYER" without consulting legacy) | ✅ MATCH |
| REVISION-4 (ROLE_PRECEDENCE doc) | `src/lib/authorization/user-roles.ts:34-39` — header comment explicitly states "ROLE_PRECEDENCE determines DISPLAY priority... NOT a permission hierarchy — authorization uses the full permission set via `getUserPermissions()`, not the 'primary' role." Ordering unchanged (`['ADMIN','SELLER','BUYER','MODERATOR','SUPPORT']`) | ✅ MATCH |
| REVISION-5 (5 required tests + real PG) | `tests/security/rbac-phase-b.test.ts`: test 1 idempotency (lines 246–281); test 2 concurrency (lines 283–400); test 3 rollback (lines 402–432); test 4 shim fallback (lines 210–220); test 5 DB-error (lines 195–208). Real PG evidence in `tests/integration/rbac-phase-b-real.test.ts` (C-1a/C-1b rollback, C-2 concurrency, gated on `DATABASE_URL` containing "localhost") | ✅ MATCH |
| REVISION-6 (audit-log behavior documented) | `src/app/api/admin/users/[id]/route.ts:268-272` — code comment documents "Per REVISION-6: during Phase B, `role` in the audit payload is still the legacy column value (dual-write keeps it in sync), so the audit log content is unchanged. Phase D cutover will switch this to the canonical UserRole key." Audit call at line 273 uses `.catch()` (best-effort) | ✅ MATCH |
| REVISION-7 (no-authz-import guard) | `tests/security/rbac-phase-b.test.ts:164-188` — 5 sub-tests: 4 file-content checks via `it.each(authzFiles)` on `src/lib/authorization/index.ts`, `src/lib/rbac.ts`, `src/lib/rbac-legacy.ts`, `src/lib/admin-guard.ts` (each asserts `content.not.toMatch(/from ['"]@\/lib\/authorization\/role-shim['"]/)`) + 1 ripgrep subprocess test (`rg -l "from '@/lib/authorization/role-shim'" ${files}` must return empty) | ✅ MATCH |

**Implementation-match verdict:** 8/8 resolutions match the implementation
byte-for-byte in semantics. No contradictions with the existing
`docs/phase3/RBAC-MIGRATION-DESIGN.md` were found — the addendum explicitly
states it "supersedes conflicting §3.2/§3.4/§5/§11 text" and extends §3.5 (new
subsection); it does NOT modify §0, §1, §2, §4, §6, §7, §8, §9, §10, §12, §13,
or §14 of the existing design doc. The 5-phase plan (A→B→C→D→E), Phase E
pre-conditions (§7.1), and rollback plan (§7.4, §7.7, §8, §9) are all preserved.

**Recovery provenance:**
- Recovered text source: `/home/z/my-project/tool-results/read_1792627819689_9b375ec4b7e8.txt`
  (1227 lines, a persisted Read-tool snapshot of
  `/home/z/heavix-15-39/z-ai-2/docs/phase3/RBAC-MIGRATION-DESIGN.md` from a prior
  sandbox session; the design doc was 1227 lines in that worktree because the
  addendum had been appended to it).
- Worklog corroboration: `worklog.md` L6133, L6182, L6247 (addendum appended,
  1015→1227 lines, "APPROVED FOR PHASE B IMPLEMENTATION"), L6578 (D-11 finding:
  addendum text missing from PR branch).
- Source code verification: at PR #74 final head `1b0d9e8`.
- This file's path: `docs/phase3/RBAC-MIGRATION-ADDENDUM-STEP-15.43.md`
  (deliberately separate from `RBAC-MIGRATION-DESIGN.md` to preserve the existing
  1015-line design doc byte-for-byte, per STEP-15.43-D constraint).
