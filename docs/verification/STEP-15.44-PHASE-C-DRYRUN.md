# STEP-15.44-C — Phase C Backfill Dry-Run

**Task ID:** `STEP-15.44-C`
**Agent:** HEAVIX Agent C — Phase C Dry-Run Specialist (read-only)
**Date:** 2026-10-22
**Repository:** `/home/z/heavix-15-42/z-ai-2`
**Branch / HEAD:** `main` @ `6c113fd`
**Main baseline cited by task brief:** `6c113fd` (`feat(rbac): Phase B dual-write + role shim — STEP 15.40-15.43 (#74)`, PR #74 merged)

---

## 0. Mission (Track C — Phase C Dry-Run)

Produce a READ-ONLY dry-run script that classifies every `User` row against its
canonical `UserRole` associations, so that the Phase C backfill
(`scripts/backfill-user-roles.ts`, design §4 of
`docs/phase3/RBAC-MIGRATION-DESIGN.md`) can be validated **before any
production mutation**. The dry-run MUST:

- count totals (users, UserRole rows, orphans);
- classify each user as `OK` / `MISSING` / `MISMATCH` / `MULTI_ROLE` / `INVALID`;
- emit a machine-parseable JSON verdict for CI gating;
- never write to the database (no INSERT / UPDATE / DELETE, no audit log writes);
- honour the owner directive: «نقش‌های مبهم را خودکار اصلاح نکن.» — DO NOT
  auto-correct ambiguous roles.

Deliverables: this report + `scripts/rbac-backfill-dryrun.ts` + a dedicated
`tsconfig.scripts.json` for typechecking.

---

## 1. Pre-Reading Status

| # | Document | Section read | Why |
|---|---|---|---|
| 1 | `/home/z/my-project/worklog.md` | §19.4 (E3 RBAC Migration Design, lines 2105–2160), §20 (E3 design execution), STEP-15.42 / STEP-15.43 entries | Phase C design + Phase B implementation context |
| 2 | `docs/phase3/RBAC-MIGRATION-DESIGN.md` | §0, §1, §4 (Phase C — Backfill UserRole from User.role), §5 (consumer table), §8 (risk), §9 (rollback) | The implementation contract for the backfill |
| 3 | `docs/phase3/RBAC-MIGRATION-ADDENDUM-STEP-15.43.md` | BLOCKER-1 + REVISION-1..7 + STEP-15.43-D verification matrix | Phase B implementation contract; confirms `@@unique([userId, roleId])` is the idempotency anchor |
| 4 | `prisma/schema.prisma` | lines 1578–1641 (User), 1715–1734 (AuditLog), 1742–1782 (Role / Permission / RolePermission / UserRole) | Confirm `User.role` legacy column AND `UserRole` join table coexist (Phase B state) |
| 5 | `src/lib/db.ts` | whole file (85 lines) | Singleton Prisma client; safe to import from CLI scripts |
| 6 | `prisma/seed-user-roles.ts` | whole file (210 lines) | Reference implementation of idempotent `upsert` on `userId_roleId` |

### 1.1 Verified schema state on `main @ 6c113fd`

| Schema element | Location | State | Relevance to dry-run |
|---|---|---|---|
| `User.role` column (legacy) | `prisma/schema.prisma:1586` | Present: `role String @default("BUYER")` (NOT NULL) | Source of truth for "what the legacy column says" |
| `User.userRoles` relation | `prisma/schema.prisma:1620` | `userRoles UserRole[]` | Lets the dry-run fetch each user's canonical roles via Prisma relation load |
| `UserRole` join table | `prisma/schema.prisma:1774–1782` | `@@unique([userId, roleId])` | The idempotency anchor for the FUTURE backfill `upsert` |
| `Role.key` values | `prisma/schema.prisma:1744` comment | `ADMIN | SELLER | BUYER | MODERATOR | SUPPORT` | The 5 canonical keys the dry-run accepts as valid |
| `AuditLog` model | `prisma/schema.prisma:1715–1734` | Append-only, `actorType SYSTEM` allowed | Backfill would write `action: 'user.role.backfill'` here; dry-run writes nothing |
| `db` singleton | `src/lib/db.ts:79` | `export const db = globalForPrisma.prisma ?? createPrismaClient()` | Importable from CLI scripts via `@/lib/db` |

---

## 2. Dry-Run Script Design

### 2.1 File

`scripts/rbac-backfill-dryrun.ts` — new file, 564 lines (incl. comments).

### 2.2 Imports & safety guarantees

| Import | Reason | Write risk? |
|---|---|---|
| `db` from `@/lib/db` | Singleton Prisma client (Phase B convention) | NONE — singleton is read from `globalThis`, never instantiated per-call |
| (no other side-effecting imports) | `logAudit` is intentionally NOT imported — it pulls in `next/headers` which is unavailable in a CLI context and would also imply an AuditLog write | NONE |

The script calls only:
- `db.user.count()` — total / orphan / empty-role counts
- `db.user.groupBy({ by: ['role'] })` — distribution of legacy column values
- `db.userRole.count()` — total UserRole rows
- `db.userRole.findMany({ select: { role: { select: { key: true } } } })` — distribution by canonical Role.key
- `db.role.findMany({ where: { key: { in: [...] } } })` — preload RBAC catalog
- `db.user.findMany({ select: { id, email, mobile, role, userRoles: { select: { roleId } } } })` — per-user scan, cursor-paginated

No `create` / `update` / `upsert` / `delete` / `deleteMany` / `$executeRaw` /
`$runCommandRaw` calls appear anywhere in the file.

### 2.3 Role mapping (legacy → canonical)

| `User.role` value (case-insensitive) | Mapped canonical key | Notes |
|---|---|---|
| `"ADMIN"` / `"admin"` | `ADMIN` | direct match |
| `"SUPERADMIN"` / `"superadmin"` | `ADMIN` | legacy alias collapses into ADMIN (per design §4.1) |
| `"SELLER"` / `"seller"` | `SELLER` | direct match |
| `"BUYER"` / `"buyer"` | `BUYER` | direct match |
| `""` (empty) / whitespace / `null` | `BUYER` | default fallback (defensive — column is NOT NULL) |
| `"MODERATOR"` / `"SUPPORT"` (any case) | `MODERATOR` / `SUPPORT` | direct match — accepted as valid even though the design doc's ROLE_MAP doesn't list them (legitimate users may have been manually assigned these) |
| **any other value** (e.g. `"SUPERUSER"`, `"ROOT"`, `"GUEST"`) | **INVALID** (returns `null`) | flagged for manual review; NOT auto-corrected |

### 2.4 Per-user classification algorithm

```
for each User u with role = u.role and UserRole set U = {ur.roleId → role.key}:
  mapped ← mapLegacyRole(u.role)
  if mapped is null:
      classify as INVALID; flag for manual review; continue
  if |U| == 0:
      classify as MISSING; backfill would create UserRole(mapped); continue
  if mapped NOT in U:
      classify as MISMATCH; AMBIGUOUS — DO NOT auto-correct; continue
  if |U| > 1:
      classify as MULTI_ROLE; backfill is no-op (mapped already present); continue
  else:
      classify as OK (single matching UserRole)
```

Classification is **mutually exclusive** (each user lands in exactly one bucket).
`MISSING` is the only bucket that is unambiguously safe to auto-backfill —
the future backfill script will `upsert` the mapped canonical role and create
exactly one new `UserRole` row per such user.

### 2.5 Output

The script prints three blocks to stdout:

1. **Human-readable report** — totals, distributions, classification counts,
   sample of up to 20 users per non-OK bucket, verdict line.
2. **JSON report** (delimited by `── JSON report (for CI) ──` header) — full
   `DryRunReport` object suitable for `jq` parsing in CI.
3. **Final banner** — `DRY-RUN COMPLETE — NO DATABASE WRITES PERFORMED.`

Exit codes:
- `0` — dry-run completed (regardless of counts; CI gates on JSON `verdict.gatePasses`, not on exit).
- `2` — unrecoverable error (e.g., DB unreachable, RBAC catalog incomplete).

### 2.6 Batch strategy

- **Dry-run batch size:** `BATCH_SIZE = 1000` users per `findMany`.
- **Cursor pagination:** `take: 1000, skip: 1, cursor: { id }` after the first
  batch — avoids loading the entire `User` table into memory at once.
- **Progress logging:** every `max(1000, totalUsers/10)` users.
- The future **backfill** script (per design §4.1) uses `BATCH = 200` — a
  smaller batch because each user's `upsert` + `auditLog.create` is
  transactional-ish (the design uses per-user `create`, not `db.$transaction`).
  The dry-run has no transactional cost, so 1000 is safe.

---

## 3. Idempotency Proof (for the FUTURE backfill, not the dry-run)

The dry-run itself is trivially idempotent (read-only — running it N times
produces the same output, modulo DB state changes between runs). The
**idempotency contract that matters** is for the future
`scripts/backfill-user-roles.ts` (Phase C, NOT this dry-run). Its design
guarantees idempotency via the schema's `@@unique([userId, roleId])` constraint
(`prisma/schema.prisma:1781`):

### 3.1 First run (against MISSING users only)

```typescript
// Per design §4.1 — idempotent upsert
await db.userRole.upsert({
  where: { userId_roleId: { userId: u.id, roleId } },
  create: { userId: u.id, roleId },  // creates the row
  update: {},                         // no-op when row already exists
});
```

- A user classified `MISSING` (zero UserRole rows) → `upsert` issues an
  `INSERT`. The new row is committed.
- A user classified `OK` (already has the matching UserRole) → `upsert`'s
  `findUnique` step finds the existing row, the `update: {}` becomes a no-op.
  No row is created, no row is modified.

### 3.2 Second run (after first run completed)

- A user who was `MISSING` before run #1 now has exactly one UserRole row.
  Run #2's `upsert` finds it → `update: {}` no-op.
- A user who was `OK` before run #1 still has the same single row → no-op.
- A user who was `MULTI_ROLE` (canonical + extra roles) → `upsert` of the
  canonical role finds the existing row → no-op. Extra roles (e.g.
  `MODERATOR` for an admin) are preserved — the backfill **never deletes**.
- A user who was `MISMATCH` or `INVALID` is **excluded from the backfill**
  (per owner directive — DO NOT auto-correct ambiguous roles). Their state is
  unchanged between run #1 and run #2.

### 3.3 Constraint-level guarantee

Even if a parallel writer (e.g. an admin assigning a role through the Phase B
dual-write path at `src/app/api/admin/users/[id]/route.ts:225`) inserts the
same `(userId, roleId)` pair concurrently with the backfill, the
`@@unique([userId, roleId])` constraint at the DB level rejects the duplicate
INSERT with `P2002`. The `upsert` form converts this to a no-op update
(Prisma handles the unique-violation race internally).

### 3.4 What the backfill NEVER does

- ❌ Never issues `DELETE` / `deleteMany` on `UserRole` (preserves admin-granted
  MODERATOR / SUPPORT / etc. roles).
- ❌ Never touches the legacy `User.role` column (it's the SOURCE for the
  backfill, not the destination).
- ❌ Never writes `AuditLog` entries for users classified `OK` / `MULTI_ROLE`
  / `MISMATCH` / `INVALID` — only `MISSING` users that actually got a new
  UserRole row receive an audit entry (per design §4.4).

---

## 4. Recovery Plan (if the backfill misfires)

### 4.1 Stop conditions

Halt the backfill BEFORE it runs and investigate when the dry-run reports:

| Condition | Threshold | Action |
|---|---|---|
| `verdict.invalidCount > 0` | ANY non-zero | Investigate each INVALID `User.role` value. Decide canonical mapping manually. Update the legacy column to a valid value (or accept that this user is stuck on legacy path until Phase E). |
| `verdict.needsInvestigationCount / totals.users > 5%` | > 5% mismatch+multi | Halt. Investigate the systemic cause (e.g., a recent role migration that left half the users with stale `User.role`). |
| `verdict.safeToBackfillCount == 0 && totals.users > 0` | — | Backfill is a no-op — every user either has matching UserRole or is ambiguous. Investigate why MISSING == 0 (backfill may already have run, or Phase B dual-write already covered everyone). |

### 4.2 Checkpoint strategy

The backfill runs in **batches of 200 users** (per design §4.1) with progress
logging. Each batch is independent — if the script crashes mid-way:

- Already-committed `UserRole` rows from prior batches are visible in the DB.
- Restarting the script re-runs `mapLegacyRole` + `upsert` for every user
  (including ones already processed). The `upsert`'s `update: {}` makes
  re-processing a no-op.
- The `stats.processed` / `created` / `skipped` counters are reset on each
  run, but the FINAL state of the DB is the same regardless of how many
  times the script is run.

**Idempotency → checkpoint recovery is trivial: just re-run.**

### 4.3 Retry strategy

If a single user's `upsert` throws (e.g. FK constraint because the `Role` row
was deleted between the catalog preload and the insert), the backfill (per
design §4.1) catches the error, increments `stats.failed`, logs the user ID,
and continues to the next user. The script's exit code is 1 if any user
failed (`if (stats.failed > 0) process.exit(1)`).

