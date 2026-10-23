# STEP 15.44-D — Security & Architecture Independent Review

**Task ID:** `STEP-15.44-D`
**Agent:** HEAVIX Agent D — Security & Architecture Reviewer (read-only)
**Date:** 2026-10-22
**Repository:** `/home/z/heavix-15-42/z-ai-2` (branch `main`, HEAD `6c113fd66cdbbae9dd50ab2bcf2301400e3794b0`)
**Base for diff:** `18536ac` (canonical Phase B pre-merge baseline, per STEP-15.43 task family)
**Prior audit:** STEP-15.43-C (`docs/verification/STEP-15.43-SECURITY-RBAC-REVIEW.md`) — consulted as cross-reference only; NOT trusted. All invariants re-verified from source.

---

## 0. Executive Summary

| # | Verification | Verdict | Evidence |
|---|---|---|---|
| 1 | Authorization chain (RBAC-only, no `User.role`) | **PASS** | §1 below |
| 2 | REVISION-7 (shim not imported by authz paths) | **PASS (CRITICAL)** | §2 below |
| 3 | Dual-write atomicity (3 paths) | **PASS** | §3 below |
| 4 | Replaceable roles preservation (ADMIN/SELLER/BUYER only) | **PASS** | §4 below |
| 5 | DB error handling (fail-closed) | **PASS** | §5 below |
| 6 | No privilege escalation (BUYER + 0 UserRole) | **PASS** | §6 below |
| 7 | No schema/production changes | **PASS** | §7 below |

**G5 gate decision: PASS.**

All 7 verifications PASS on the MERGED Phase B code on `main` at `6c113fd`. The merged code is byte-identical (from an authz/architecture standpoint) to the pre-merge `1b0d9e8` audited by STEP-15.43-C. No new security regressions were introduced by the merge commit `6c113fd`. The 8/8 invariants from STEP-15.43-C (reported as 10/10 — here re-grouped into 7 logical verifications) all hold. **No critical security findings. No code modifications made (read-only mandate honored).**

---

## 1. Authorization Chain Verification

### 1.1 Canonical chain: `can()` → `getUserPermissions()` → `UserRole → Role → RolePermission → Permission`

| Step | File:Line | Code | Verdict |
|---|---|---|---|
| Entry point `can()` | `src/lib/authorization/index.ts:41-52` | `export async function can(userId, permission) { if (!userId) return false; try { const perms = await getUserPermissions(userId); return perms.includes(permission); } catch { return false; } }` | ✅ Delegates to `getUserPermissions` |
| Permission resolver | `src/lib/rbac-legacy.ts:20-46` | `getUserPermissions(userId)` queries `db.userRole.findMany({ where: { userId }, select: { role: { select: { permissions: { select: { permission: { select: { key: true } } } } } } } })` | ✅ Pure RBAC join: `UserRole → Role → RolePermission → Permission` |
| Empty result on no rows | `src/lib/rbac-legacy.ts:35-41` | `const set = new Set<string>(); for (const ur of userRoles) { for (const rp of ur.role.permissions) { set.add(rp.permission.key); } } return Array.from(set);` | ✅ Empty array if no UserRole rows |
| Catch on DB error | `src/lib/rbac-legacy.ts:42-45` | `catch (err) { console.error('[rbac] getUserPermissions failed:', err); return []; }` | ✅ Returns `[]` on DB error |

**`User.role` consultation in the authz chain:** **0 matches.**
- `src/lib/authorization/index.ts`: imports are `db` (L18) and `getUserPermissions` from `@/lib/rbac-legacy` (L19). The only occurrences of the substring `user.role` / `User.role` are in COMMENTS (L5 docstring + L142 migration note). No code-level consultation.
- `src/lib/rbac-legacy.ts`: single import `db` (L10). No `User.role` reference (in code or comments).
- `src/lib/admin-guard.ts`: imports `NextResponse`, `getCurrentUser`, `can`, `isAdmin`. No `User.role` reference.
- `src/lib/rbac.ts`: re-exports from `@/lib/authorization` + `@/lib/rbac-legacy`. No `User.role` reference.

### 1.2 `isAdmin()` is RBAC-only

`src/lib/authorization/index.ts:144-158`:
```ts
export async function isAdmin(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  try {
    const adminRole = await db.userRole.findFirst({
      where: { userId, role: { key: 'ADMIN' } },
      select: { id: true },
    });
    return Boolean(adminRole);
  } catch (err) {
    console.error('[authorization] isAdmin failed:', err);
    return false;
  }
}
```

