# HEAVIX — RBAC Migration Design (E3)

**Document:** `docs/phase3/RBAC-MIGRATION-DESIGN.md`
**Author:** Execution Agent (STEP 14.67, HEAVIX E3)
**Date:** 2026-10-20
**Status:** DESIGN ONLY — no code changes implemented
**Main HEAD:** `582b41c104ebc434994044cbdbbfc952515b8f44`
**Scope:** Eliminate the legacy `User.role String @default("BUYER")` column on the `User` table (schema line 1586) and route all role reads/writes through the canonical RBAC `UserRole` join table (schema lines 1774–1782).

This document is the *only* deliverable of task E3. It must be reviewed and approved before Phase A implementation begins.

---

## 0. Verified State of the RBAC Infrastructure

The following were read directly from the codebase on 2026-10-20 and form the evidence base for every design decision below.

### 0.1 Canonical RBAC tables (already present in `prisma/schema.prisma`)

| Model | Schema lines | Key fields | Notes |
|---|---|---|---|
| `Role` | 1742–1751 | `key @unique` (ADMIN\|SELLER\|BUYER\|MODERATOR\|SUPPORT), `nameFa`, `nameEn?` | Role catalog. Seeded by `prisma/seed-rbac.ts`. |
| `Permission` | 1753–1762 | `key @unique` (e.g. `listing.publish`), `resource` | Permission catalog. Seeded by `prisma/seed-rbac.ts`. |
| `RolePermission` | 1764–1772 | `roleId`, `permissionId`, `@@unique([roleId, permissionId])` | Join: which permissions each role grants. |
| `UserRole` | 1774–1782 | `userId`, `roleId`, `@@unique([userId, roleId])` | Join: which roles each user has. **This is the migration target.** |

**Conclusion:** The `UserRole` join table already exists in the schema with the correct unique constraint (`@@unique([userId, roleId])`). No schema change is required for Phases A–D. Phase E is the only schema-changing phase.

### 0.2 Legacy column to be retired

| Column | Schema line | Definition | Default | Used by |
|---|---|---|---|---|
| `User.role` | 1586 | `role String @default("BUYER") // ADMIN | SELLER | BUYER` | `"BUYER"` | 18 column access points in the current inventory: 14 role-value reads, 1 write, and 3 Prisma field selections (see §§5–5.1); API inputs and different entities are tracked separately. |

### 0.3 Authorization module (`src/lib/authorization/`)

| File | Purpose | Lines |
|---|---|---|
| `src/lib/authorization/index.ts` | Canonical authorization: `can()`, `canAny()`, `canAll()`, `requirePermission()`, `requireAnyPermission()`, `requireAllPermissions()`, `isAdmin()`, `canAccessResource()`, `canBulkAction()`, `canExport()`, `hasRole()` | 368 |
| `src/lib/authorization/permissions.ts` | Static permission catalog (`PERMISSIONS` array) | 359 |
| `src/lib/rbac-legacy.ts` | `getUserPermissions(userId)` — resolves `User → UserRole → Role → RolePermission → Permission.key` | 47 |
| `src/lib/rbac.ts` | Compatibility re-export layer. Delegates to `authorization/index.ts`; aliases `can` as `hasPermission` for legacy imports. | 48 |

**Key invariant already enforced (verified by reading the code):**
- `can()`, `canAny()`, `canAll()` (index.ts:41–80) resolve through `getUserPermissions()` which walks the UserRole join. They do NOT consult `User.role`.
- `isAdmin()` (index.ts:144–158) is **RBAC-only**: it queries `db.userRole.findFirst({ where: { userId, role: { key: 'ADMIN' } } })`. The legacy `User.role='ADMIN'` fallback was removed in STEP 02 / PR #58.
- `hasRole()` (index.ts:356–367) maps role strings to permission keys (`ADMIN → admin.access`, etc.) and resolves via `can()`. RBAC-only.

**Implication:** Authorization decisions are already 100% routed through the `UserRole` join. The only remaining `User.role` reads are for **display/serialization** (UI badges, audit-log payloads, JSON responses) — not for authorization gating. This means the migration risk is **observability/UX**, not security.

### 0.4 Dead code: `AdminSession` model

| Evidence | Status |
|---|---|
| `prisma/schema.prisma:1656-1663` — `model AdminSession { id, tokenHash @unique, username, createdAt, expiresAt @@index([expiresAt]) }` | Defined in schema |
| `prisma/migrations/0_init/migration.sql:1017-1023` — `CREATE TABLE "AdminSession" (...)` | Created in initial migration |
| `rg 'db\.adminSession\|prisma\.adminSession' src/` → **zero matches** | No runtime reads/writes |
| `rg 'AdminSession' src/` → 3 matches, all in comments ("Legacy AdminSession path REMOVED") | Documentation-only references |

**Conclusion:** `AdminSession` is dead code. Its table is created but never written or read. Phase E will also drop it as part of the same migration (see §6).

---

## 1. Migration Overview — 5 Phases

Each phase is independently revertible (via `git revert`) and gated on the previous phase being verified in production. Phases A–D are **code-only** (no schema change, no migration SQL). Phase E is the **only** schema-changing phase.

```
   Phase A (code)         Phase B (code)         Phase C (script)        Phase D (code)         Phase E (schema)
   ┌──────────────┐       ┌──────────────┐       ┌──────────────┐        ┌──────────────┐       ┌──────────────┐
   │ Add helper   │  ──►  │ Dual-read    │  ──►  │ Backfill    │  ──►   │ Cutover:    │  ──►  │ Drop column  │
   │ user-roles.ts│       │ shim + dual- │       │ UserRole    │        │ shim → prim │       │ + AdminSess. │
   │ + unit tests │       │ write        │       │ from User.r │        │ stop dual-wr │       │ migration    │
   └──────────────┘       └──────────────┘       └──────────────┘        └──────────────┘       └──────────────┘
   Risk: LOW              Risk: MEDIUM           Risk: LOW               Risk: MEDIUM           Risk: HIGH
   1 PR                   1–2 PRs                1 ops run               1 PR                   1 PR + migration
```

| Phase | Touches code? | Touches schema? | Touches DB data? | Risk | Reverts by |
|---|---|---|---|---|---|
| A — Additive helper | Yes (new file only) | No | No | LOW | `git revert` |
| B — Compatibility shim + dual-write | Yes (migrate 14 role-value reads and 1 write; remove/rework 3 Prisma field selections) | No | No (reads only) | MEDIUM | `git revert` |
| C — Backfill UserRole from User.role | No (script only) | No | Yes (INSERT UserRole rows, idempotent) | LOW | `DELETE FROM "UserRole" WHERE id IN (backfilled)` (or restore from backup) |
| D — Cutover to canonical path | Yes (migrate 14 role-value reads and 1 write; remove/rework 3 Prisma field selections) | No | No | MEDIUM | `git revert` (re-enables shim + dual-write) |
| E — Drop `User.role` column + `AdminSession` table | Yes (comments) | Yes (migration) | No (column already unused by code) | HIGH | Reverse migration (re-add column, re-create AdminSession) + reverse-backfill script |

**Critical invariant:** Phase E must NEVER run before Phase C is verified complete in production. If Phase E runs without backfill, legacy users without UserRole rows would lose all permissions (RBAC fail-closed → no admin access).