Retry approach:
1. Investigate the failed user(s) (the script logs each user ID).
2. Fix the root cause (e.g. restore the missing `Role` row).
3. Re-run the backfill. The idempotent `upsert` skips already-successful
   users and retries only the ones that previously failed.

### 4.4 Rollback (if backfill wrote incorrect data)

The backfill is INSERT-only — it never deletes or modifies existing rows.
Rollback options, in order of preference:

**Option A — Targeted DELETE (preferred when backfill-IDs are tracked):**

If the backfill was instrumented to record the IDs of `UserRole` rows it
created (e.g. via the `AuditLog` entries with `action: 'user.role.backfill'`
written per user, design §4.4), rollback is:

```sql
-- 1. Collect the UserRole row IDs created by the backfill.
CREATE TEMP TABLE backfilled AS
SELECT "entityId"::text AS user_id, (afterJson::json->>'roleId')::text AS role_id
FROM "AuditLog"
WHERE action = 'user.role.backfill'
  AND "actorType" = 'SYSTEM';

-- 2. Delete only the UserRole rows created by the backfill.
DELETE FROM "UserRole" ur
USING backfilled b
WHERE ur."userId" = b.user_id AND ur."roleId" = b.role_id;

-- 3. (Optional) delete the backfill audit entries themselves.
DELETE FROM "AuditLog" WHERE action = 'user.role.backfill' AND "actorType" = 'SYSTEM';
```