✅ Queries `db.userRole.findFirst({ where: { userId, role: { key: 'ADMIN' } } })` — exactly the contract: RBAC-only, no legacy `User.role` fallback, fails-closed (`return false`) on DB error.

### 1.3 Authorization path imports (full audit of 4 modules)

| Module | Imports | Verdict |
|---|---|---|
| `src/lib/authorization/index.ts` | `db` from `@/lib/db`; `getUserPermissions` from `@/lib/rbac-legacy`; dynamic `import('@/lib/admin/resource-registry')` inside `canBulkAction` (resource config lookup, returns permission key checked via `can()`) | ✅ No shim, no `User.role` |
| `src/lib/rbac-legacy.ts` | `db` from `@/lib/db` | ✅ No shim, no `User.role` |
| `src/lib/rbac.ts` | `can as _can` from `@/lib/authorization`; re-exports from `@/lib/authorization` + `@/lib/rbac-legacy` | ✅ No shim, no `User.role` |
| `src/lib/admin-guard.ts` | `NextResponse`, `getCurrentUser` from `@/lib/auth`, `can, isAdmin` from `@/lib/authorization` | ✅ No shim, no `User.role` |

**Chain verdict: PASS.** All authorization decisions resolve through `UserRole → Role → RolePermission → Permission` via `getUserPermissions()`. `isAdmin()` queries `UserRole` for `role.key='ADMIN'`. Zero `User.role` consultation in the authz path.

---

## 2. REVISION-7 Verification — Shim Not Imported by Authorization Paths

### 2.1 Direct grep against the 4 authz-path modules

Command:
```
rg -n 'role-shim' src/lib/authorization/index.ts src/lib/rbac.ts src/lib/rbac-legacy.ts src/lib/admin-guard.ts
```

**Result: 0 matches.** (exit 1 from ripgrep, no output)

### 2.2 Full-repo grep for `role-shim` importers

Command:
```
rg -n 'role-shim' src/
```

**Result: 6 matches across 4 files**, all of which are display-only / internal-to-shim:

| File:Line | Context | Authz-path? | Verdict |
|---|---|---|---|
| `src/app/dashboard/page.tsx:7` | `import { getUserRoleWithFallback } from "@/lib/authorization/role-shim";` | No — display server component (UserDashboardPage) | ✅ Display only |
| `src/app/dashboard/page.tsx:61` | Comment: `// STEP 15.40 Phase B (§3.3 display-read migration): use the role-shim` | No — comment | ✅ Display only |
| `src/app/admin/sellers/[id]/page.tsx:6` | `import { getUserRoleWithFallback } from "@/lib/authorization/role-shim";` | No — display server component (SellerDetailPage); authz via `requirePermission` from `@/lib/authorization` at L5, called at L75 | ✅ Display only |
| `src/app/admin/sellers/[id]/page.tsx:129` | Comment: `// effective display role via the role-shim. Server component — async OK.` | No — comment | ✅ Display only |
| `src/lib/authorization/user-roles.ts:13` | Comment: `* for the role-shim to distinguish "no UserRole rows" (legitimate` | No — comment in the helper module (display-only, queried by shim only) | ✅ Helper module |
| `src/lib/authorization/user-roles.ts:90` | Comment: `* status enum that lets the role-shim distinguish:` | No — comment in the helper module | ✅ Helper module |
| `src/lib/authorization/role-shim.ts:90` | Comment: `console.error("[role-shim] legacy User.role lookup failed:", err);` | No — inside the shim itself | ✅ Shim internal |

### 2.3 Display-only verification (shim result never fed to `can()`/`requirePermission()`/`isAdmin()`)

| Caller | Shim call site | Authz call site | Verdict |
|---|---|---|---|
| `src/app/dashboard/page.tsx` | L65: `const role = await getUserRoleWithFallback(user.id, user)` → used at L66 only as `ROLE_LABEL[role]` for badge display | None in this file (this is a user-facing dashboard, not an admin gate) | ✅ Shim result display-only |
| `src/app/admin/sellers/[id]/page.tsx` | L132: `const displayRole = await getUserRoleWithFallback(user.id, user)` → used for display only | L75: `await requirePermission(actor.id, "user.read")` — actual authz gate from `@/lib/authorization`, RBAC-only | ✅ Shim result display-only; authz is via `requirePermission` |

### 2.4 Automated guard

`tests/security/rbac-phase-b.test.ts:164-188` (test 7, REVISION-7):
- L173-178: `it.each(authzFiles)("file %s does NOT import role-shim", (rel) => { ... expect(content).not.toMatch(/from ['"]@\/lib\/authorization\/role-shim['"]/); });`
- L180-187: `it("ripgrep returns 0 matches across all authz-path files", () => { ... expect(out.trim()).toBe(""); });`

