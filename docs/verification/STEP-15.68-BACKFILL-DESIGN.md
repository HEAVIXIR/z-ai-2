# HEAVIX — STEP 15.68 — Actual Backfill Script Design

**Repository:** `HEAVIXIR/z-ai-2`
**Baseline merge commit:** `4f7a2d747777659290237b6fdb387269438141fc`
**Working branch:** `chore/step-15-68-phase-c-preflight`
**Governance:** DESIGN ONLY — DO NOT IMPLEMENT OR EXECUTE UNTIL OWNER AUTHORIZES
**Target script:** `scripts/backfill-user-roles.ts` (does NOT exist yet — this is the design)
**Date:** 2026-10-23

> ⚠️ **THIS IS A DESIGN DOCUMENT ONLY.**
> The actual backfill script is NOT implemented in STEP 15.68.
> Implementation requires separate owner authorization after staging dry-run proves safe.

---

## 1. Purpose

`scripts/backfill-user-roles.ts` will populate the `UserRole` join table from the legacy `User.role` column for users classified as `MISSING` by the dry-run. It will NOT touch users classified as `MISMATCH`, `MULTI_ROLE`, or `INVALID` — those require manual review per owner directive «نقش‌های مبهم را خودکار اصلاح نکن.».

---

## 2. Idempotency — Real, Constraint-Based

### 2.1 Database constraint (already exists)
- `prisma/schema.prisma` defines `@@unique([userId, roleId])` on the `UserRole` model.
- This means a user can have at most ONE UserRole row per role. Duplicate inserts are rejected by the DB.

### 2.2 Idempotent operation
- Use `db.userRole.upsert({ where: { userId_roleId: { userId, roleId } }, create: { userId, roleId }, update: {} })`.
- First run: creates the missing UserRole row.
- Second run: `update: {}` is a no-op (the row already exists, the unique constraint prevents duplicate creation).
- This is TRUE idempotency — backed by the DB constraint, not application logic.

### 2.3 Idempotency test (to be implemented with the script)
- Fixture: create a user with `role='BUYER'` and NO UserRole rows.
- Run backfill → verify 1 UserRole row created.
- Run backfill again → verify STILL 1 UserRole row (no duplicate).
- This test must run against a local/CI PostgreSQL, NOT staging/production.

---

## 3. Batch Processing + Checkpoint + Resume