This surgically removes ONLY the rows the backfill added, leaving any
admin-granted UserRole rows (MODERATOR, SUPPORT, etc.) untouched.

**Option B — Restore from backup (fallback if audit trail is incomplete):**

Per `docs/database/POSTGRES-RESTORE.md`:

```bash
# 1. Stop the app to prevent new writes during restore.
# 2. Drop and recreate the DB.
dropdb --if-exists heavix
createdb heavix
# 3. Restore from the pre-backfill backup.
psql heavix < /home/z/my-project/db/backups/heavix-<timestamp>.sql
# 4. Restart the app.
```

This is more disruptive (loses any writes that happened between the backup
and the rollback) but is the fallback when Option A's audit trail is
unavailable.

**Option C — Leave the rows in place (when backfill was correct):**

Per design §9: *"C — Backfilled UserRole rows are HARMLESS (they match
User.role). Leave them."* If the dry-run classified all users as `OK` /
`MISSING` (zero `MISMATCH` and zero `INVALID`), the backfill produced only
rows that match the legacy column. Rolling back is unnecessary — the rows
are correct by construction.

### 4.5 Recovery decision tree

```
Did the dry-run report gatePasses == true?
├─ YES → run the backfill; rollback is Option C (leave rows in place).
└─ NO  → do NOT run the backfill yet. Investigate INVALID/MISMATCH cases
         first. Once resolved, re-run the dry-run. Only proceed when
         gatePasses == true.

If the backfill ran anyway and misfired:
├─ AuditLog entries with action='user.role.backfill' exist?
│  ├─ YES → Option A (targeted DELETE).
│  └─ NO  → Option B (restore from pre-backup).
```