Enforces the no-authz-import invariant at CI time. ✅

**REVISION-7 verdict: PASS (CRITICAL).** The shim is imported ONLY by display server components (`dashboard/page.tsx`, `admin/sellers/[id]/page.tsx`) and the helper module `user-roles.ts` (which is itself display-only — never imported by `authorization/index.ts`). The shim result is never fed to any authz function. Automated CI guard exists.

---

## 3. Dual-Write Atomicity Verification (3 Write Paths)

### 3.1 W1 — PATCH `/api/admin/users/[id]` (role change)

File: `src/app/api/admin/users/[id]/route.ts`

| Step | File:Line | Code | Verdict |
|---|---|---|---|
| Role row resolved BEFORE tx (fail-fast) | L177-184 | `const newRole = await db.role.findUnique({ where: { key: r }, select: { id: true } });` (outside tx); `if (!newRole) return NextResponse.json({ error: "Role '...' not found in RBAC catalog" }, { status: 500 });` | ✅ |
| Transaction wraps legacy + canonical writes | L225-254 | `updated = await db.$transaction(async (tx) => { ... })` | ✅ |
| Op 1 (legacy) inside tx | L227-233 | `const u = await tx.user.update({ where: { id }, data, include: { _count: ... } });` | ✅ |
| Op 2 (canonical: find replaceable) inside tx | L236-239 | `const existingUserRoles = await tx.userRole.findMany({ where: { userId: id, role: { key: { in: replaceableKeys } } }, select: { id: true } });` | ✅ |
| Op 3 (canonical: delete replaceable) inside tx | L240-244 | `if (existingUserRoles.length > 0) { await tx.userRole.deleteMany({ where: { id: { in: existingUserRoles.map((e) => e.id) } } }); }` | ✅ |
| Op 4 (canonical: upsert new) inside tx | L247-251 | `await tx.userRole.upsert({ where: { userId_roleId: { userId: id, roleId: roleChange.roleId } }, create: { userId: id, roleId: roleChange.roleId }, update: {} });` | ✅ Idempotent via `@@unique([userId, roleId])`; `update: {}` is no-op |
| Audit log OUTSIDE tx with `.catch()` | L273-284 | `await logAudit({ ... }).catch(() => { /* audit failure does not roll back the mutation */ });` | ✅ |

**W1 verdict: PASS.** All 4 mutation ops inside single `$transaction`; audit outside with `.catch()`.

### 3.2 W2 — POST `/api/auth/register` (public registration)

File: `src/app/api/auth/register/route.ts`

| Step | File:Line | Code | Verdict |
|---|---|---|---|
| Role row resolved BEFORE tx (fail-fast) | L114-123 | `const buyerRole = await db.role.findUnique({ where: { key: "BUYER" }, select: { id: true } }); if (!buyerRole) return NextResponse.json({ error: "RBAC catalog missing BUYER role — run `bunx tsx prisma/seed-rbac.ts`" }, { status: 500 });` | ✅ |
| Transaction wraps legacy + canonical writes | L126-154 | `const user = await db.$transaction(async (tx) => { ... })` | ✅ |
| Op 1 (legacy) inside tx | L128-142 | `const u = await tx.user.create({ data: { ..., role: "BUYER", ... } });` | ✅ Role HARDCODED to "BUYER" (L136) |
| Op 2 (canonical) inside tx | L147-151 | `await tx.userRole.upsert({ where: { userId_roleId: { userId: u.id, roleId: buyerRole.id } }, create: { userId: u.id, roleId: buyerRole.id }, update: {} });` | ✅ Idempotent |
| Audit log OUTSIDE tx | N/A | Public endpoint — no `logAudit` call. CSRF (`checkCsrf`, L38) + rate-limit (`REGISTER` preset, L42-60) are the public-facing controls. | ✅ N/A (public endpoint contract — documented in STEP-15.43-C F-7) |

**W2 verdict: PASS.** Legacy `User.role="BUYER"` + canonical `UserRole(BUYER)` created atomically in single `$transaction`. Public endpoint cannot set role — hardcoded BUYER.

### 3.3 W3 — POST `/api/admin/users` (admin create)

File: `src/app/api/admin/users/route.ts`