---

## 2. Phase A — Additive Helper (no schema change, no behavior change)

### 2.1 New file: `src/lib/authorization/user-roles.ts`

**Purpose:** A single, fail-closed read helper for the `UserRole` join table. All Phase B/D consumers import from here.

**Public API:**

```typescript
// src/lib/authorization/user-roles.ts

import { db } from '@/lib/db';

/**
 * Returns the primary role key for a user, read from the UserRole join
 * table (NOT the User.role column).
 *
 * "Primary" is defined as: the first UserRole row, ordered by Role.key
 * precedence (ADMIN > SELLER > BUYER > MODERATOR > SUPPORT). This
 * ordering is enforced by a static ROLE_PRECEDENCE array; we do NOT
 * rely on row insertion order.
 *
 * FAIL-CLOSED: if the user has zero UserRole rows, or if the DB query
 * throws, returns "BUYER" (the safest default — Buyers have the
 * fewest permissions).
 *
 * @param userId  The user to look up. Null/undefined → "BUYER".
 */
export async function getUserPrimaryRole(
  userId: string | null | undefined,
): Promise<string>;

/**
 * Returns ALL role keys for a user, read from the UserRole join table.
 * Returns an empty array on null userId or DB error.
 *
 * Use this for UI badges / multi-role display. Authorization decisions
 * should use `can()` (permission-based) rather than this function.
 */
export async function getUserRoleKeys(
  userId: string | null | undefined,
): Promise<string[]>;

/**
 * Returns human-readable role labels for a user, read from the UserRole
 * join + Role.nameFa field. Ordered by ROLE_PRECEDENCE.
 *
 * Returns ["خریدار"] (BUYER label) on null userId / DB error / empty
 * UserRole list — same fail-closed contract as getUserPrimaryRole().
 */
export async function getUserRoleLabels(
  userId: string | null | undefined,
): Promise<string[]>;
```

**Implementation contract:**

```typescript
const ROLE_PRECEDENCE = ['ADMIN', 'SELLER', 'BUYER', 'MODERATOR', 'SUPPORT'] as const;

export async function getUserPrimaryRole(userId) {
  if (!userId) return 'BUYER';
  try {
    const rows = await db.userRole.findMany({
      where: { userId },
      select: { role: { select: { key: true } } },
    });
    if (rows.length === 0) return 'BUYER';   // fail-closed
    const keys = rows.map(r => r.role.key);
    // Pick highest-precedence role present
    for (const k of ROLE_PRECEDENCE) {
      if (keys.includes(k)) return k;
    }
    return keys[0] ?? 'BUYER';
  } catch (err) {
    console.error('[user-roles] getUserPrimaryRole failed:', err);
    return 'BUYER';                          // fail-closed on DB error
  }
}

export async function getUserRoleKeys(userId) {
  if (!userId) return [];
  try {
    const rows = await db.userRole.findMany({
      where: { userId },
      select: { role: { select: { key: true } } },
    });
    const keys = rows.map(r => r.role.key);
    // Sort by precedence (unknown keys go last, alphabetically)
    return keys.sort((a, b) => {
      const ai = ROLE_PRECEDENCE.indexOf(a as any);
      const bi = ROLE_PRECEDENCE.indexOf(b as any);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
  } catch (err) {
    console.error('[user-roles] getUserRoleKeys failed:', err);
    return [];
  }
}

export async function getUserRoleLabels(userId) {
  if (!userId) return ['خریدار'];   // BUYER label (Fa)
  try {
    const rows = await db.userRole.findMany({
      where: { userId },
      select: { role: { select: { key: true, nameFa: true, nameEn: true } } },
    });
    if (rows.length === 0) return ['خریدار'];
    // Sort by precedence, then return nameFa for each
    const sorted = rows.sort((a, b) => {
      const ai = ROLE_PRECEDENCE.indexOf(a.role.key as any);
      const bi = ROLE_PRECEDENCE.indexOf(b.role.key as any);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
    return sorted.map(r => r.role.nameFa || r.role.key);
  } catch (err) {
    console.error('[user-roles] getUserRoleLabels failed:', err);
    return ['خریدار'];
  }
}
```

### 2.2 Unit test design: `tests/unit/user-roles-helper.test.ts`

**Pattern source:** `tests/unit/rbac.test.ts` (mock-based, vitest `vi.mock`, no live DB).

**Test cases (mock `@/lib/db` — 8 tests minimum):**

| # | Test | Mock setup | Expected |
|---|---|---|---|
| 1 | `getUserPrimaryRole(null)` | (no mock call) | returns `"BUYER"` |
| 2 | `getUserPrimaryRole(undefined)` | (no mock call) | returns `"BUYER"` |
| 3 | user with zero UserRole rows | `db.userRole.findMany` → `[]` | returns `"BUYER"` (fail-closed) |
| 4 | user with single BUYER UserRole | mock returns `[{ role: { key: 'BUYER' } }]` | returns `"BUYER"` |
| 5 | user with ADMIN + BUYER UserRole (multi-role) | mock returns both | returns `"ADMIN"` (highest precedence) |
| 6 | user with SELLER + BUYER UserRole | mock returns both | returns `"SELLER"` |
| 7 | `db.userRole.findMany` throws | mock rejects with `new Error('connection lost')` | returns `"BUYER"`, logs error |
| 8 | `getUserRoleKeys(userId)` returns all roles, sorted by precedence | mock returns `[{BUYER}, {ADMIN}]` in random order | returns `["ADMIN", "BUYER"]` |

**Test isolation:** Each test resets the mock via `beforeEach(() => vi.clearAllMocks())`. No live PostgreSQL required — pure vitest mocks.

**File location:** `tests/unit/user-roles-helper.test.ts` (sibling of `tests/unit/rbac.test.ts`).

**Coverage gate:** Phase A PR must achieve ≥95% line coverage on `src/lib/authorization/user-roles.ts`.

### 2.3 Phase A acceptance criteria

- [ ] File `src/lib/authorization/user-roles.ts` exists with three exported functions matching §2.1 signatures.
- [ ] `tests/unit/user-roles-helper.test.ts` exists, all 8 tests pass.
- [ ] Zero existing files modified (only new file + new test file).
- [ ] `bun run lint` and `bun run typecheck` pass.
- [ ] CI green (`verify`, `audit-transaction`, `phase-tests`).

---

## 3. Phase B — Compatibility Shim + Dual-Write (no schema change)

### 3.1 New file: `src/lib/authorization/role-shim.ts`

**Purpose:** A dual-read function that prefers UserRole but falls back to `User.role` for users not yet backfilled. Used by legacy `User.role` value consumers during the migration window (Phase B → Phase D); Prisma field selections are handled explicitly in §5.1.

**Public API:**