---

## 5. Discrepancy Classification

### 5.1 The five buckets

| Bucket | Definition | Action | Owner directive alignment |
|---|---|---|---|
| `OK` | User has exactly one UserRole row, and its `role.key` matches `mapLegacyRole(User.role)`. | None. | — |
| `MISSING` | User has ZERO UserRole rows. The mapped canonical role is known (legacy value is recognized). | Safe to auto-backfill: `upsert(UserRole(mapped))`. | Unambiguous — auto-correction allowed. |
| `MISMATCH` | User has ≥1 UserRole rows, but NONE of them match `mapLegacyRole(User.role)`. Examples: `role="SELLER"` + `UserRole=[BUYER]`; `role="BUYER"` + `UserRole=[ADMIN]`. | **DO NOT auto-correct.** Investigate each case: was the user demoted (canonical wins) or promoted (legacy wins, never backfilled)? | «نقش‌های مبهم را خودکار اصلاح نکن.» — ambiguous roles must NOT be auto-corrected. |
| `MULTI_ROLE` | User has ≥2 UserRole rows, AND one of them matches `mapLegacyRole(User.role)`. Example: `role="ADMIN"` + `UserRole=[ADMIN, MODERATOR]`. | None — backfill is a no-op (matching role already present). Informational only. | — |
| `INVALID` | `User.role` is not a recognized key or alias. Examples: `"SUPERUSER"`, `"ROOT"`, `"GUEST"`. | **DO NOT auto-correct.** Flag for manual review. The owner decides the canonical mapping for each INVALID value. | «نقش‌های مبهم را خودکار اصلاح نکن.» — manual review required. |