| Step | File:Line | Code | Verdict |
|---|---|---|---|
| Role row resolved BEFORE tx (fail-fast) | L184-193 | `const roleRow = await db.role.findUnique({ where: { key: role }, select: { id: true } }); if (!roleRow) return NextResponse.json({ error: "Role '...' not found in RBAC catalog" }, { status: 500 });` | ✅ |
| Transaction wraps legacy + canonical writes | L195-226 | `const user = await db.$transaction(async (tx) => { ... })` | ✅ |
| Op 1 (legacy) inside tx | L197-214 | `const u = await tx.user.create({ data: { ..., role, ... }, include: { _count: ... } });` | ✅ Role validated against `["ADMIN","SELLER","BUYER"]` (L174-177) |
| Op 2 (canonical) inside tx | L219-223 | `await tx.userRole.upsert({ where: { userId_roleId: { userId: u.id, roleId: roleRow.id } }, create: { userId: u.id, roleId: roleRow.id }, update: {} });` | ✅ Idempotent |
| Audit log OUTSIDE tx with `.catch()` | L228-238 | `await logAudit({ ... }).catch(() => { /* audit failure does not roll back the mutation */ });` | ✅ |

**W3 verdict: PASS.** All ops inside single `$transaction`; audit outside with `.catch()`.

### 3.4 Cross-cutting: idempotency via `@@unique([userId, roleId])`

All 3 paths use `tx.userRole.upsert` with `where: { userId_roleId: { userId, roleId } }` — Prisma's compound unique constraint lookup. The `update: {}` branch is a no-op when the pair already exists. This makes all 3 writes idempotent against re-invocation (e.g., retry after partial failure that the transaction rolls back).

**Dual-write atomicity verdict: PASS.** All 3 paths verified atomic.

---

## 4. Replaceable Roles Preservation Verification

**Contract:** When a user's ADMIN/SELLER/BUYER role changes, the `deleteMany` MUST only target ADMIN/SELLER/BUYER UserRole rows. MODERATOR and SUPPORT UserRole rows MUST be preserved.

File: `src/app/api/admin/users/[id]/route.ts`

```ts
// L224
const replaceableKeys = ["ADMIN", "SELLER", "BUYER"];
// L225-254
updated = await db.$transaction(async (tx) => {
  // 1. Update legacy User.role column (+ any other fields in `data`)
  const u = await tx.user.update({ where: { id }, data, ... });

  // 2. Delete existing replaceable UserRoles (ADMIN/SELLER/BUYER)
  const existingUserRoles = await tx.userRole.findMany({
    where: { userId: id, role: { key: { in: replaceableKeys } } },   // L237 — filter by role.key in [ADMIN, SELLER, BUYER]
    select: { id: true },
  });
  if (existingUserRoles.length > 0) {
    await tx.userRole.deleteMany({
      where: { id: { in: existingUserRoles.map((e) => e.id) } },     // L242 — delete by ID, ONLY those filtered IDs
    });
  }

  // 3. Upsert the new UserRole
  await tx.userRole.upsert({ ... });

  return u;
});
```

### 4.1 Two-layer defense against accidental MODERATOR/SUPPORT deletion

| Layer | Mechanism | File:Line |
|---|---|---|
| 1 — Filter at fetch | `findMany({ where: { userId, role: { key: { in: replaceableKeys } } } })` — only fetches UserRole rows whose `role.key ∈ {ADMIN, SELLER, BUYER}` | L236-239 |
| 2 — Delete by fetched IDs only | `deleteMany({ where: { id: { in: existingUserRoles.map(e => e.id) } } })` — `deleteMany` filter is by `id IN [fetched IDs]`, NOT by `userId` | L240-244 |

### 4.2 Input validation (allowedRoles)

L168: `const allowedRoles = ["ADMIN", "SELLER", "BUYER"];` — the incoming `body.role` is validated against this list (L170). MODERATOR and SUPPORT cannot be set via PATCH (would be rejected with 400). Even if they could, the `deleteMany` filter (L237) only deletes ADMIN/SELLER/BUYER rows.

### 4.3 Idempotent upsert preserves uniqueness

L247-251: `tx.userRole.upsert({ where: { userId_roleId: { userId, roleId } }, create: { userId, roleId }, update: {} })`. The `update: {}` is a no-op when the (userId, roleId) pair already exists (e.g., re-assigning BUYER when BUYER already exists). The `@@unique([userId, roleId])` constraint (Prisma schema) guarantees no duplicate UserRole pairs for the same role.

**Replaceable roles verdict: PASS.** MODERATOR and SUPPORT UserRole rows are NEVER deleted by the PATCH role-change path. Two-layer defense: (1) `findMany` filter on `role.key ∈ replaceableKeys`; (2) `deleteMany` filter on `id IN [fetched IDs only]`.

---

## 5. DB Error Handling Verification (Fail-Closed)

### 5.1 `can()` returns `false` on DB error