### 3.1 Batch size
- `BATCH_SIZE = 200` (smaller than dry-run's 1000 — write operations have transactional cost).
- Each batch is a separate transaction.

### 3.2 Checkpoint
- After each batch, write the last processed `userId` to a checkpoint file (e.g., `/tmp/heavix-backfill-checkpoint.txt`).
- If the script crashes or is interrupted, it can resume from the checkpoint.
- Checkpoint file is deleted on successful completion.

### 3.3 Resume
- On startup, if the checkpoint file exists, prompt the operator (or auto-resume with `--resume` flag).
- Resume skips users with `userId <= checkpoint_last_userId`.

### 3.4 Open question: checkpoint storage
- Should the checkpoint be in `/tmp/` (ephemeral) or in a DB table (durable)?
- `/tmp/` is simpler but lost on machine restart.
- DB table is durable but adds a write (which must be idempotent too).
- **Recommendation:** start with `/tmp/` for simplicity; upgrade to DB table if production runs need durability across machine restarts.

---

## 4. Transaction Behavior + Error Handling

### 4.1 Per-batch transaction
- Each batch of `BATCH_SIZE` users is wrapped in `db.$transaction([...])`.
- If any upsert in the batch fails, the entire batch is rolled back.
- The script logs the failure, writes the checkpoint (so it can resume before the failed batch), and exits with code 2.

### 4.2 Error handling
- `P2002` (unique constraint violation): should NOT happen (upsert handles it). If it does, log + skip — the row already exists.
- `P2025` (record not found): the `Role` row for the mapped key doesn't exist. Log + skip — the user's `User.role` maps to a canonical key that's not in the catalog. This indicates a seed issue.
- `P1001` (connection lost): log + checkpoint + exit 2. Operator can resume after fixing the connection.
- Any other error: log + checkpoint + exit 2.

---

## 5. Conflict Management + Concurrent Changes

### 5.1 Dual-write (Phase B)
- During Phase B, the app writes to BOTH `User.role` and `UserRole` (dual-write).
- If the backfill runs while the app is writing, there's a race: the app might create a UserRole row for a user that the backfill is about to backfill.
- **Mitigation:** the `upsert` handles this — if the app creates the row first, the backfill's `upsert` is a no-op (`update: {}`).

### 5.2 Concurrent backfill runs
- Two backfill processes running simultaneously would be a bug.
- **Mitigation:** use a lock (e.g., `SELECT pg_advisory_lock(<key>)` at the start; `pg_advisory_unlock(<key>)` at the end). If the lock is held, exit with "another backfill is running".

### 5.3 Open question: should backfill run during dual-write?
- If the app is in Phase B (dual-write), the backfill is technically redundant for NEW users (they get UserRole rows automatically).
- BUT existing users (created before Phase B) still have `User.role` set and no UserRole row — these are the MISSING cases.
- **Recommendation:** backfill can run during Phase B. The `upsert` is safe against concurrent dual-write.

---

## 6. No Auto-Correction of MISMATCH / MULTI_ROLE / INVALID

### 6.1 MISMATCH
- User has UserRole rows but NONE match the mapped legacy role.
- This is ambiguous: was the user demoted (canonical wins) or promoted (legacy wins)?
- **The backfill script MUST NOT touch these users.** They require manual review.
- The script should log the count of MISMATCH users skipped.

### 6.2 MULTI_ROLE
- User has the canonical role + extra UserRole rows.
- Backfill is a no-op for these users (canonical already present).
- **The backfill script MUST NOT remove the extra UserRole rows.** They are legitimate (e.g., ADMIN+MODERATOR).
- The script should log the count of MULTI_ROLE users skipped.

### 6.3 INVALID
- User has a `User.role` value not in the catalog.
- **The backfill script MUST NOT touch these users.** They require manual review.
- The script should log the count of INVALID users skipped.

### 6.4 Owner directive
- «نقش‌های مبهم را خودکار اصلاح نکن.» (do NOT auto-correct ambiguous roles)
- This is a HARD constraint — no flag, no override, no "accept-risk" mode.

---

## 7. Dry-Run vs Apply Mode — Explicit Separation

### 7.1 Default mode: dry-run
- `bunx tsx scripts/backfill-user-roles.ts` → defaults to dry-run mode.
- Dry-run mode: prints what WOULD be done, creates NO rows.
- Exit code 0 regardless of classification counts (informational).

### 7.2 Apply mode
- `bunx tsx scripts/backfill-user-roles.ts --apply` → actually creates UserRole rows.
- Requires `--confirm-target=<db-name>` (same two-key pattern as the dry-run preflight).
- Requires interactive confirmation prompt: "You are about to backfill <N> users in <db-name>. Type 'yes' to proceed:"

### 7.3 Open question: should apply mode require a maintenance window?
- If the app is in Phase B (dual-write), apply mode is safe (upsert is concurrent-safe).
- If the app is NOT in Phase B (pre-migration), apply mode creates UserRole rows that the app doesn't read yet — harmless but pointless.
- **Recommendation:** apply mode should be allowed only after Phase B is merged (which it is, per PR #74). Document this in the runbook.

---

## 8. Before/After Report + Created Record Count

### 8.1 Before report
- Run the dry-run classification first.
- Capture: `OK`, `MISSING`, `MISMATCH`, `MULTI_ROLE`, `INVALID` counts.

### 8.2 Apply report
- After apply mode completes, print:
  - Total users processed
  - Users backfilled (MISSING → created UserRole row)
  - Users skipped (OK — already had UserRole)
  - Users skipped (MISMATCH — ambiguous, manual review)
  - Users skipped (MULTI_ROLE — informational)
  - Users skipped (INVALID — manual review)
  - Errors encountered (if any)

### 8.3 After report
- Run the dry-run classification again.
- Capture: `OK`, `MISSING`, `MISMATCH`, `MULTI_ROLE`, `INVALID` counts.
- Verify: `MISSING` count should be 0 (all backfilled).
- Verify: `MISMATCH`, `MULTI_ROLE`, `INVALID` counts should be UNCHANGED (not touched).

---

## 9. Stop Criteria + Recovery + Rollback

### 9.1 Stop criteria
- If any batch fails, the script checkpoints + exits 2.
- If `MISSING` count in the after-report is NOT 0, the backfill did not complete. Investigate.
- If `MISMATCH`/`MULTI_ROLE`/`INVALID` counts changed, the backfill touched users it shouldn't have. **FATAL** — investigate immediately.

### 9.2 Recovery
- Resume from checkpoint (Section 3.3).

### 9.3 Rollback
- The backfill CREATES UserRole rows. To rollback, DELETE the UserRole rows that were created by this backfill.
- **Rollback method:** the backfill should log the `userId` + `roleId` of each row it creates. To rollback, delete those specific rows.
- **Alternative:** if the backfill is the ONLY thing creating UserRole rows for MISSING users, a rollback is: `DELETE FROM "UserRole" WHERE userId IN (SELECT id FROM "User" WHERE ...)` — but this is dangerous if other processes create UserRole rows.
- **Recommendation:** log created rows to a rollback file (e.g., `/tmp/heavix-backfill-created-<timestamp>.csv`). Rollback script reads this file and deletes the specific rows.

---

## 10. Fixture + Idempotency Tests

### 10.1 Fixture
- Create test users with various `User.role` values: `ADMIN`, `SELLER`, `BUYER`, `MODERATOR`, `SUPPORT`, `SUPERADMIN` (alias), `""` (empty → BUYER), `"UNKNOWN"` (INVALID).
- Some users have UserRole rows (OK, MISMATCH, MULTI_ROLE); some don't (MISSING).

### 10.2 Idempotency test
1. Run backfill in apply mode → verify `MISSING` count drops to 0.
2. Run backfill in apply mode AGAIN → verify no new UserRole rows created (idempotent).
3. Verify `MISMATCH`, `MULTI_ROLE`, `INVALID` users are UNCHANGED.

### 10.3 No-mutation test for non-MISSING users
- Run backfill in apply mode.
- Verify that OK/MISMATCH/MULTI_ROLE/INVALID users have the SAME UserRole rows as before (no additions, no deletions).

---

## 11. No PII or Secret Logging

### 11.1 PII
- The backfill logs `userId` (UUID) and `roleId` (UUID) — no direct PII.
- Do NOT log `User.email`, `User.name`, or any other PII field.
- If the backfill needs to reference a user in logs, use the `userId` only.

### 11.2 Secrets
- Do NOT log `DATABASE_URL`, `DRYUN_RO_PW`, or any connection string.
- Use the same sanitization helpers as the dry-run preflight (Section A4 of the audit).

---

## 12. Open Questions (for owner decision)

| # | Question | Options | Recommendation |
|---|----------|---------|----------------|
| Q1 | Checkpoint storage: `/tmp/` (ephemeral) vs DB table (durable)? | `/tmp/` / DB table | Start with `/tmp/`; upgrade to DB table if production runs need durability |
| Q2 | Should apply mode require a maintenance window? | Yes (quiesce app) / No (safe during Phase B) | No — upsert is concurrent-safe during Phase B |
| Q3 | Should the backfill log created rows for rollback? | Yes (rollback file) / No (rely on dry-run diff) | Yes — explicit rollback file is safer |
| Q4 | Should apply mode require interactive confirmation? | Yes (prompt) / No (just `--apply` flag) | Yes — prevents accidental apply |
| Q5 | Should the backfill handle the `SUPERADMIN` → `ADMIN` alias? | Yes (mapLegacyRole handles it) / No (require explicit) | Yes — already handled by dry-run's `mapLegacyRole` |
| Q6 | What if a user's `User.role` is NULL (despite NOT NULL constraint)? | Map to BUYER (defensive) / Fail | Map to BUYER — defensive, matches dry-run behavior |

---

## Authorization Status

- **This design is NOT YET AUTHORIZED for implementation.**
- Implementation requires:
  1. Staging dry-run execution (STEP 15.68 runbook) — proves dry-run is safe
  2. Owner reviews staging dry-run results
  3. Owner explicitly authorizes backfill script implementation
  4. Backfill script implemented + tested (fixture + idempotency)
  5. Staging backfill execution
  6. Owner reviews staging backfill results
  7. Owner explicitly authorizes production backfill (SEPARATE gate)

- **PRODUCTION: NO-GO ❌** — this is a design document only.