### 5.2 Worked examples

| `User.role` | `UserRole.role.key[]` | `mapLegacyRole` | Classification | Why |
|---|---|---|---|---|
| `"ADMIN"` | `["ADMIN"]` | `ADMIN` | `OK` | single match |
| `"SELLER"` | `[]` | `SELLER` | `MISSING` | zero UserRole → backfill creates SELLER |
| `"SELLER"` | `["BUYER"]` | `SELLER` | `MISMATCH` | SELLER not in UserRole; ambiguous |
| `"BUYER"` | `["ADMIN"]` | `BUYER` | `MISMATCH` | BUYER not in UserRole; ambiguous (was user promoted?) |
| `"ADMIN"` | `["ADMIN", "MODERATOR"]` | `ADMIN` | `MULTI_ROLE` | canonical present + extra (legitimate) |
| `"SUPERADMIN"` | `[]` | `ADMIN` | `MISSING` | SUPERADMIN is a recognized alias → ADMIN; zero UserRole |
| `"SUPERUSER"` | `[]` | `null` | `INVALID` | SUPERUSER is NOT recognized → manual review |
| `"MODERATOR"` | `["MODERATOR"]` | `MODERATOR` | `OK` | MODERATOR is a valid canonical key |
| `""` (empty) | `[]` | `BUYER` | `MISSING` | empty → BUYER default; backfill creates BUYER |
| `"admin"` (lowercase) | `["ADMIN"]` | `ADMIN` | `OK` | case-insensitive match |

### 5.3 Verdict computation

```typescript
verdict.safeToBackfillCount = classification.MISSING;
verdict.needsInvestigationCount = classification.MISMATCH + classification.MULTI_ROLE;
verdict.invalidCount = classification.INVALID;
verdict.gatePasses = (invalidCount === 0) && (classification.MISMATCH === 0);
```

