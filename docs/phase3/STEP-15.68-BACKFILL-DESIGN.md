# STEP 15.68 — Phase C Backfill Design (Apply Mode)

**Status:** DESIGN ONLY — the apply script is NOT implemented in STEP 15.68.
**Task ID:** STEP-15.68
**Branch:** `chore/step-15-68-phase-c-preflight`
**Companion documents:**
- `docs/phase3/STEP-15.68-STAGING-RUNBOOK.md` — staging dry-run runbook
- `docs/verification/STEP-15.68-PREFLIGHT-REPORT.md` — preflight audit
- `docs/phase3/RBAC-MIGRATION-DESIGN.md` §4 — original Phase C design
- `docs/phase3/RBAC-MIGRATION-ADDENDUM-STEP-15.43.md` — addendum

---

## 1. Purpose

This document specifies the design of the Phase C backfill **apply** script
(`scripts/backfill-user-roles.ts`, NOT YET IMPLEMENTED). The apply script
takes the dry-run output (see
`docs/phase3/STEP-15.68-STAGING-RUNBOOK.md`) and performs the actual
`UserRole` row creation for users classified as `MISSING`.

The apply script is **out of scope** for STEP 15.68 (preparation only).
This document is the design that a future step (STEP 15.69+) will
implement.

---

## 2. Goals and non-goals

### 2.1 Goals

- Create missing `UserRole` rows for users classified as `MISSING` by the
  dry-run.
- Be **idempotent**: re-running the apply script must be a no-op (no
  duplicate `UserRole` rows, no errors).
- Be **safe**: never auto-correct `MISMATCH`, `MULTI_ROLE`, or `INVALID`
  records (per owner directive «نقش‌های مبهم را خودکار اصلاح نکن.»).
- Be **observable**: emit a structured report (JSON + human) with
  before/after counts and an audit trail.
- Be **resumable**: if the script crashes mid-run, a re-run must resume
  from where it left off (no data corruption, no duplicate work).
- Be **reversible**: provide a clear rollback procedure (delete the
  `UserRole` rows created by this script, by `roleId` + `createdAt`
  window).

### 2.2 Non-goals