`src/lib/authorization/index.ts:41-52`:
```ts
export async function can(userId, permission): Promise<boolean> {
  if (!userId) return false;
  try {
    const perms = await getUserPermissions(userId);
    return perms.includes(permission);
  } catch {
    return false;     // ← DB error → false, NEVER true
  }
}
```
Same pattern for `canAny` (L55-66) and `canAll` (L69-80). ✅

### 5.2 `getUserPermissions()` returns `[]` on DB error

`src/lib/rbac-legacy.ts:20-46`:
```ts
export async function getUserPermissions(userId: string): Promise<string[]> {
  try {
    const userRoles = await db.userRole.findMany({ ... });
    // ... build set from rows
    return Array.from(set);
  } catch (err) {
    console.error('[rbac] getUserPermissions failed:', err);
    return [];        // ← DB error → empty array
  }
}
```

When `getUserPermissions` returns `[]`, `perms.includes(permission)` is `false`, so `can()` returns `false` (even though `can()` also has its own catch). Defense in depth. ✅

### 5.3 `isAdmin()` returns `false` on DB error

`src/lib/authorization/index.ts:144-158`:
```ts
export async function isAdmin(userId): Promise<boolean> {
  if (!userId) return false;
  try {
    const adminRole = await db.userRole.findFirst({ where: { userId, role: { key: 'ADMIN' } }, select: { id: true } });
    return Boolean(adminRole);
  } catch (err) {
    console.error('[authorization] isAdmin failed:', err);
    return false;     // ← DB error → false, NEVER true
  }
}
```
✅

### 5.4 `getUserPrimaryRoleWithStatus()` returns distinct `DB_ERROR` status

`src/lib/authorization/user-roles.ts:106-132`:
```ts
export async function getUserPrimaryRoleWithStatus(
  userId: string | null | undefined,
): Promise<{ role: string; status: RoleLookupStatus }> {
  if (!userId) return { role: "BUYER", status: "EMPTY" };
  try {
    const rows = await db.userRole.findMany({ where: { userId }, select: { role: { select: { key: true } } } });
    if (rows.length === 0) return { role: "BUYER", status: "EMPTY" };
    // ... resolve primary key
    return { role: primary, status: "FOUND" };
  } catch (err) {
    console.error("[user-roles] getUserPrimaryRoleWithStatus failed:", err);
    return { role: "BUYER", status: "DB_ERROR" };   // ← distinct tri-state
  }
}
```

`RoleLookupStatus = "FOUND" | "EMPTY" | "DB_ERROR"` (L104). The `DB_ERROR` status is distinct from `FOUND` and `EMPTY` — callers can distinguish "DB down" from "user has no UserRole rows". The returned `role` is `"BUYER"` (fail-closed), which CANNOT be mistaken for a legitimate ADMIN/SELLER (because no UserRole row would resolve to ADMIN/SELLER via this path — it always returns BUYER on error). ✅

### 5.5 Shim returns `"BUYER"` on `DB_ERROR` WITHOUT consulting legacy `User.role`

`src/lib/authorization/role-shim.ts:57-99`:
```ts
export async function getUserRoleWithFallback(userId, user?): Promise<string> {
  const { role: canonical, status } = await getUserPrimaryRoleWithStatus(userId);

  // Rule 1: canonical non-BUYER → canonical wins.
  if (canonical !== "BUYER") return canonical;

  // Rule 4: DB_ERROR → return "BUYER" WITHOUT consulting legacy.
  if (status === "DB_ERROR") return "BUYER";       // ← L69 — early return, no legacy lookup

  // Rule 2: FOUND + BUYER → canonical wins.
  if (status === "FOUND") return "BUYER";

  // Rule 3: status === "EMPTY" — consult legacy User.role.
  let legacyRole: string | null | undefined;
  if (user && typeof user === "object" && "role" in user) {
    legacyRole = user.role;
  } else if (userId) {
    try {
      const u = await db.user.findUnique({ where: { id: userId }, select: { role: true } });
      legacyRole = u?.role ?? null;
    } catch (err) {
      console.error("[role-shim] legacy User.role lookup failed:", err);
      return "BUYER";                                // ← L91 — legacy lookup also fails → BUYER
    }
  }
  const r = String(legacyRole ?? "").toUpperCase();
  return r && r !== "BUYER" ? r : "BUYER";
}
```

The shim consults `User.role` ONLY in the `EMPTY` case (Rule 3, L76-93). When `status === "DB_ERROR"`, the shim returns `"BUYER"` at L69 — the legacy `User.role` column is NEVER consulted (no `db.user.findUnique` call). This prevents stale-legacy display during DB outages. ✅