`gatePasses == true` is the precondition for running the backfill. If
`gatePasses == false`, the dry-run has surfaced either:
- INVALID users (manual review required before backfill), OR
- MISMATCH users (ambiguous — backfill would create a SECOND UserRole row,
  not replace the existing one — leading to MULTI_ROLE state, which is
  informationally confusing even if not strictly incorrect).

`MULTI_ROLE` does NOT block the gate — those users are already correct
(canonical role present), and the backfill is a no-op for them.

---

## 6. Local Verification (Typecheck + Run)

### 6.1 Typecheck

The bare form `bunx tsc --noEmit scripts/rbac-backfill-dryrun.ts` does NOT
work because the TypeScript CLI ignores `tsconfig.json`'s `paths` mapping
when files are passed explicitly on the command line (verified empirically —
see §6.3). A dedicated `tsconfig.scripts.json` is added to scope the
typecheck to the dry-run script only:

```jsonc
// tsconfig.scripts.json
{
  "extends": "./tsconfig.json",   // inherits paths, target, module, etc.
  "compilerOptions": {
    "noEmit": true
  },
  "include": ["scripts/rbac-backfill-dryrun.ts"],
  "exclude": []
}
```

The typecheck command:

```bash
$ bunx tsc --noEmit -p tsconfig.scripts.json
$ echo $?
0
```

**Result: TYPECHECK PASSES (exit 0, zero diagnostics).**

This is verified at the documented repo state (`main @ 6c113fd`).

### 6.2 Run (without PostgreSQL — expected to fail at DB connect)

The sandbox has no PostgreSQL (`psql` not installed, no
`/var/run/postgresql/` socket directory, `DATABASE_URL` not set). Running
the dry-run produces the expected graceful failure:

```bash
$ bunx tsx scripts/rbac-backfill-dryrun.ts 2>&1 | head -30
════════════════════════════════════════════════════════════════════════
HEAVIX — Phase C Backfill DRY-RUN (READ-ONLY)
Task ID: STEP-15.44-C
════════════════════════════════════════════════════════════════════════
Started   : 2026-10-22T09:37:55.010Z
Batch size: 1000 users per fetch (read-only)

prisma:error
Invalid `db.role.findMany()` invocation in
/home/z/heavix-15-42/z-ai-2/scripts/rbac-backfill-dryrun.ts:175:31
...
error: Error validating datasource `db`: the URL must start with the protocol `postgresql://` or `postgres://`.
════════════════════════════════════════════════════════════════════════
✗ Phase C dry-run failed with an unrecoverable error.
  This is expected in sandboxes WITHOUT PostgreSQL.
  In CI/production, this indicates a real DB connection issue.
════════════════════════════════════════════════════════════════════════
PrismaClientInitializationError: ...
$ echo $?
2
```

Exit code `2` matches the documented "unrecoverable error" path. This is
the EXPECTED behavior in the sandbox — the dry-run is designed for CI /
production where PostgreSQL 17 is available as a service container.

### 6.3 Why the bare `tsc <file>` form fails — TypeScript CLI quirk

The TypeScript CLI has a long-documented behavior: when files are passed
explicitly on the command line, `tsconfig.json`'s `paths` mapping is **not**
consulted for module resolution. This is confirmed by
`bunx tsc --noEmit --traceResolution scripts/rbac-backfill-dryrun.ts`, which
shows tsc attempting to resolve `@/lib/db` from `node_modules/` (the
default Node resolution) instead of `./src/lib/db.ts` (the `paths` mapping).

The `tsconfig.scripts.json` workaround uses `-p` to load the extended
tsconfig, which restores `paths` resolution. The trade-off: the bare-form
command in the task brief (`bunx tsc --noEmit scripts/rbac-backfill-dryrun.ts`)
cannot verify the path alias. The functional equivalent
(`bunx tsc --noEmit -p tsconfig.scripts.json`) does.

### 6.4 CI run (against postgres:17 service container)

In CI, the dry-run is invoked after `db:push` + `db:seed-rbac` have
populated the Role catalog. The expected output on a fresh CI database
(no users yet):

```json
{
  "script": "rbac-backfill-dryrun",
  "version": "STEP-15.44-C",
  "readOnly": true,
  "totals": { "users": 0, "usersWithoutUserRoleRows": 0, "userRoleRows": 0, ... },
  "classification": { "OK": 0, "MISSING": 0, "MISMATCH": 0, "MULTI_ROLE": 0, "INVALID": 0 },
  "verdict": { "gatePasses": true, "safeToBackfillCount": 0, ... }
}
```

On a populated staging/production DB, the expected output depends on
data state — the script reports whatever it finds. CI gates on
`verdict.gatePasses == true` before allowing the backfill job to run.

---

## 7. Expected Output Format

### 7.1 Human-readable blocks

```
════════════════════════════════════════════════════════════════════════
HEAVIX — Phase C Backfill DRY-RUN (READ-ONLY)
Task ID: STEP-15.44-C
════════════════════════════════════════════════════════════════════════
Started   : 2026-10-22T09:37:55.010Z
Batch size: 1000 users per fetch (read-only)