- Migrating legacy `User.role` values to canonical Role keys (that's the
  dry-run's job — `mapLegacyRole()`).
- Granting `ADMIN` UserRole to legacy admins (that's
  `prisma/seed-rbac.ts:197-215`'s backward-compat path, already
  shipped).
- Auto-correcting `MISMATCH`/`MULTI_ROLE`/`INVALID` records (explicitly
  forbidden by owner directive).
- Backfilling `Role`/`Permission`/`RolePermission` catalog rows (that's
  `prisma/seed-rbac.ts`'s job, already idempotent).
- Replacing the dry-run (the dry-run remains the gate; the apply script
  runs only AFTER the dry-run's gate passes).

---

## 3. Idempotency design

### 3.1 Schema-level guarantee

The `UserRole` table has a `@@unique([userId, roleId])` constraint
(`prisma/schema.prisma:1781`). This means `(userId, roleId)` is unique —
the database will reject any duplicate insert.

The apply script uses `db.userRole.upsert()` with this unique constraint
as the `where` clause:

```typescript
await db.userRole.upsert({
  where: { userId_roleId: { userId: u.id, roleId: mappedRoleId } },
  create: { userId: u.id, roleId: mappedRoleId },
  update: {}, // no-op when the row already exists
});
```

- **First run:** `create` fires, row is inserted.
- **Second run:** `update: {}` fires (a no-op), row is NOT modified.
- **No duplicates can ever be created** — the unique constraint
  guarantees it.

### 3.2 Idempotency proof

The dry-run script's header docstring (lines 34-40) states:

> The actual `scripts/backfill-user-roles.ts` (Phase C, NOT this dry-run)
> will use `db.userRole.upsert({ where: { userId_roleId: ... },
> create: {...}, update: {} })` against the schema's existing
> `@@unique([userId, roleId])` constraint (prisma/schema.prisma:1781).
> First run: creates missing rows. Second run: `update: {}` is a no-op.
> No duplicates can ever be created.

The apply script will implement exactly this pattern.

### 3.3 Concurrency safety

The `upsert` is atomic at the row level (PostgreSQL `INSERT ... ON
CONFLICT DO NOTHING` under the hood). Multiple concurrent apply runs
would each attempt the same upsert; one would `create`, the others would
`update: {}`. No errors, no duplicates.

For safety, the apply script SHOULD NOT be run concurrently. The
runbook will specify single-process execution.

---

## 4. Batch processing with checkpoints

### 4.1 Batch size

The dry-run uses `BATCH_SIZE=1000` (read-only, no transactional cost).
The apply script uses a SMALLER batch size because each row creation is
a write:

```typescript
const BATCH_SIZE = 200; // apply uses smaller batches than dry-run (1000)
                       // because each row creation is a write.
```

### 4.2 Cursor pagination

The apply script uses cursor pagination (same pattern as the dry-run at
lines 316-401):

```typescript
let cursor: string | undefined = undefined;
while (true) {
  const users = await db.user.findMany({
    take: BATCH_SIZE,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    orderBy: { id: 'asc' },
    select: { id: true, role: true, userRoles: { select: { roleId: true } } },
  });
  if (users.length === 0) break;
  cursor = users[users.length - 1].id;

  for (const u of users) {
    const mapped = mapLegacyRole(u.role);
    if (mapped === null) continue; // INVALID — skip
    // ... classify + apply (see §5)
  }
}
```

### 4.3 Checkpoint mechanism

After each batch, the script logs progress:

```typescript
console.log(`  … processed ${processed}/${totalUsers} users (${created} created, ${skipped} skipped)`);
```

The script does NOT persist a checkpoint to the DB. Resumability relies
on idempotency (§3): a re-run re-processes all users, but the `upsert`
is a no-op for already-backfilled users. This is simpler and safer
than maintaining a checkpoint table.

### 4.4 Why no checkpoint table

A checkpoint table would require:
- A new schema model (`BackfillCheckpoint` with `lastProcessedUserId`,
  `lastRunAt`, etc.).
- Migration of that model.
- Logic to read/write the checkpoint.
- Logic to handle stale checkpoints (e.g., if the schema changes
  between runs).

The idempotency-based approach avoids all of this complexity at the
cost of re-scanning users on each run. For 10K users, the re-scan takes
seconds. For 1M+ users, a checkpoint table may be worth the complexity
(see §13 Open questions).

---

## 5. Transaction behavior and error handling

### 5.1 Per-user transaction

Each `upsert` is its own implicit transaction. If a single upsert fails
(e.g., foreign key constraint violation because the `Role` row was
deleted), the script:

1. Logs the error with the `userId` and `roleId`.
2. Increments an `errors` counter.
3. Continues to the next user (does NOT abort the whole run).

This is a deliberate trade-off: a single bad row should not block the
entire backfill. The operator can triage the failed rows after the run.

### 5.2 Batch-level transaction (alternative, NOT used)

An alternative would be to wrap each batch in a `db.$transaction([...])`:

```typescript
await db.$transaction([
  db.userRole.upsert({ ... }),
  db.userRole.upsert({ ... }),
  // ... 200 upserts
]);
```

If any upsert in the batch fails, the entire batch rolls back. This is
more strict but less resilient: a single bad row blocks 199 good ones.

The apply script uses per-user transactions (§5.1) for resilience.

### 5.3 Crash recovery

If the script crashes mid-run:
- Already-created `UserRole` rows are committed (per-user transactions).
- The crash does NOT corrupt any data.
- A re-run resumes from the beginning (no checkpoint), but the `upsert`
  is a no-op for already-created rows.

### 5.4 Connection failure

If the DB connection drops mid-run:
- The current `upsert` fails (logged as an error).
- The script attempts to reconnect on the next iteration (Prisma's
  connection pool handles this automatically).
- If the connection cannot be re-established, the script exits with
  code 2.

### 5.5 AuditLog writes

Each `UserRole` creation MUST be accompanied by an `AuditLog` entry
(per `prisma/seed-user-roles.ts:53-85`'s pattern):

```typescript
await db.auditLog.create({
  data: {
    actorType: 'SYSTEM',
    action: 'user.role.assign',
    entityType: 'User',
    entityId: u.id,
    reason: 'Phase C backfill: assigned role from legacy User.role',
    afterJson: JSON.stringify({ userId: u.id, roleKey: mapped, roleId }),
  },
});
```

The `AuditLog` write is in the SAME per-user transaction as the
`UserRole` upsert (via `db.$transaction([upsert, auditLog.create])`).
If either fails, both roll back. This ensures the audit trail is
always consistent with the data.

---

## 6. Conflict management

### 6.1 What conflicts can occur

1. **`UserRole` row already exists** (idempotent re-run): handled by
   `upsert` with `update: {}` — no conflict, no error.
2. **`Role` row deleted between dry-run and apply**: the `upsert` fails
   with a foreign key constraint violation. Logged as an error. The
   operator must re-run `db:seed-rbac` to restore the catalog, then
   re-run the apply.
3. **`User` row deleted between dry-run and apply**: the `upsert` fails
   with a foreign key constraint violation. Logged as an error. The
   operator must re-run the dry-run to confirm the new state, then
   re-run the apply.
4. **Concurrent apply run** (two operators running the apply at the same
   time): both runs attempt the same upserts. One creates, the other
   no-ops. No conflict, but the audit log will have duplicate entries
   (both runs log the assignment). The operator should ensure only one
   apply runs at a time (per the runbook).
5. **Concurrent user mutation** (an admin manually changes a user's
   `UserRole` during the apply): the apply's `upsert` may overwrite or
   be overwritten by the manual change. The `update: {}` clause means
   the apply does NOT overwrite existing rows — so if the admin added
   a role, the apply's `upsert` for that role is a no-op. If the admin
   deleted a role, the apply re-creates it. This is the desired
   behavior (the apply is idempotent and respects existing state).

### 6.2 Conflict resolution policy

- **Idempotent conflicts (1, 5):** no action needed. The `upsert`
  handles it.
- **Catalog conflicts (2, 3):** halt the apply, log the error, alert the
  operator. Do NOT auto-recover (the operator must verify the catalog
  state).
- **Concurrency conflicts (4):** prevent via runbook policy (single
  apply run at a time). If detected (via duplicate audit log entries),
  deduplicate manually.

---

## 7. No auto-correction of MISMATCH / MULTI_ROLE / INVALID

### 7.1 Policy

Per owner directive «نقش‌های مبهم را خودکار اصلاح نکن.» (do not
auto-correct ambiguous roles), the apply script MUST NOT:

- **MISMATCH:** create a `UserRole` row for the mapped legacy role when
  the user already has DIFFERENT `UserRole` rows. The dry-run classifies
  this as `MISMATCH` (ambiguous — was the user demoted or promoted?).
  The apply skips these users and logs them for manual review.
- **MULTI_ROLE:** modify or delete existing `UserRole` rows. The dry-run
  classifies this as `MULTI_ROLE` (the canonical role is already
  present, plus extra roles). The apply is a no-op for these users
  (the `upsert` with `update: {}` does nothing).
- **INVALID:** create a `UserRole` row for an unrecognized legacy role.
  The dry-run classifies this as `INVALID` (e.g., `User.role='GOD'`).
  The apply skips these users and logs them for manual review.

### 7.2 Implementation

The apply script uses the same `mapLegacyRole()` function as the dry-run.
If `mapLegacyRole()` returns `null`, the user is `INVALID` — skip. The
classification logic (lines 334-396 of the dry-run) is replicated in the
apply script:

```typescript
for (const u of users) {
  const mapped = mapLegacyRole(u.role);
  if (mapped === null) {
    skipped.invalid++;
    continue;
  }
  const userRoleKeys = u.userRoles.map((ur) => roleById.get(ur.roleId) ?? '<unknown>');
  const canonicalInUserRoles = userRoleKeys.includes(mapped);

  if (userRoleKeys.length === 0) {
    // MISSING — apply creates the UserRole row.
    const roleId = roleByKey.get(mapped)!;
    await db.$transaction([
      db.userRole.upsert({
        where: { userId_roleId: { userId: u.id, roleId } },
        create: { userId: u.id, roleId },
        update: {},
      }),
      db.auditLog.create({ data: { /* ... */ } }),
    ]);
    created++;
  } else if (!canonicalInUserRoles) {
    // MISMATCH — skip (do NOT auto-correct).
    skipped.mismatch++;
  } else if (userRoleKeys.length > 1) {
    // MULTI_ROLE — no-op (canonical already present).
    skipped.multiRole++;
  } else {
    // OK — no-op (already correct).
    skipped.ok++;
  }
}
```

### 7.3 What about future MULTI_ROLE approval?

The owner may, in a future step, approve an accepted-risk override for
`MULTI_ROLE` (per the dry-run script's comment at line 449). If so, the
apply script will need a `--allow-multi-role` flag (or similar) that
changes the gate policy. This is OUT OF SCOPE for STEP 15.68.

---

## 8. Dry-run vs apply mode

### 8.1 Comparison

| Aspect | Dry-run | Apply |
|---|---|---|
| Script | `scripts/rbac-backfill-dryrun.ts` | `scripts/backfill-user-roles.ts` (NOT YET IMPLEMENTED) |
| DB writes | NONE (read-only, verified by BEFORE/AFTER fingerprint) | YES (creates `UserRole` rows + `AuditLog` entries) |
| DB role | `heavix_dryrun_ro` (SELECT only) | A role with INSERT on `UserRole` + `AuditLog` (NOT `heavix_dryrun_ro`) |
| Gate | `gatePasses=true` required to proceed | N/A (the apply is the action; it doesn't gate) |
| Exit code | 0 (success) or 2 (unrecoverable error) | 0 (success), 1 (partial failure — some users errored), 2 (unrecoverable error) |
| Idempotency | N/A (read-only) | Yes — `upsert` with `update: {}` |
| AuditLog | NONE (intentionally NOT imported) | YES (one entry per `UserRole` creation) |
| Output | JSON report + `DRYRUN_GATE:` line | JSON report (before/after counts + per-user results) |
| Run order | FIRST (gate) | SECOND (action), only after dry-run gate passes |

### 8.2 Sequencing

1. **Dry-run** (read-only, `heavix_dryrun_ro` role): produces
   classification + gate decision.
2. **Operator reviews** the dry-run output. If `gatePasses=false`, STOP.
3. **Apply** (read-write role): creates missing `UserRole` rows + audit
   logs.
4. **Apply report**: before/after counts. The `MISSING` count should
   drop to 0 (or near 0). The `OK` count should increase by the
   number of created rows.
5. **(Optional) Re-run dry-run**: confirms the apply's effect. The
   second dry-run should show `MISSING=0` and `gatePasses=true`.

### 8.3 Why the dry-run is still needed after the apply

The dry-run is the GATE. The apply is the ACTION. Even after a
successful apply, the dry-run should be re-run to verify:

- All `MISSING` users are now `OK` (or still `MISSING` if the apply
  skipped them due to errors).
- No new `INVALID`/`MISMATCH`/`MULTI_ROLE` users appeared (e.g., due to
  concurrent traffic).
- The read-only invariant holds (no unexpected mutations).

---

## 9. Before/after reporting

### 9.1 Before snapshot (read at the start of the apply)

```typescript
const before = {
  totalUsers: await db.user.count(),
  usersWithoutUserRoleRows: await db.user.count({ where: { userRoles: { none: {} } } }),
  totalUserRoleRows: await db.userRole.count(),
  // Per-role breakdown
  adminUserRoles: await db.userRole.count({ where: { role: { key: 'ADMIN' } } }),
  sellerUserRoles: await db.userRole.count({ where: { role: { key: 'SELLER' } } }),
  buyerUserRoles: await db.userRole.count({ where: { role: { key: 'BUYER' } } }),
  moderatorUserRoles: await db.userRole.count({ where: { role: { key: 'MODERATOR' } } }),
  supportUserRoles: await db.userRole.count({ where: { role: { key: 'SUPPORT' } } }),
};
```

### 9.2 After snapshot (read at the end of the apply)

Same structure as the before snapshot. The diff shows the apply's
effect:

- `totalUsers` unchanged (the apply does NOT create/delete users).
- `usersWithoutUserRoleRows` decreased by the number of created
  `UserRole` rows.
- `totalUserRoleRows` increased by the same number.
- Per-role counts increased according to the mapping (e.g., if 50
  `MISSING` users had `User.role='SELLER'`, `sellerUserRoles` increased
  by 50).

### 9.3 Per-user results

The apply script emits a JSON report with per-user results:

```json
{
  "script": "backfill-user-roles",
  "version": "STEP-15.69",
  "generatedAt": "2026-10-24T...",
  "mode": "apply",
  "before": { /* §9.1 */ },
  "after": { /* §9.2 */ },
  "summary": {
    "processed": 10000,
    "created": 1234,
    "skipped": {
      "ok": 8500,
      "mismatch": 200,
      "multiRole": 80,
      "invalid": 20
    },
    "errors": 0
  },
  "errors": [
    // Per-user errors (if any). Each entry: { userId, role, error }.
  ],
  "samples": {
    // First 20 errors (capped at SAMPLE_CAP=20) for triage.
  }
}
```

### 9.4 Audit trail

Every `UserRole` creation is logged in `AuditLog` with:
- `actorType: 'SYSTEM'`
- `action: 'user.role.assign'`
- `entityType: 'User'`
- `entityId: <userId>`
- `reason: 'Phase C backfill: assigned role from legacy User.role'`
- `afterJson: { userId, roleKey, roleId }`

This matches the pattern in `prisma/seed-user-roles.ts:148-156`. The
audit entries are visible in `/admin/audit-log` for post-apply review.

---

## 10. Stop criteria

### 10.1 Pre-apply stop criteria

STOP and do NOT run the apply if ANY of the following are true:

1. The dry-run's `gatePasses=false` (see Runbook §7.1).
2. The dry-run's `readOnlyInvariant=false` (mutation detected).
3. The dry-run was run more than 1 hour ago (data may have changed —
   re-run the dry-run).
4. The dry-run was run against a DIFFERENT database than the apply
   target (e.g., dry-run on staging, apply on production — NEVER do
   this).
5. There are untriaged `INVALID`/`MISMATCH`/`MULTI_ROLE` records in the
   dry-run output (the operator must review and disposition each one
   first).
6. The staging DB is under heavy load (the apply adds write load).
7. A backup of the staging DB is NOT available (in case rollback is
   needed).

### 10.2 Mid-apply stop criteria

STOP the apply mid-run if ANY of the following are true:

1. The error count exceeds a threshold (e.g., `errors > 10`). This
   suggests a systemic issue (catalog drift, connection instability).
2. The apply is taking unexpectedly long (> 5 minutes for 10K users).
3. The DB connection drops repeatedly.
4. An alert fires indicating staging is unhealthy.

### 10.3 Post-apply stop criteria (before declaring success)

STOP and investigate if ANY of the following are true after the apply:

1. The `before.totalUserRoleRows + created !== after.totalUserRoleRows`.
   This means rows were created or deleted by another process during
   the apply.
2. The `after.usersWithoutUserRoleRows > 0` AND there are no
   `INVALID`/`MISMATCH` records (the apply should have backfilled all
   `MISSING` users; if some remain, investigate).
3. The re-run dry-run (see Runbook §8) shows `gatePasses=false` (new
   `INVALID`/`MISMATCH`/`MULTI_ROLE` appeared).

---

## 11. Recovery and rollback

### 11.1 Rollback procedure

If the apply created incorrect `UserRole` rows (e.g., due to a
`mapLegacyRole()` bug), rollback:

1. **Identify the created rows.** The apply's `AuditLog` entries
   (action `user.role.assign`, reason `'Phase C backfill: ...'`)
   identify every row created by the apply. Query:
   ```sql
   SELECT "entityId" AS user_id, ("afterJson"::json->>'roleKey') AS role_key, "createdAt"
   FROM "AuditLog"
   WHERE action = 'user.role.assign'
     AND reason = 'Phase C backfill: assigned role from legacy User.role'
     AND "createdAt" >= '<apply_start_timestamp>';
   ```
2. **Delete the `UserRole` rows.** For each `(user_id, role_key)`,
   delete the `UserRole` row IF it was created by the apply (check
   `createdAt` matches the apply window):
   ```sql
   DELETE FROM "UserRole"
   WHERE "userId" = '<user_id>'
     AND "roleId" = (SELECT id FROM "Role" WHERE key = '<role_key>')
     AND "createdAt" >= '<apply_start_timestamp>';
   ```
3. **Delete the `AuditLog` entries.** Optionally, delete the apply's
   audit entries to avoid confusion (or keep them as a record of the
   rollback):
   ```sql
   DELETE FROM "AuditLog"
   WHERE action = 'user.role.assign'
     AND reason = 'Phase C backfill: assigned role from legacy User.role'
     AND "createdAt" >= '<apply_start_timestamp>';
   ```
4. **Verify.** Re-run the dry-run. The `MISSING` count should return
   to its pre-apply value.

### 11.2 Rollback limitations

- The rollback deletes `UserRole` rows created by the apply. If the
  apply also modified existing rows (it shouldn't — `update: {}` is a
  no-op), those modifications are NOT rolled back.
- The rollback does NOT restore `User.role` (the legacy column) — the
  apply doesn't modify it, so there's nothing to restore.
- The rollback does NOT undo `AuditLog` writes from OTHER processes
  during the apply window (those are unrelated).

### 11.3 Backup strategy

Before running the apply, take a backup of the staging DB:

```bash
# Use the existing backup script.
scripts/backup.sh
# Or manually:
pg_dump -h staging-host -U postgres heavix_staging > backup-$(date -u +%Y%m%dT%H%M%SZ).sql
```

The backup should be stored in a location that survives a DB restore
(e.g., S3, not the DB host itself).

### 11.4 Recovery from backup

If rollback is insufficient (e.g., the apply corrupted data in ways
the rollback can't fix), restore from backup:

```bash
# Drop and recreate the staging DB.
psql -h staging-host -U postgres -c "DROP DATABASE heavix_staging;"
psql -h staging-host -U postgres -c "CREATE DATABASE heavix_staging;"

# Restore from backup.
psql -h staging-host -U postgres -d heavix_staging < backup-YYYYMMDDTHHMMSS.sql

# Re-run the dry-run to verify the restore.
bunx tsx scripts/rbac-backfill-dryrun.ts
```

---

## 12. Implementation checklist (for STEP 15.69+)

When implementing the apply script, ensure:

- [ ] Create `scripts/backfill-user-roles.ts` based on this design.
- [ ] Use `db.userRole.upsert({ where: { userId_roleId: ... }, create: ..., update: {} })` for idempotency.
- [ ] Use `BATCH_SIZE=200` for write batches.
- [ ] Use cursor pagination (same pattern as dry-run).
- [ ] Wrap each `UserRole` upsert + `AuditLog` create in `db.$transaction([...])`.
- [ ] Skip `INVALID`/`MISMATCH`/`MULTI_ROLE` users (do NOT auto-correct).
- [ ] Emit a JSON report with before/after counts + per-user results.
- [ ] Exit codes: 0 (success), 1 (partial failure), 2 (unrecoverable error).
- [ ] Add unit tests in `tests/unit/rbac-backfill-apply.test.ts` (pure logic, no DB).
- [ ] Add an integration test in `tests/integration/rbac-backfill-apply-real.test.ts` (real Postgres).
- [ ] Add a CI step that runs the apply script after the dry-run gate passes (in `.github/workflows/ci.yml`).
- [ ] Update this design doc with the implemented SHA + any deviations.
- [ ] Implement the preflight identity check (see Runbook §3.3) in BOTH the dry-run and apply scripts.
- [ ] Document the apply runbook (separate from the dry-run runbook).

---

## 13. Open design questions

### 13.1 Should the apply script use a checkpoint table for 1M+ users?

For 10K users, re-scanning on each run is fine (seconds). For 1M+ users,
re-scanning takes minutes. A `BackfillCheckpoint` table
(`lastProcessedUserId`, `lastRunAt`, `schemaVersion`) would allow
resuming from where the last run left off.

**Decision:** Defer. The dry-run already scales to 10K+ users in seconds
(read-only). The apply script's write cost dominates, so a checkpoint
table would only help if the apply is interrupted frequently. Implement
only if the user count grows beyond 100K.

### 13.2 Should the apply script support `--dry-run` mode?

A `--dry-run` flag on the apply script would make it behave like the
dry-run script (read-only, no writes). This would unify the two scripts.

**Decision:** No. The dry-run script is the authoritative gate, with
its own `DRYRUN_GATE:` output format consumed by CI. The apply script
has a different responsibility (writes + audit). Unifying them would
add complexity without clear benefit.

### 13.3 Should the apply script support `--allow-multi-role`?

Per the dry-run script's comment (line 449), the owner may approve an
accepted-risk override for `MULTI_ROLE` in a future step. If so, the
apply script needs a flag to allow backfilling `MULTI_ROLE` users
(which is currently a no-op because the canonical role is already
present).

**Decision:** Defer until the owner explicitly approves. Document the
flag in this design doc when approved.

### 13.4 Should the apply script write to a separate audit schema?

Currently, `AuditLog` is in the `public` schema. A separate
`audit` schema (with append-only permissions) would prevent accidental
deletion of audit entries.

**Decision:** Out of scope for Phase C. Tracked as a separate
hardening task (see `docs/verification/STEP-15.43-SECURITY-RBAC-REVIEW.md`).

### 13.5 Should the apply script use `REPEATABLE READ` isolation?

To avoid concurrent-write interference, the apply could run in a
single `REPEATABLE READ` transaction. But this holds a transaction
open for the entire run (minutes for 1M users), causing autovacuum
bloat.

**Decision:** No. Per-user transactions (§5.1) provide sufficient
isolation without long-running transactions.

### 13.6 What about `User.role` column removal?

After the apply completes successfully (all users have `UserRole` rows),
the legacy `User.role` column (`prisma/schema.prisma:1586`) could be
removed. This is a separate migration task.

**Decision:** Out of scope for Phase C. The legacy column should be
kept (with `DEFAULT 'BUYER'`) until all code paths are migrated to
use `UserRole` exclusively. Tracked as a separate cleanup task.

---

## 14. References

- `scripts/rbac-backfill-dryrun.ts` — dry-run script (read-only gate)
- `scripts/rbac-gate-ci.ts` — CI gate runner
- `src/lib/rbac/gate-logic.ts` — shared gate logic (single source of truth)
- `prisma/schema.prisma:1578-1641` — User model (legacy `role` column)
- `prisma/schema.prisma:1742-1782` — Role, Permission, RolePermission, UserRole models
- `prisma/seed-rbac.ts` — RBAC catalog seed (idempotent, with ADMIN backward-compat)
- `prisma/seed-user-roles.ts` — UserRole seed (idempotent, with audit log)
- `scripts/rbac-create-readonly-role.sql` — read-only PG role creation
- `tests/unit/rbac-dryrun-preflight.test.ts` — preflight unit tests (STEP 15.68)
- `tests/unit/rbac-gate-logic.test.ts` — gate logic unit tests
- `tests/integration/rbac-readonly-role-real.test.ts` — read-only role integration tests
- `docs/phase3/RBAC-MIGRATION-DESIGN.md` §4 — original Phase C design
- `docs/phase3/RBAC-MIGRATION-ADDENDUM-STEP-15.43.md` — addendum
- `docs/verification/STEP-15.44-PHASE-C-DRYRUN.md` — dry-run implementation verification
- `docs/verification/STEP-15.50-READONLY-ROLE.md` — read-only role design
- `docs/verification/STEP-15.51-READONLY-CI-GATE.md` — CI gate ordering