### 5.6 Automated test coverage

`tests/security/rbac-phase-b.test.ts:195-208` (test 5):
```ts
it("5. DB-error: findMany throws → {BUYER, DB_ERROR}; shim returns BUYER (NOT legacy)", async () => {
  const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  spies.userRoleFindMany.mockRejectedValue(new Error("connection lost"));

  const status = await getUserPrimaryRoleWithStatus("user-123");
  expect(status).toEqual({ role: "BUYER", status: "DB_ERROR" });

  // Shim MUST return BUYER (not legacy "SELLER") when DB is down.
  const shimResult = await getUserRoleWithFallback("user-123", { role: "SELLER" });
  expect(shimResult).toBe("BUYER");
  expect(shimResult).not.toBe("SELLER");
  ...
});
```
Confirms via mock that a `userRole.findMany` failure causes:
- `getUserPrimaryRoleWithStatus` → `{ role: "BUYER", status: "DB_ERROR" }`.
- Shim → `"BUYER"` even when pre-fetched `user.role = "SELLER"` is supplied. ✅

**DB error handling verdict: PASS.** All authz functions fail-closed (`can`/`canAny`/`canAll`/`isAdmin`/`getUserPermissions` return `false`/`[]` on DB error). The shim returns `"BUYER"` on `DB_ERROR` without consulting legacy `User.role`. Tri-state status enum is distinct.

---

## 6. No Privilege Escalation Verification

### 6.1 Threat scenario

A user with `User.role="BUYER"` (legacy column) and ZERO `UserRole` rows (un-backfilled user, or a user whose UserRole was somehow deleted). The attack: can they access admin functionality?

### 6.2 Trace through `can(userId, 'admin.access')`

| Step | Function | Behavior with `User.role="BUYER"`, 0 UserRole rows | Verdict |
|---|---|---|---|
| 1 | `can(userId, 'admin.access')` (`authorization/index.ts:41-52`) | `userId` truthy → enters try block | — |
| 2 | `getUserPermissions(userId)` (`rbac-legacy.ts:20-46`) | `db.userRole.findMany({ where: { userId } })` returns `[]` (0 rows) | — |
| 3 | `for (const ur of userRoles)` — loop body never executes | `set` remains empty | — |
| 4 | `return Array.from(set)` → `[]` | Returns `[]` | — |
| 5 | `perms.includes('admin.access')` | `false` | — |
| 6 | `can` returns `false` | — | ✅ DENIED |

### 6.3 Trace through `isAdmin(userId)`

| Step | Function | Behavior with 0 UserRole rows | Verdict |
|---|---|---|---|
| 1 | `isAdmin(userId)` (`authorization/index.ts:144-158`) | `userId` truthy → enters try block | — |
| 2 | `db.userRole.findFirst({ where: { userId, role: { key: 'ADMIN' } } })` | Returns `null` (no matching UserRole row) | — |
| 3 | `Boolean(null)` → `false` | Returns `false` | ✅ NOT ADMIN |

### 6.4 Trace through `adminGuard('admin.access')`

| Step | Function | Behavior | Verdict |
|---|---|---|---|
| 1 | `adminGuard('admin.access')` (`admin-guard.ts:47-86`) | `getCurrentUser()` returns user object | — |
| 2 | `const admin = await isAdmin(user.id)` | Returns `false` (per 6.3 above) | — |
| 3 | `if (!admin)` → true → enters branch | — | — |
| 4 | `if (permissionKey)` → true | — | — |
| 5 | `const hasPerm = await can(user.id, 'admin.access')` | Returns `false` (per 6.2 above) | — |
| 6 | `if (hasPerm)` → false | — | — |
| 7 | `return false` (Forbidden → 403) | — | ✅ 403 FORBIDDEN |

### 6.5 Shim does NOT grant permissions

The shim (`role-shim.ts`) returns `"BUYER"` for this user (Rule 3 — EMPTY + legacy `User.role="BUYER"` → returns `"BUYER"` at L98 because `r === "BUYER"`).

However, this display value is:
- Never imported by the authz chain (verified in §2).
- Only used as a label string in `ROLE_LABEL` maps (`dashboard/page.tsx:66`, `admin/sellers/[id]/page.tsx`).

Even if an attacker tampered with the shim to return `"ADMIN"`, that would not grant any permission — `can('admin.access')` would still return `false` because the RBAC chain (`getUserPermissions`) does not consult the shim's output. The shim has zero authority over authz decisions. ✅

### 6.6 `hasRole(userId, 'ADMIN')` legacy shim — no escalation