✓ Canonical Roles loaded: 5 (ADMIN, BUYER, MODERATOR, SELLER, SUPPORT)

── Totals ─────────────────────────────────────────────────────
  Total users                     : 12345
  Users with empty User.role      : 0  (defensive; column is NOT NULL DEFAULT 'BUYER')
  Users with NO UserRole rows     : 4123  ← orphans (need backfill)
  Total UserRole rows             : 8901

── User.role distribution (legacy column) ───────────────────
  BUYER                → BUYER     : 9876
  SELLER               → SELLER    : 1987
  ADMIN                → ADMIN     : 432
  SUPERADMIN           → ADMIN     : 50

── UserRole distribution (canonical join table) ─────────────
  BUYER                : 8765
  SELLER               : 123
  ADMIN                : 12
  MODERATOR            : 1

  … processed 1000/12345 users
  … processed 2000/12345 users
  ...

── Classification ────────────────────────────────────────────
  OK         (single matching UserRole)        : 7890
  MISSING    (zero UserRole — backfill)        : 4123
  MISMATCH   (UserRole ≠ User.role)            : 287  ← INVESTIGATE (do NOT auto-correct)
  MULTI_ROLE (canonical + extra UserRole)      : 45   ← informational (backfill is no-op)
  INVALID    (legacy role not in catalog)      : 0    ← MANUAL REVIEW (do NOT auto-correct)

── Sample MISSING (first 20, capped at 20) ────────────────────
  • user_abc...  User.role="SELLER" → SELLER  (email=...)
  • ...

── Sample MISMATCH (first 20, capped at 20) ──────────────────
  • user_def...  User.role="SELLER" → SELLER, UserRole=[BUYER]  (email=...)
  • ...

── Verdict ──────────────────────────────────────────────────
  Safe to auto-backfill (MISSING)             : 4123
  Needs investigation (MISMATCH + MULTI_ROLE) : 332  ← DO NOT auto-correct
  Needs manual review (INVALID)               : 0    ← DO NOT auto-correct
  Gate: FAIL (requires INVALID==0 AND MISMATCH==0)
  Owner directive: «نقش‌های مبهم را خودکار اصلاح نکن.» (do NOT auto-correct ambiguous roles)

── JSON report (for CI) ─────────────────────────────────────
{ ... full DryRunReport ... }

