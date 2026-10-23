# HEAVIX — STEP 15.68 Backfill Design (DESIGN ONLY — DO NOT EXECUTE)

**Status:** DESIGN ONLY — NOT YET IMPLEMENTED
**Date:** 2026-10-23
**Design doc reference:** `docs/phase3/RBAC-MIGRATION-DESIGN.md` §4

---

## 1. Purpose

The backfill script (`scripts/backfill-user-roles.ts`) will create missing `UserRole` rows for users who have a `User.role` value but no corresponding `UserRole` entry. This is Phase C of the RBAC migration.

**The dry-run script (`scripts/rbac-backfill-dryrun.ts`) identifies which users need backfill. The backfill script executes the actual writes.**

## 2. Idempotency Design

The backfill uses `db.userRole.upsert()` with the schema's existing `@@unique([userId, roleId])` constraint:

```typescript
await db.userRole.upsert({
  where: { userId_roleId: { userId: user.id, roleId: mappedRole.id } },
  create: { userId: user.id, roleId: mappedRole.id },
  update: {}, // no-op if already exists
});
```

- **First run**: Creates missing UserRole rows
- **Second run**: Finds existing rows, `update: {}` is a no-op
- **No duplicates possible**: The `@@unique` constraint is enforced by PostgreSQL at the DB level

## 3. Batch Processing with Checkpoints

```typescript
const BATCH_SIZE = 200; // per design doc §4.1
let cursor: string | null = null;
let totalCreated = 0;

while (true) {
  const users = await db.user.findMany({
    take: BATCH_SIZE,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    orderBy: { id: 'asc' },
    select: { id: true, role: true },
  });
  if (users.length === 0) break;
  cursor = users[users.length - 1].id;

  for (const user of users) {
    // ... classify and backfill
  }
  
  console.log(`Checkpoint: processed ${totalCreated} users, cursor=${cursor}`);
}
```

- **Checkpoint**: Each batch is independent. If the script crashes, restart re-runs from the beginning (idempotent — already-created rows are no-ops).
- **Resume**: No explicit resume needed — idempotency handles it.

## 4. Transaction Behavior

Each user's backfill is wrapped in a transaction:

```typescript
await db.$transaction(async (tx) => {
  // 1. Check if UserRole already exists for this (userId, roleId)
  // 2. If not, create it
  // 3. Log to audit table (if applicable)
});
```

- **Error handling**: If a single user fails, log the error and continue to the next user
- **No partial state**: Each user's backfill is atomic (single transaction)
- **Audit log**: Each creation should be logged (action: `user.role.backfill`)

## 5. Conflict Management

- **MISMATCH users**: DO NOT backfill — these have UserRole rows that don't match legacy role. Human decision needed.
- **MULTI_ROLE users**: DO NOT backfill — these already have the canonical role plus extras. No action needed.
- **INVALID users**: DO NOT backfill — unrecognized legacy role. Manual review needed.
- **MISSING users**: Safe to backfill — create the mapped UserRole row.
- **OK users**: No action needed — UserRole already matches.

## 6. Dry-Run vs Apply Mode

```typescript
const APPLY = process.env.BACKFILL_APPLY === 'true';
// Default: dry-run mode (read-only)
// Set BACKFILL_APPLY=true to actually write

if (APPLY) {
  await db.userRole.upsert({ ... });
} else {
  console.log(`[DRY-RUN] Would create UserRole for user ${user.id}`);
}
```

- **Dry-run mode** (default): Reads and reports, no writes
- **Apply mode** (`BACKFILL_APPLY=true`): Actually creates UserRole rows
- **Explicit flag**: No accidental writes — must explicitly set env var

## 7. Before/After Reporting

```typescript
// Before
const beforeCounts = {
  users: await db.user.count(),
  userRoles: await db.userRole.count(),
  orphans: await db.user.count({ where: { userRoles: { none: {} } } }),
};

// ... backfill ...

// After
const afterCounts = {
  users: await db.user.count(),
  userRoles: await db.userRole.count(),
  orphans: await db.user.count({ where: { userRoles: { none: {} } } }),
};

console.log('Before:', beforeCounts);
console.log('After:', afterCounts);
console.log('Created:', afterCounts.userRoles - beforeCounts.userRoles);
console.log('Orphans remaining:', afterCounts.orphans);
```

## 8. Stop Criteria

STOP the backfill if:
- Any unexpected error occurs (DB connection lost, constraint violation)
- The orphan count doesn't decrease as expected
- A user is classified as INVALID or MISMATCH during backfill (shouldn't happen if dry-run was run first)
- Manual stop signal received

## 9. Recovery and Rollback

### Rollback Option A: Targeted DELETE
```sql
DELETE FROM "UserRole"
WHERE id IN (
  SELECT ur.id FROM "UserRole" ur
  JOIN "AuditLog" al ON al.entityId = ur.userId AND al.action = 'user.role.backfill'
);
```
This deletes only the rows created by the backfill, preserving admin-granted roles.

### Rollback Option B: Database Backup Restore
Restore from a pre-backfill database backup.

### Rollback Option C: Leave in Place
If backfilled rows match `User.role` by construction (which they do), leaving them in place is harmless — they don't change authorization behavior (which is already RBAC-only).

## 10. Open Design Questions

1. **Should the backfill use the read-only role for verification?**
   - The backfill WRITES, so it can't use `heavix_dryrun_ro`
   - But a post-backfill verification run COULD use the read-only role to verify no unexpected changes

2. **Should the backfill run inside a single large transaction or per-user transactions?**
   - Per-user: safer (partial progress is valid), but slower
   - Single transaction: atomic (all-or-nothing), but may hit timeout on large datasets
   - **Recommendation**: Per-user transactions (current design) with batch-level checkpointing

3. **Should the backfill update `User.role` to match the canonical role?**
   - No — Phase B's dual-write already keeps `User.role` in sync
   - The backfill only adds missing `UserRole` rows, doesn't change `User.role`

4. **What about users created DURING the backfill?**
   - If a new user registers while backfill is running, they won't be in the current batch
   - The backfill is idempotent — re-running it will pick up new users
   - **Recommendation**: Run backfill in a maintenance window if possible