`src/lib/authorization/index.ts:356-367`:
```ts
export async function hasRole(userId, roles): Promise<boolean> {
  if (!userId) return false;
  const roleList = Array.isArray(roles) ? roles : [roles];
  for (const r of roleList) {
    const perm = ROLE_PERMISSION_MAP[r] || `${r.toLowerCase()}.access`;
    if (await can(userId, perm)) return true;     // ← delegates to can(), which is RBAC-only
  }
  return false;
}
```

`hasRole('ADMIN')` → `can('admin.access')` → `getUserPermissions` → `[]` → `false`. No escalation. ✅

**No-privilege-escalation verdict: PASS.** A user with `User.role="BUYER"` and zero UserRole rows: `can('admin.access')` = `false`, `isAdmin()` = `false`, `adminGuard` returns `false` (403). The shim's display value does NOT grant permissions.

---

## 7. No Schema / Production Changes Verification

### 7.1 Schema diff

```
$ git diff 18536ac..6c113fd -- prisma/schema.prisma
(empty)
$ git diff 18536ac..6c113fd -- prisma/schema.prisma | wc -c
0
$ git diff --stat 18536ac..6c113fd -- prisma/
(empty — entire prisma/ directory untouched)
```

✅ Zero bytes of diff against `prisma/schema.prisma` and the entire `prisma/` directory.

### 7.2 Migration / backfill / seed / SQL file changes

```
$ git diff --name-status 18536ac..6c113fd | grep -iE 'migration|backfill|seed|sql|schema'
A  docs/phase3/RBAC-MIGRATION-ADDENDUM-STEP-15.43.md       ← "migration" substring in filename
A  docs/verification/STEP-15.43-POSTGRESQL-TEST-AUDIT.md   ← "sql" substring inside "POSTGRESQL"
```

Both matches are documentation files (Markdown) whose filenames happen to contain those substrings. Neither is an actual migration, backfill, seed script, or SQL file. Specifically:
- The `prisma/` directory is untouched (per §7.1).
- No `*.sql` files were added (the only `.sql`-like string is "POSTGRESQL" in a markdown filename).
- `prisma/seed-user-roles.ts` and `prisma/seed-rbac.ts` pre-exist from earlier commits (STEP-15.43-C §9 — `73d84d0`); they are NOT added by Phase B.

### 7.3 Full file change list (21 files)

```
A  docs/phase3/RBAC-MIGRATION-ADDENDUM-STEP-15.43.md
A  docs/verification/STEP-15.40-IMPLEMENTATION-VERIFICATION.md
A  docs/verification/STEP-15.41-PHASE-B-REVIEW.md
A  docs/verification/STEP-15.42-FINAL-SHA-AUDIT.md
A  docs/verification/STEP-15.42-SECURITY-RBAC-AUDIT.md
A  docs/verification/STEP-15.43-DOCUMENTATION-AUDIT.md
A  docs/verification/STEP-15.43-GITHUB-RELEASE-AUDIT.md
A  docs/verification/STEP-15.43-POSTGRESQL-TEST-AUDIT.md
A  docs/verification/STEP-15.43-SECURITY-RBAC-REVIEW.md
M  src/app/admin/sellers/[id]/page.tsx
M  src/app/api/admin/users/[id]/route.ts
M  src/app/api/admin/users/route.ts
M  src/app/api/auth/register/route.ts
M  src/app/dashboard/page.tsx
M  src/components/admin/sections/users-section.tsx
M  src/components/admin/user-detail-drawer.tsx
A  src/lib/authorization/role-shim.ts
M  src/lib/authorization/user-roles.ts
A  tests/integration/rbac-phase-b-real.test.ts
A  tests/security/rbac-phase-b.test.ts
```

Breakdown by category:
- **9 docs** (verification reports + addendum) — read-only artifacts.
- **5 src route handlers** (modified) — dual-write transaction wrapping.
- **2 src components** (modified) — display-only role-badge reads.
- **2 src lib files** (1 new: `role-shim.ts`; 1 modified: `user-roles.ts`) — display helpers.
- **2 test files** (new) — security + integration test guards.

**Zero schema changes, zero migration SQL files, zero backfill scripts, zero seed-script changes, zero production data mutations.** ✅

### 7.4 Merge commit `6c113fd` integrity