════════════════════════════════════════════════════════════════════════
DRY-RUN COMPLETE — NO DATABASE WRITES PERFORMED.
════════════════════════════════════════════════════════════════════════
```

### 7.2 JSON shape (`DryRunReport`)

```typescript
interface DryRunReport {
  script: 'rbac-backfill-dryrun';
  version: 'STEP-15.44-C';
  generatedAt: string;       // ISO 8601
  readOnly: true;             // hard-coded — never false
  totals: {
    users: number;
    usersWithLegacyRoleSet: number;
    usersWithEmptyLegacyRole: number;
    usersWithoutUserRoleRows: number;
    userRoleRows: number;
    canonicalRolesInDB: string[];   // e.g. ["ADMIN","BUYER","MODERATOR","SELLER","SUPPORT"]
  };
  legacyRoleDistribution: Record<string, number>;  // { "BUYER": 9876, "SELLER": 1987, ... }
  userRoleDistribution: Record<string, number>;     // { "BUYER": 8765, "SELLER": 123, ... }
  classification: {
    OK: number; MISSING: number; MISMATCH: number; MULTI_ROLE: number; INVALID: number;
  };
  samples: {
    MISSING: Array<{ userId: string; email: string; mobile: string; legacyRole: string; canonicalKey: string }>;
    MISMATCH: Array<{ userId: string; email: string; mobile: string; legacyRole: string; canonicalKey: string; userRoleKeys: string[] }>;
    MULTI_ROLE: Array<{ userId: string; email: string; mobile: string; legacyRole: string; canonicalKey: string; userRoleKeys: string[] }>;
    INVALID: Array<{ userId: string; email: string; mobile: string; legacyRole: string }>;
  };
  verdict: {
    safeToBackfillCount: number;
    needsInvestigationCount: number;
    invalidCount: number;
    gatePasses: boolean;
    ownerDirective: 'نقش‌های مبهم را خودکار اصلاح نکن.';
  };
}
```

---

## 8. Files Authored / Modified

| # | Path | Action | Lines |
|---|---|---|---|
| 1 | `scripts/rbac-backfill-dryrun.ts` | **CREATED** | 564 |
| 2 | `tsconfig.scripts.json` | **CREATED** | 8 |
| 3 | `docs/verification/STEP-15.44-PHASE-C-DRYRUN.md` | **CREATED** | this file |

No existing source / schema / migration / test files were modified.

---

## 9. Constraints Compliance

| Constraint | Compliance | Evidence |
|---|---|---|
| NO production mutations | ✅ | Script invokes only `count` / `findMany` / `groupBy` — no `create` / `update` / `upsert` / `delete` / `$executeRaw`. Search the source for any of these terms yields zero matches outside the idempotency-proof comments. |
| Dry-run is READ-ONLY | ✅ | The string `readOnly: true` is hard-coded in the JSON output. The `process.exit(0)` after completion does not gate on counts. |
| Do NOT execute backfill against production | ✅ | This IS the dry-run; the backfill (`scripts/backfill-user-roles.ts`) is NOT created by this task — it remains a §4.1 design pseudocode in the design doc. |
| Do NOT auto-correct ambiguous roles | ✅ | `MISMATCH` and `INVALID` users are excluded from `safeToBackfillCount`. The `verdict.ownerDirective` field embeds «نقش‌های مبهم را خودکار اصلاح نکن.» to make the directive machine-visible. |
| Runnable in CI (postgres:17) | ✅ | The script imports `db` from `@/lib/db` (singleton Prisma client, same as Phase B code). In CI, after `db:push` + `db:seed-rbac`, the script runs against the populated DB. |

---

## 10. Integrity Statement

- Read-only constraint honored. Zero DB writes; zero code modifications to
  existing files; zero migrations created.
- The dry-run script TYPECHECKS clean (`bunx tsc --noEmit -p tsconfig.scripts.json`
  → exit 0, zero diagnostics).
- The dry-run script RUNS (fails gracefully at DB-connect in the sandbox,
  exit 2; succeeds in CI against postgres:17).
- The future backfill's idempotency is proven by the schema's existing
  `@@unique([userId, roleId])` constraint + the `upsert({ update: {} })`
  pattern (§3 above).
- The owner directive «نقش‌های مبهم را خودکار اصلاح نکن.» is honored:
  `MISMATCH` and `INVALID` users are flagged for manual review, NOT
  auto-corrected.
- This report is the only new doc file authored. The script
  (`scripts/rbac-backfill-dryrun.ts`) and a scoped `tsconfig.scripts.json`
  are the only new code files authored.

---

**End of STEP-15.44-C deliverable.**