```typescript
// src/lib/authorization/role-shim.ts

import { db } from '@/lib/db';
import { getUserPrimaryRole } from './user-roles';

/**
 * Returns the effective role for a user, with backward-compatible
 * fallback to the legacy `User.role` column.
 *
 * Resolution order:
 *   1. Query UserRole join table for the user's primary role.
 *   2. If UserRole returned a non-BUYER role → return it.
 *   3. If UserRole returned "BUYER" OR threw OR returned empty:
 *      a. If `user.role` is provided (non-empty), return `user.role.toUpperCase()`.
 *      b. Otherwise return "BUYER".
 *
 * This is a MIGRATION-ONLY shim. It exists so that users without
 * UserRole entries (pre-Phase-C backfill) still see their legacy
 * role in UI/audit/API responses.
 *
 * @param userId  The user to look up.
 * @param user    Optional pre-fetched user object (must contain `role`
 *                if available). Passing this avoids an extra DB round-
 *                trip when the caller has already fetched the user.
 */
export async function getUserRoleWithFallback(
  userId: string | null | undefined,
  user?: { role?: string | null } | null,
): Promise<string>;
```

**Implementation contract:**

```typescript
export async function getUserRoleWithFallback(userId, user) {
  // 1. Try canonical path first
  const primary = await getUserPrimaryRole(userId);

  // 2. If UserRole has a non-BUYER role, trust it (canonical wins)
  if (primary !== 'BUYER') return primary;

  // 3. Otherwise, fall back to User.role if it has a non-BUYER value
  //    (covers legacy admins/sellers not yet backfilled)
  if (user?.role) {
    const legacy = user.role.toUpperCase();
    if (legacy && legacy !== 'BUYER') return legacy;
  }
  return 'BUYER';
}
```

**Why this design:**
- Canonical path (UserRole) is preferred — matches the post-Phase-D behavior.
- The fallback is **only consulted when canonical returns "BUYER"** (i.e., either no UserRole rows or only BUYER UserRole). This means a user with both ADMIN UserRole AND `User.role='BUYER'` will see "ADMIN" (canonical wins).
- The fallback is consulted lazily — if the caller has already fetched `user`, we don't issue an extra query.

### 3.2 Dual-write at the WRITE consumer

**File:** `src/app/api/admin/users/[id]/route.ts:173`

**Current code (verified by reading):**

```typescript
// line 156-174
if (body.role !== undefined) {
  if (!(await hasPermission(sessionUser.id, "user.role.manage"))) {
    return NextResponse.json(
      { error: "Forbidden: missing permission 'user.role.manage' to change user role" },
      { status: 403 },
    );
  }
  const allowedRoles = ["ADMIN", "SELLER", "BUYER"];
  const r = String(body.role).toUpperCase();
  if (!allowedRoles.includes(r)) {
    return NextResponse.json(
      { error: "نقش نامعتبر است" },
      { status: 400 },
    );
  }
  data.role = r;   // ← WRITE: legacy User.role column
}
```

**Phase B replacement (dual-write):**

```typescript
if (body.role !== undefined) {
  if (!(await hasPermission(sessionUser.id, "user.role.manage"))) {
    return NextResponse.json(
      { error: "Forbidden: missing permission 'user.role.manage' to change user role" },
      { status: 403 },
    );
  }
  const allowedRoles = ["ADMIN", "SELLER", "BUYER"];
  const r = String(body.role).toUpperCase();
  if (!allowedRoles.includes(r)) {
    return NextResponse.json(
      { error: "نقش نامعتبر است" },
      { status: 400 },
    );
  }
  // ── Phase B: dual-write — keep legacy column in sync AND update UserRole ──
  data.role = r;                                   // legacy column (will be dropped in Phase E)

  // Canonical: resolve Role row, then upsert UserRole (replace any existing
  // ADMIN/SELLER/BUYER UserRole for this user with the new one).
  const newRole = await db.role.findUnique({ where: { key: r }, select: { id: true } });
  if (!newRole) {
    return NextResponse.json(
      { error: `Role '${r}' not found in RBAC catalog` },
      { status: 500 },
    );
  }
  // Delete existing ADMIN/SELLER/BUYER UserRoles for this user (so they
  // don't end up with both ADMIN and BUYER simultaneously after a demotion).
  const replaceableKeys = ['ADMIN', 'SELLER', 'BUYER'];
  const existingRoles = await db.userRole.findMany({
    where: { userId: id, role: { key: { in: replaceableKeys } } },
    select: { id: true },
  });
  if (existingRoles.length > 0) {
    await db.userRole.deleteMany({ where: { id: { in: existingRoles.map(er => er.id) } } });
  }
  await db.userRole.upsert({
    where: { userId_roleId: { userId: id, roleId: newRole.id } },
    create: { userId: id, roleId: newRole.id },
    update: {},
  });
  // Audit the role change (canonical path)
  await logAudit({
    actorId: sessionUser.id,
    actorType: "ADMIN",
    action: "user.role.assign",
    entityType: "User",
    entityId: id,
    after: { userId: id, roleKey: r, roleId: newRole.id, source: 'admin.users.update.dual-write' },
    reason: "via admin API (Phase B dual-write)",
  });
}
```

**Key design decisions:**
- **Replace, not append:** When an admin demotes a user from ADMIN → BUYER, we don't want them keeping the ADMIN UserRole. The dual-write deletes existing ADMIN/SELLER/BUYER UserRoles and inserts the new one. (MODERATOR/SUPPORT UserRoles are preserved.)
- **MODERATOR/SUPPORT preserved:** If a user has been granted MODERATOR or SUPPORT via a separate flow, those UserRoles are NOT touched by this admin role-change operation. They survive.
- **Atomicity:** The legacy `data.role = r` write and the UserRole writes happen in the same PATCH request. If either fails, the entire PATCH fails (Next.js route handler exception → 500). No partial state.
- **Audit log:** A separate `user.role.assign` audit entry is written for the canonical path, in addition to the existing `admin.users.update` audit at line 212.

### 3.3 Migrate role-value reads to the shim

Each READ consumer (§5 per-consumer table) imports `getUserRoleWithFallback` and replaces its `user.role` read with `await getUserRoleWithFallback(user.id, user)`. Detailed per-consumer code in §5.

### 3.4 Phase B acceptance criteria

- [ ] `src/lib/authorization/role-shim.ts` exists with `getUserRoleWithFallback`.
- [ ] All in-scope role-value reads switched to `getUserRoleWithFallback(userId, user)`; separately discovered audit reads included in the acceptance inventory.
- [ ] `admin/users/[id]/route.ts:173` performs dual-write (legacy column + UserRole upsert + delete replaced).
- [ ] Existing `tests/unit/rbac.test.ts` and `tests/contract/*` still pass.
- [ ] New integration test: `tests/integration/role-shim-real.ts` — verifies that a user with `User.role='ADMIN'` but ZERO UserRole rows still returns `"ADMIN"` via the shim (proves the fallback works against real PostgreSQL).
- [ ] CI green.

---

## 4. Phase C — Backfill UserRole from `User.role`

### 4.1 New script: `scripts/backfill-user-roles.ts`

**Purpose:** Walk every User row, look at the legacy `User.role` column value, and ensure a matching `UserRole` row exists. Idempotent — safe to run multiple times.

**Inspired by:** `prisma/seed-user-roles.ts` (the existing bootstrap script). The backfill script is a generalization: instead of only handling ADMIN/BUYER, it maps ALL role keys.

**Role mapping:**