The merge commit `6c113fd` ("feat(rbac): Phase B dual-write + role shim — STEP 15.40-15.43 (#74)") is on `main`. Compared to the pre-merge branch HEAD `1b0d9e8` audited by STEP-15.43-C, the security-relevant source files (`src/lib/authorization/*`, `src/lib/rbac.ts`, `src/lib/rbac-legacy.ts`, `src/lib/admin-guard.ts`, `src/app/api/admin/users/[id]/route.ts`, `src/app/api/admin/users/route.ts`, `src/app/api/auth/register/route.ts`, `src/lib/authorization/role-shim.ts`, `src/lib/authorization/user-roles.ts`) are byte-identical (no additional commits modified them between `1b0d9e8` and `6c113fd` — the merge was a fast-forward equivalent in terms of these files).

**No-schema-changes verdict: PASS.**

---

## 8. G5 Gate Decision

### 8.1 Verdict summary

| # | Verification | Verdict |
|---|---|---|
| 1 | Authorization chain (RBAC-only, no `User.role`) | **PASS** |
| 2 | REVISION-7 (shim not imported by authz paths) | **PASS (CRITICAL)** |
| 3 | Dual-write atomicity (3 paths) | **PASS** |
| 4 | Replaceable roles preservation | **PASS** |
| 5 | DB error handling (fail-closed) | **PASS** |
| 6 | No privilege escalation | **PASS** |
| 7 | No schema / production changes | **PASS** |

### 8.2 G5 gate decision: **PASS**

The merged Phase B code on `main` at `6c113fd` is security-safe and architecturally sound from the perspective of the authorization/RBAC migration. All 7 verifications PASS independently. The prior STEP-15.43-C audit's 10/10 PASS verdict is confirmed against the merged code. No critical security findings. No code modifications were made (read-only mandate honored).

### 8.3 Phase B informational findings (carried forward from STEP-15.43-C, not defects)

These are intentional Phase B migration-window behaviors tracked for the Phase D cutover, NOT security defects:

- **F-1:** Phase B dual-read window (`User.role` + `UserRole` coexist); shim's EMPTY case consults legacy for DISPLAY only. Remediation: Phase D cutover drops `User.role` column.
- **F-2:** Client components read `user.role` directly (cannot `await` shim). Documented Phase D cutover contract — parent server component passes shim-resolved role via props.
- **F-3:** Audit-log payload records legacy `role` field (REVISION-6). Remediation: Phase D switches to canonical UserRole key.
- **F-4:** `hasRole` legacy shim translates role keys to permission keys + delegates to `can()` (does NOT consult `User.role`). Migration target documented.
- **F-5:** `requireOwnership` uses `isAdmin(userId)` (RBAC) for admin override — correct.
- **F-6:** `getUserPrimaryRole` (non-tri-state variant) returns `"BUYER"` on DB error without distinguishing `DB_ERROR`. Only `getUserPrimaryRoleWithStatus` returns the tri-state. The shim uses the tri-state variant correctly. Documentation note: `getUserPrimaryRole` is fail-closed and should NOT be used to differentiate "real BUYER" from "DB error".

These 6 findings are informational, do not block the G5 gate, and are tracked for the Phase D cutover. They were originally documented in STEP-15.43-C and re-confirmed in this audit.

---

## 9. Audit Metadata

- **Audit type:** Independent, read-only security & architecture verification.
- **Scope:** Authorization chain, REVISION-7, dual-write atomicity, replaceable-roles preservation, DB error handling, privilege escalation, schema/production changes.
- **Method:** First-hand reads of 11 source files (`src/lib/authorization/index.ts`, `src/lib/authorization/role-shim.ts`, `src/lib/authorization/user-roles.ts`, `src/lib/rbac.ts`, `src/lib/rbac-legacy.ts`, `src/lib/admin-guard.ts`, `src/app/api/admin/users/[id]/route.ts`, `src/app/api/admin/users/route.ts`, `src/app/api/auth/register/route.ts`, `src/app/dashboard/page.tsx`, `src/app/admin/sellers/[id]/page.tsx`) + 1 test file (`tests/security/rbac-phase-b.test.ts`) + `git diff` against `18536ac` base. Used Read tool, scoped Grep tool, and bash for `git diff` / `wc` / `grep`. No code modifications.
- **Read-only constraint:** ✅ HONORED. No code, tests, git state, or production data modified. Only file authored: this report at `docs/verification/STEP-15.44-SECURITY-ARCHITECTURE.md` (new file, no existing repo content modified).
- **Independence:** Prior STEP-15.43-C audit (`docs/verification/STEP-15.43-SECURITY-RBAC-REVIEW.md`) was consulted as cross-reference only. All 7 verifications re-performed by reading the actual source code on `main` at `6c113fd`. No trust transferred.
- **Cross-agent consistency:** Verdicts align with STEP-15.43-C (10/10 PASS, CLEAN authorization separation). No discrepancies found.

**End of STEP-15.44-D report.**