| `User.role` value (case-insensitive) | Maps to Role.key | Notes |
|---|---|---|
| `"ADMIN"`, `"admin"`, `"SUPERADMIN"`, `"superadmin"` | `ADMIN` | SUPERADMIN is a legacy alias; collapses into ADMIN. |
| `"SELLER"`, `"seller"` | `SELLER` | |
| `"BUYER"`, `"buyer"`, `""` (empty), `null` (shouldn't happen — column is `NOT NULL`) | `BUYER` | Default fallback. |
| Any other value | `BUYER` + log a WARN with the unexpected value | Fail-safe: never crash on unknown role. |

**Algorithm (pseudocode):**

```typescript
// scripts/backfill-user-roles.ts
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

const ROLE_MAP: Record<string, string> = {
  ADMIN: 'ADMIN', SUPERADMIN: 'ADMIN',
  SELLER: 'SELLER',
  BUYER: 'BUYER',
};

function mapRole(legacy: string): string {
  const upper = (legacy || '').toUpperCase();
  return ROLE_MAP[upper] ?? 'BUYER';   // unknown → BUYER (fail-safe)
}

async function main() {
  // 1. Load all Roles we'll need (preload, fail fast if missing)
  const roleByKey = await db.role.findMany({
    where: { key: { in: ['ADMIN', 'SELLER', 'BUYER'] } },
    select: { id: true, key: true },
  });
  const roleBy = Object.fromEntries(roleByKey.map(r => [r.key, r.id]));
  for (const k of ['ADMIN', 'SELLER', 'BUYER']) {
    if (!roleBy[k]) throw new Error(`Role '${k}' missing — run db:seed-rbac first.`);
  }

  // 2. Stream all Users (avoid loading entire table into memory)
  //    Use cursor-based pagination for production-grade safety.
  let cursor: string | undefined;
  const BATCH = 200;
  let stats = { processed: 0, created: 0, skipped: 0, failed: 0, warnings: [] as string[] };

  while (true) {
    const users = await db.user.findMany({
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: 'asc' },
      select: { id: true, email: true, mobile: true, role: true },
    });
    if (users.length === 0) break;
    cursor = users[users.length - 1].id;

    for (const u of users) {
      stats.processed++;
      try {
        const targetKey = mapRole(u.role);
        if (targetKey !== u.role?.toUpperCase() && u.role && u.role !== '') {
          stats.warnings.push(`User ${u.id} (${u.email}): legacy role '${u.role}' mapped to '${targetKey}'`);
        }
        const roleId = roleBy[targetKey];

        // Idempotent upsert — if the UserRole row already exists, skip.
        const existing = await db.userRole.findUnique({
          where: { userId_roleId: { userId: u.id, roleId } },
          select: { id: true },
        });
        if (existing) {
          stats.skipped++;
          continue;
        }
        await db.userRole.create({
          data: { userId: u.id, roleId },
        });
        stats.created++;
        await writeAudit({
          actorType: 'SYSTEM',
          action: 'user.role.backfill',
          entityType: 'User',
          entityId: u.id,
          after: { userId: u.id, legacyRole: u.role, mappedRoleKey: targetKey, roleId },
          reason: 'Phase C backfill: created UserRole from legacy User.role',
        });
      } catch (err: any) {
        stats.failed++;
        console.error(`  ✗ User ${u.id}: ${err?.message ?? err}`);
      }
    }
  }

  // 3. Validation pass: every user has at least one UserRole
  const orphans = await db.user.count({
    where: { userRoles: { none: {} } },
  });
  if (orphans > 0) {
    stats.warnings.push(`⚠ ${orphans} user(s) still have zero UserRole rows after backfill — manual review required.`);
  }

  // 4. Report
  console.log('─'.repeat(60));
  console.log('Phase C backfill complete:');
  console.log(`  Processed : ${stats.processed}`);
  console.log(`  Created   : ${stats.created}`);
  console.log(`  Skipped   : ${stats.skipped}  (already had UserRole)`);
  console.log(`  Failed    : ${stats.failed}`);
  console.log(`  Orphans   : ${orphans}  (users with zero UserRole after backfill)`);
  if (stats.warnings.length > 0) {
    console.log('  Warnings  :');
    stats.warnings.slice(0, 20).forEach(w => console.log(`    • ${w}`));
    if (stats.warnings.length > 20) console.log(`    ... and ${stats.warnings.length - 20} more`);
  }
  console.log('─'.repeat(60));
  if (stats.failed > 0) process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); }).finally(() => db.$disconnect());
```

### 4.2 Idempotency guarantees

- **Safe to re-run:** Each iteration uses `db.userRole.findUnique({ where: { userId_roleId } })` before deciding to insert. If the row already exists, it's counted as `skipped` and not modified.
- **Never deletes:** The script NEVER issues `DELETE` on `UserRole`. Any admin-granted role (e.g., a SUPPORT UserRole manually added) survives re-runs.
- **Atomic per user:** Each user's backfill is a separate `create` call. If one user's insert fails (e.g., FK constraint), the script continues to the next user and reports the failure in `stats.failed`.

### 4.3 Validation step (post-backfill)

After the script completes, run:

```bash
bunx tsx scripts/verify-user-roles.ts
```

(Or, simpler — the script itself prints the orphan count.)

**Validation query:**

```sql
SELECT COUNT(*) AS orphan_count
FROM "User" u
LEFT JOIN "UserRole" ur ON ur."userId" = u.id
WHERE ur.id IS NULL;
-- Expected: 0
```

If `orphan_count > 0`, the backfill is INCOMPLETE. Do NOT proceed to Phase D until orphans = 0.

### 4.4 Audit trail

Each backfilled user gets an `AuditLog` entry:

```json
{
  "actorType": "SYSTEM",
  "action": "user.role.backfill",
  "entityType": "User",
  "entityId": "<userId>",
  "afterJson": "{\"userId\":\"...\",\"legacyRole\":\"ADMIN\",\"mappedRoleKey\":\"ADMIN\",\"roleId\":\"...\"}",
  "reason": "Phase C backfill: created UserRole from legacy User.role"
}
```

This makes the backfill visible in `/admin/audit-log` for traceability.

### 4.5 Phase C acceptance criteria

- [ ] `scripts/backfill-user-roles.ts` exists.
- [ ] Dry-run mode implemented (`--dry-run` flag → prints what would be done without writing).
- [ ] Staging run: `processed` count matches `SELECT COUNT(*) FROM "User"`.
- [ ] Staging run: `orphans == 0` after script.
- [ ] Staging run: re-running script reports `created=0, skipped=N` (proves idempotency).
- [ ] Production run: same checks pass.
- [ ] Audit log entries visible in `/admin/audit-log` for each backfilled user.

---

## 5. E1 Baseline Migration Table (11 rows: 10 READ + 1 WRITE)

This table preserves the original E1 baseline (10 READs + 1 WRITE = 11 rows). It is not the complete current inventory: §5.1 records seven additional grep/AST findings and distinguishes actual `User.role` accesses from different-entity or dead-select cases. Each row lists the current code, proposed Phase B/D handling, risk, and required test.

> **Note on line-level counting:** E1 counted each *line* as a separate consumer. Files with multiple `user.role` references on different lines (e.g., `users-section.tsx:185/192/466`) appear as multiple rows. Two adjacent lines in the same JSX block that both reference `user.role` (e.g., `admin/sellers/[id]/page.tsx:234,239`) are also separate rows.

| # | File:Line | Current code (READ/WRITE) | Phase A (helper exists — no consumer change) | Phase B (shim with fallback) | Phase D (canonical only) | Risk | Test required |
|---|---|---|---|---|---|---|---|
| 1 | `src/app/dashboard/page.tsx:60` | `const role = (user.role \|\| "BUYER").toUpperCase();` | Helper exists, untouched | `const role = (await getUserRoleWithFallback(user.id, user)).toUpperCase();` | `const role = (await getUserPrimaryRole(user.id)).toUpperCase();` | **Low** — display-only; default already "BUYER". | Unit: user with no UserRole returns "BUYER". |
| 2 | `src/app/admin/sellers/[id]/page.tsx:234` | `ROLE_LABEL[user.role]` (in JSX ternary for badge color) | Helper exists, untouched | Pre-fetch in server component: `const role = await getUserRoleWithFallback(user.id, user);` then `ROLE_LABEL[role]` | `const role = await getUserPrimaryRole(user.id);` | **Low** — UI color only. | Unit: BUYER role → amber badge; ADMIN role → red badge. |
| 3 | `src/app/admin/sellers/[id]/page.tsx:239` | `{ROLE_LABEL[user.role] ?? user.role}` (badge label) | Helper exists, untouched | Use same pre-fetched `role` variable from #2. | Use same `role` from #2. | **Low** — display. | Unit: legacy role "WHATEVER" maps to fallback string. |
| 4 | `src/components/admin/sections/users-section.tsx:185` | `const [role, setRole] = React.useState(user.role);` | Helper exists, untouched | Pre-compute on server: pass `effectiveRole: string` as prop; init state from it. `const [role, setRole] = React.useState(props.effectiveRole);` | Same — but `effectiveRole` comes from `getUserPrimaryRole(user.id)` server-side. | **Medium** — component state initialization; if user.role changes mid-session, state won't reflect it without a re-fetch. | Unit: clicking "Save" sends the prop role (not stale state). |
| 5 | `src/components/admin/sections/users-section.tsx:192` | `setRole(user.role);` (inside useEffect when drawer opens) | Helper exists, untouched | `setRole(props.effectiveRole);` — same prop as #4. | Same. | **Medium** — same as #4. | Integration: opening drawer after role change shows new role. |
| 6 | `src/components/admin/sections/users-section.tsx:466` | `<RoleBadge role={user.role} />` (table cell) | Helper exists, untouched | `<RoleBadge role={props.effectiveRole} />` | `<RoleBadge role={props.canonicalRole} />` (via `getUserPrimaryRole`) | **Low** — display. | Unit: RoleBadge renders correct label for "ADMIN"/"SELLER"/"BUYER". |
| 7 | `src/components/admin/user-detail-drawer.tsx:92` | `<RoleBadge role={user.role} />` | Helper exists, untouched | Server pre-computes `effectiveRole`; passes as prop: `<RoleBadge role={user.effectiveRole} />` | Same — but via `getUserPrimaryRole(user.id)`. | **Low** — display. | Unit: same as #6. |
| 8 | `src/lib/store-auth.ts:57` | `role: user.role \|\| "BUYER",` (in `StoreUser` return shape) | Helper exists, untouched | `role: await getUserRoleWithFallback(user.id, user),` | `role: await getUserPrimaryRole(user.id),` | **Medium** — `StoreUser` is consumed by store API routes that gate admin access (via `isStoreAdmin`, which is already RBAC-only). The `role` field is display-only. | Integration: store user with ADMIN UserRole → `role: "ADMIN"`; store user with no UserRole → `role: "BUYER"` (fail-closed). |
| 9 | `src/app/api/auth/me/route.ts:36` | `role: user.role \|\| "BUYER",` (in `/api/auth/me` response JSON) | Helper exists, untouched | `role: await getUserRoleWithFallback(user.id, user),` AND add `roles: await getUserRoleKeys(user.id)` (multi-role array, future-proof). | `role: await getUserPrimaryRole(user.id),` + `roles: await getUserRoleKeys(user.id)`. | **Medium** — public API response consumed by client. Adding `roles: string[]` is additive (backward-compatible). | Contract test: response shape includes both `role: string` and `roles: string[]`. |
| 10 | `src/lib/seller-service.ts:443` | `role: user.role,` (in `getSellerProfile` return shape, line 437–449) | Helper exists, untouched | `role: await getUserRoleWithFallback(user.id, user),` | `role: await getUserPrimaryRole(user.id),` | **Low** — display in admin seller detail page; authorization already RBAC-only via `can()`. | Unit: getSellerProfile for user with SELLER UserRole returns `role: "SELLER"`. |
| 11 | `src/app/api/admin/users/[id]/route.ts:173` | `data.role = r;` (WRITE to legacy column inside PATCH handler, guarded by `user.role.manage` permission) | Helper exists, untouched | **Dual-write:** `data.role = r;` (legacy) + `db.userRole.deleteMany` (replace existing ADMIN/SELLER/BUYER UserRoles for user) + `db.userRole.upsert` (insert new UserRole) + audit log. See §3.2. | **Canonical-only write:** drop `data.role = r;` entirely. Only do `db.userRole.deleteMany` + `db.userRole.upsert`. Audit log stays. | **High** — admin mutation; if dual-write has a bug, admin could grant role in DB but not in RBAC (or vice versa). Atomicity is critical. | Integration: PATCH role=ADMIN on BUYER user → user gets ADMIN UserRole AND `User.role="ADMIN"` (Phase B). Phase D: PATCH role=ADMIN → user gets ADMIN UserRole only; `User.role` column untouched (will be dropped in Phase E). |

### 5.1 Additional findings (NOT in the E1 list — flagged for review)

During the design pass, the following *additional* runtime `User.role` references were found that the E1 worklog did not enumerate. These must be added to the migration scope before Phase D cutover (otherwise Phase E column drop would break them).

| # | File:Line | Code | Type | Recommended action |
|---|---|---|---|---|
| A.1 | `src/app/api/admin/users/route.ts:204` | `role: user.role` in `after:` audit payload of POST create | READ (audit log payload) | Switch to `role: await getUserRoleWithFallback(user.id, user)` in Phase B; `getUserPrimaryRole(user.id)` in Phase D. |
| A.2 | `src/app/api/admin/users/[id]/route.ts:218` | `role: existing.role` in `before:` audit payload of PATCH | READ (audit log payload) | Same — capture effective role at audit time. |
| A.3 | `src/app/api/admin/users/[id]/route.ts:219` | `role: updated.role` in `after:` audit payload of PATCH | READ (audit log payload) | Same. |
| A.4 | `src/app/api/admin/users/[id]/route.ts:265` | `role: existing.role` in `before:` audit payload of DELETE | READ (audit log payload) | Same. |
| A.5 | `src/app/admin/conversations/[id]/page.tsx:99,110` | `select: { ... role: true ... }` for participant1 + participant2 | READ (Prisma select clause — fetches column from DB) | Drop `role: true` from select; replace with a separate `getUserRoleLabels(participant.id)` lookup at render time. |
| A.6 | `src/app/admin/conversations/[id]/page.tsx:290` | `<span>نقش: {p?.role ?? "—"}</span>` (renders participant role in conversation detail) | READ (display) | Pre-fetch role labels for both participants server-side; render label. |
| A.7 | `src/lib/seller-service.ts:117` | `select: { id: true, role: true, status: true, companyId: true }` — `role` is selected but **never used** in the function body | Dead select (READ at SQL level, no semantic use) | Drop `role: true` from select. No replacement needed (nothing reads it). |

**Inventory reconciliation (STEP 14.76): 18 actual `User.role` column access points** — 14 role-value reads, 1 write, and 3 Prisma field selections. The seven entries in this historical §5.1 list are findings, not seven interchangeable true consumers: `p?.role` belongs to `DealRoomParticipant`, `body.role` is API input, and the `seller-service.ts:117` selection was reported as unused. Validate every item against current source before implementation; do not use grep-token counts as the migration acceptance count.

> **Recommendation:** Treat the E1 list as the *minimum* scope for Phase B. The 7 additional references should be added to the Phase B PR(s) as a follow-on commit, with their own per-row table entries mirroring §5.

---

## 6. Phase D — Cutover (no schema change)

### 6.1 Switch in-scope role-value reads from shim to canonical

Each Phase B call site:

```typescript
const role = await getUserRoleWithFallback(user.id, user);
```

becomes:

```typescript
const role = await getUserPrimaryRole(user.id);
```

The `user` argument is no longer needed (no fallback). This is a 1-line change per consumer × 10 consumers = 10 mechanical edits.

### 6.2 Stop dual-write at the WRITE consumer

In `admin/users/[id]/route.ts:173`, drop the `data.role = r;` line entirely. The handler now writes ONLY to `UserRole` (deleteMany + upsert). The legacy `User.role` column is no longer touched.

### 6.3 Update stale comments

The following comments (verified by reading) are inaccurate — `seller-service.ts` does NOT write to `User.role`, it writes to `UserRole`:

| File:Line | Current comment | Phase D update |
|---|---|---|
| `src/lib/seller-service.ts:38` | `Set User.role=SELLER + upsert FoundingSeller (active=false to mark PENDING).` | `Assign SELLER UserRole (db.userRole.upsert) + upsert FoundingSeller (active=false to mark PENDING).` |
| `src/lib/seller-service.ts:85` | `Register a user as a seller. Sets User.role=SELLER + upserts a FoundingSeller row ...` | `Register a user as a seller. Assigns SELLER UserRole + upserts a FoundingSeller row ...` |
| `src/app/api/admin/sellers/[id]/route.ts:83` (comment) | `register — set User.role=SELLER + create FoundingSeller` | `register — assign SELLER UserRole + create FoundingSeller` |
| `src/app/api/admin/sellers/[id]/route.ts:88` (comment) | `also flips User.role which is a user-level mutation).` | `also assigns SELLER UserRole which is a user-level mutation).` |

### 6.4 Add Phase D telemetry (optional but recommended)

In `getUserPrimaryRole()`, add a debug log when zero UserRole rows are found:

```typescript
if (rows.length === 0) {
  console.warn('[user-roles] getUserPrimaryRole: user has zero UserRole rows (backfill incomplete?)', userId);
  return 'BUYER';
}
```

This surfaces incomplete backfill during Phase D — any user still hitting the empty-UserRole path is a backfill miss.

### 6.5 Phase D acceptance criteria

- [ ] All in-scope role-value reads use `getUserPrimaryRole(user.id)` (no shim, no fallback); separately identified Prisma projections are removed or reworked as specified in §5.1.
- [ ] `admin/users/[id]/route.ts:173` no longer sets `data.role` — only writes to UserRole.
- [ ] Stale comments in seller-service.ts:38,85 and admin/sellers/[id]/route.ts:83,88 updated.
- [ ] `getUserRoleWithFallback` is still exported from `role-shim.ts` (kept for emergency rollback) but no consumer imports it.
- [ ] Telemetry log fires for any user with zero UserRole rows (during staging smoke test).
- [ ] CI green.
- [ ] Staging smoke test: log in as admin, browse to `/admin/users`, change a user's role, verify the role change persists in `UserRole` table (NOT in `User.role`).

### 6.6 Rollback

If Phase D reveals a defect: `git revert <PR>` re-enables the shim and dual-write. No data loss — the `User.role` column still exists (Phase E has not run yet) and is still being dual-written.

---

## 7. Phase E — Drop `User.role` Column + `AdminSession` Table (schema change)

### 7.1 Pre-conditions (HARD GATES — all must be true)

- [ ] Phase D merged to `main` AND deployed to production.
- [ ] Phase C backfill run in production AND verified (`orphans == 0`).
- [ ] No code in `src/` references `user.role`, `User.role`, `db.user.role`, or `data.role` (verified by `rg 'user\.role|User\.role|data\.role' src/` returning only comment matches).
- [ ] The 7 additional references in §5.1 have all been migrated.
- [ ] Database backup taken within last 24 hours (`docs/database/POSTGRES-BACKUP.md`).
- [ ] Maintenance window scheduled (Phase E requires brief downtime — see §7.5).
- [ ] Rollback plan reviewed and dry-run on staging.

### 7.2 Prisma migration

**New migration:** `prisma/migrations/<timestamp>_drop_user_role_column_and_admin_session/migration.sql`

```sql
-- ── Phase E: drop legacy User.role column ──
-- Pre-condition: all runtime reads/writes have been migrated to UserRole join table.
-- See docs/phase3/RBAC-MIGRATION-DESIGN.md §7.1 for gate checklist.

ALTER TABLE "User" DROP COLUMN IF EXISTS "role";

-- ── Phase E: drop dead AdminSession table ──
-- AdminSession was created in 0_init/migration.sql:1017 but never had runtime
-- reads or writes (verified: zero db.adminSession / prisma.adminSession matches).
DROP TABLE IF EXISTS "AdminSession";

-- Drop indexes that referenced the dropped column/table (if any)
DROP INDEX IF EXISTS "AdminSession_tokenHash_key";
DROP INDEX IF EXISTS "AdminSession_expiresAt_idx";
```

**Note:** `DROP COLUMN IF EXISTS` and `DROP TABLE IF EXISTS` are idempotent — safe to re-run.

### 7.3 Schema update (`prisma/schema.prisma`)

| Line | Current | Phase E |
|---|---|---|
| 1586 | `role           String   @default("BUYER") // ADMIN \| SELLER \| BUYER` | *(line removed)* |
| 1656–1663 | `model AdminSession { ... }` | *(block removed)* |

After schema edit, run `bunx prisma generate` to regenerate the Prisma Client — the `User.role` field and `db.adminSession` accessor will no longer exist on the client type. Any TypeScript code that references them will fail to compile (this is the safety net — we WANT compile errors if any code path was missed).

### 7.4 Rollback migration

**Reverse migration:** `prisma/migrations/<timestamp+1>_restore_user_role_column/migration.sql`

```sql
-- Rollback: restore User.role column with default 'BUYER'.
-- WARNING: this restores the column but NOT the data. Pre-Phase-E values
-- are lost. Recovery procedure: re-run reverse-backfill script
-- (scripts/reverse-backfill-user-role.ts) to populate User.role from
-- UserRole join (primary role per user).

ALTER TABLE "User"
  ADD COLUMN "role" TEXT NOT NULL DEFAULT 'BUYER';

-- Recreate AdminSession table (matches 0_init/migration.sql:1017-1023).
CREATE TABLE "AdminSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tokenHash" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "AdminSession_tokenHash_key" ON "AdminSession"("tokenHash");
CREATE INDEX "AdminSession_expiresAt_idx" ON "AdminSession"("expiresAt");
```

**Companion script:** `scripts/reverse-backfill-user-role.ts`

```typescript
// scripts/reverse-backfill-user-role.ts
// Walks every user, queries their primary UserRole, and writes it back
// to the User.role column. Used only if Phase E is rolled back.
//
// This is the INVERSE of scripts/backfill-user-roles.ts (Phase C).
// Run AFTER the rollback migration (which re-adds the column) has applied.
```

### 7.5 Downtime analysis

| Operation | Locks | Duration (estimate) |
|---|---|---|
| `ALTER TABLE "User" DROP COLUMN "role"` | AccessExclusiveLock on `User` table | <1s for small DBs (<10K rows); 1–5s for medium (100K rows); 10–30s for large (1M+ rows) |
| `DROP TABLE "AdminSession"` | AccessExclusiveLock on `AdminSession` | <1s (table is empty) |

**Mitigation:** Schedule during low-traffic maintenance window. For large DBs, consider using `pg_repack` or a online-schema-change tool to avoid the AccessExclusiveLock. HEAVIX is currently small (<1K users), so direct `ALTER` is acceptable.

### 7.6 Phase E acceptance criteria

- [ ] All §7.1 pre-condition gates pass.
- [ ] Migration SQL reviewed by 2 reviewers.
- [ ] Staging dry-run: `bunx prisma migrate deploy` succeeds; `bunx prisma generate` succeeds; app boots; smoke tests pass.
- [ ] Production deploy: migration applied; app boots; smoke tests pass; admin login works; user role changes via admin API work (writes to UserRole, not User.role).
- [ ] `rg 'user\.role|User\.role|adminSession|AdminSession' src/` returns only comment matches (no runtime code).
- [ ] Update `src/lib/admin/production-readiness-gate.ts:41` (RBAC-02) evidence to note column dropped.
- [ ] Update worklog with Phase E completion entry.

### 7.7 Phase E rollback procedure

If production fails after Phase E:

1. `git revert <Phase E PR>` — restores code that doesn't reference the dropped column. **But this is wrong** — the column is already dropped, and the reverted code DOES reference it. So:
2. Apply the rollback migration (§7.4) to re-add the column.
3. Run `scripts/reverse-backfill-user-role.ts` to populate `User.role` from `UserRole`.
4. **Then** `git revert <Phase E PR>` is safe (code expects the column to exist; it does).
5. Investigate root cause before retrying Phase E.

---

## 8. Risk Assessment Per Phase

| Phase | Risk | Why | Mitigation |
|---|---|---|---|
| **A** — Additive helper | **LOW** | New file, no consumers touched. Zero blast radius. | Unit tests gate merge. |
| **B** — Shim + dual-write | **MEDIUM** | Refactors in-scope role-value reads + 1 WRITE site. Behavior change: legacy `User.role='ADMIN'` users WITHOUT UserRole rows now return "ADMIN" via fallback (was: returned "ADMIN" directly). Net behavior identical. But the dual-write adds DB writes (deleteMany + upsert) — if either fails, the PATCH 500s and the user's role is unchanged (atomic). Risk: a previously-passing PATCH could now 500 if the Role catalog is missing a row. | Integration test against real PostgreSQL (Phase B test: `tests/integration/role-shim-real.ts`). Pre-flight check: `db.role.findUnique({ where: { key: r } })` returns null → 500 with clear error message (already in §3.2 design). |
| **C** — Backfill | **LOW** | Idempotent INSERT-only script. Never deletes. Safe to re-run. Worst case: some users don't get backfilled (orphans) — script reports them; admin can investigate. | Validation step (`orphans == 0`) is a hard gate before Phase D. |
| **D** — Cutover | **MEDIUM** | Switches in-scope role-value reads from shim (with fallback) to canonical (no fallback). If any user was NOT backfilled (still has User.role='ADMIN' but zero UserRole rows), they will now see "BUYER" instead of "ADMIN" in the UI. **Authorization is unaffected** (already RBAC-only) — but UI display would be wrong, causing user confusion. | Phase C orphan gate (`orphans == 0`) must pass before Phase D. Telemetry log (§6.4) surfaces any remaining empty-UserRole users. |
| **E** — Schema change | **HIGH** | Drops a NOT NULL column on the central `User` table. If any code path still references `user.role`, runtime error. If rollback needed, data is lost (column re-added with default 'BUYER' for all users). | Hard pre-condition gates (§7.1). Backup taken. Maintenance window. Rollback script tested on staging. Two-reviewer migration SQL review. |

---

## 9. Rollback Summary

| Phase | Rollback mechanism | Data impact | Code impact |
|---|---|---|---|
| A | `git revert` | None | Removes new file (no consumers depend on it). |
| B | `git revert` | None — User.role column still exists and is still being dual-written. Dual-write means UserRole rows were also created (harmless). | Restores direct `user.role` reads; removes shim; removes dual-write. |
| C | `DELETE FROM "UserRole" WHERE id IN (rows created by backfill)` — OR simpler: leave them. Backfilled UserRole rows are HARMLESS (they match User.role). | None — backfilled rows are correct. | None (script only). |
| D | `git revert` | None — re-enables shim and dual-write. User.role column still has correct value (dual-write kept it in sync). | Restores shim; restores dual-write. |
| E | Apply reverse migration (§7.4) + run reverse-backfill script + `git revert` Phase E PR. | User.role column data is lost on DROP; restored via reverse-backfill (from UserRole). AdminSession data is lost on DROP (table was empty). | Phase E PR reverted (code stops expecting column to be absent). |

---

## 10. Implementation Timeline (estimates)

| Phase | PRs | Ops runs | Estimated wall-clock | Sequencing |
|---|---|---|---|---|
| A | 1 | 0 | 1 day | After E3 design approved. |
| B | 1–2 | 0 | 2–3 days (role-read inventory refactor + dual-write + integration test). | After A merged. |
| C | 0 | 1 (staging) + 1 (production) | 1 day | After B merged & deployed. |
| D | 1 | 0 | 1 day | After C verified in production. |
| E | 1 (code) + 1 (migration) | 1 (production deploy) | 1 day + maintenance window | After D merged & deployed & telemetry clean for 7 days. |

**Total:** ~6–8 calendar days, assuming each phase merges cleanly and there's no other Phase 3 work blocking.

---

## 11. Test Strategy

### 11.1 Unit tests (no DB — vitest mocks)

| File | Phase | Covers |
|---|---|---|
| `tests/unit/user-roles-helper.test.ts` | A | `getUserPrimaryRole`, `getUserRoleKeys`, `getUserRoleLabels` — fail-closed behavior, precedence sorting, DB error handling. 8 tests minimum (§2.2). |
| `tests/unit/role-shim.test.ts` | B | `getUserRoleWithFallback` — fallback path (UserRole empty + User.role='ADMIN' → "ADMIN"), canonical-wins path (UserRole has ADMIN → "ADMIN" even if User.role='BUYER'). 6 tests minimum. |

### 11.2 Integration tests (real PostgreSQL)

| File | Phase | Covers |
|---|---|---|
| `tests/integration/role-shim-real.ts` | B | Against real PostgreSQL: create user with `User.role='ADMIN'` and zero UserRole rows → `getUserRoleWithFallback` returns "ADMIN". Create user with `User.role='BUYER'` and ADMIN UserRole → returns "ADMIN" (canonical wins). |
| `tests/integration/dual-write-real.ts` | B | PATCH `/api/admin/users/[id]` with `body.role='SELLER'` → assert `User.role` column AND `UserRole` row both updated. 4 assertions. |
| `tests/integration/backfill-idempotent-real.ts` | C | Run backfill twice → second run reports `created=0, skipped=N`. |
| `tests/integration/cutover-canonical-real.ts` | D | After Phase D: PATCH with `body.role='ADMIN'` → assert `User.role` column UNCHANGED, `UserRole` updated. |

### 11.3 Existing tests that must still pass

- `tests/unit/rbac.test.ts` — verifies `isAdmin` is RBAC-only (no User.role fallback). Must still pass through Phase E.
- `tests/contract/r45-canonical-auth-contract.test.ts` — verifies "does not authorize AI through User.role fallback". Must still pass.
- `tests/integration/auth.test.ts` — registration flow.
- All `tests/phase9-*.test.ts` schema-content checks (must reflect column removal in Phase E).

---

## 12. Open Findings

| # | Finding | Impact | Recommended resolution |
|---|---|---|---|
| 1 | E1 baseline reports 11 rows (10 READ + 1 WRITE), but this is not the complete column-access inventory. The independent STEP 14.76 inventory identifies 18 `User.role` column access points: 14 role-value reads, 1 write, and 3 Prisma field selections. | Documentation / migration scope. | Reconcile the full inventory and acceptance criteria before Phase B; retain the 11-row table as the E1 baseline only. |
| 2 | **Seven additional findings** were recorded in §5.1. They include audit payload reads, Prisma field selections, a different-entity participant display, and a field selection reported as unused. The independent STEP 14.76 inventory counts 18 actual `User.role` column access points after entity disambiguation; do not count API request-body `body.role` or `DealRoomParticipant.p?.role` as `User.role`. | Phase E (column drop) would break any genuine column access not migrated first. | Reconcile every row in §§5–5.1 against current source and explicitly mark true column reads, the write, Prisma selections, dead selections, and different-entity/API-input false positives before Phase B implementation. |
| 3 | `src/lib/seller-service.ts:117` selects `role: true` from User but never uses the value (dead select). | Inefficient SQL (fetches column unnecessarily). Phase E column drop would change this select to fail at Prisma generate time. | Remove `role: true` from the select clause in Phase B (cleanup commit). |
| 4 | `prisma/seed-user-roles.ts` already does a partial backfill (ADMIN + BUYER only). Phase C's `scripts/backfill-user-roles.ts` is a superset (also handles SELLER). | Two scripts doing overlapping work could confuse operators. | Document in Phase C script header: "Supersedes `prisma/seed-user-roles.ts` for production backfill. The seed script remains for fresh-install bootstrap (admin user creation); this script is for migrating existing data." |
| 5 | The `serializeUser` (admin/users/[id]/route.ts:26) and `serialize` (admin/users/route.ts:18) functions spread `...u` — which includes `role` in the JSON response. The API response shape implicitly exposes `User.role`. | Frontend clients reading `user.role` from API response would break in Phase E. | Audit frontend code for `user.role` reads from API response (out of scope for this design doc — flagged for Phase B sub-PR). |
| 6 | `User.role` column is `NOT NULL` with `DEFAULT 'BUYER'`. If Phase E rollback re-adds the column, all rows get `'BUYER'` until reverse-backfill runs. | Brief window where admin users appear as BUYER in any UI still reading User.role. | Reverse-backfill script must run IMMEDIATELY after rollback migration. Document in runbook. |
| 7 | No integration test currently exercises `getUserPermissions` against real PostgreSQL with multi-role users (RBAC test #5 in `tests/unit/rbac.test.ts` is mock-based). | Mock could diverge from real Prisma behavior (e.g., relation traversal). | Add `tests/integration/get-user-permissions-real.ts` in Phase A (out of scope but recommended). |
| 8 | `production-readiness-gate.ts:41` (RBAC-02) currently reports `status: 'PASS'` with note "Legacy fallback removed in STEP 02". This is true for `isAdmin` but the `User.role` column still EXISTS. The gate is technically misleading. | Gate evidence is stale. | Update RBAC-02 evidence in Phase E to: "User.role column DROPPED in Phase E; isAdmin RBAC-only since STEP 02." |

---

## 13. Next Authorized Action

**This document is DESIGN ONLY.** No code has been written. No migration has been applied.

**Next authorized action:**

1. Reviewer approves this design document.
2. Phase A implementation begins: create `src/lib/authorization/user-roles.ts` + `tests/unit/user-roles-helper.test.ts` in a single PR.
3. Phase A must merge and deploy before Phase B begins.

**Phase A PR author:** Next execution agent (STEP 14.68 or successor).
**Phase A PR target branch:** `main` (gated by branch protection: `verify`, `audit-transaction`, `phase-tests` + 1 approving review).

---

## 14. Appendix — Verified Code Snippets (read during design)

### 14.1 `prisma/schema.prisma:1578-1641` (User model, abbreviated)

```prisma
model User {
  id             String   @id @default(cuid())
  firstName      String
  lastName       String
  email          String   @unique
  mobile         String   @unique
  passwordHash   String
  userType       String   @default("INDIVIDUAL")
  role           String   @default("BUYER") // ADMIN | SELLER | BUYER   ← TARGET FOR REMOVAL
  status         String   @default("PENDING")
  emailVerified  Boolean  @default(false)
  mobileVerified Boolean  @default(false)
  ...
  userRoles      UserRole[]   // ← canonical RBAC relation (already present)
  ...
}
```

### 14.2 `prisma/schema.prisma:1774-1782` (UserRole model — already exists)

```prisma
model UserRole {
  id        String @id @default(cuid())
  userId    String
  user      User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  roleId    String
  role      Role   @relation(fields: [roleId], references: [id], onDelete: Cascade)
  @@unique([userId, roleId])
}
```

### 14.3 `src/lib/authorization/index.ts:144-158` (isAdmin — already RBAC-only)

```typescript
export async function isAdmin(
  userId: string | null | undefined,
): Promise<boolean> {
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

### 14.4 `src/lib/rbac-legacy.ts:20-46` (getUserPermissions — already UserRole-only)

```typescript
export async function getUserPermissions(userId: string): Promise<string[]> {
  try {
    const userRoles = await db.userRole.findMany({
      where: { userId },
      select: {
        role: {
          select: {
            permissions: {
              select: { permission: { select: { key: true } } },
            },
          },
        },
      },
    });
    const set = new Set<string>();
    for (const ur of userRoles) {
      for (const rp of ur.role.permissions) {
        set.add(rp.permission.key);
      }
    }
    return Array.from(set);
  } catch (err) {
    console.error('[rbac] getUserPermissions failed:', err);
    return [];
  }
}
```

---

**END OF DESIGN DOCUMENT.**
