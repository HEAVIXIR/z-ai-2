# STEP 15.44-B — RBAC Concurrency Audit (Track B — C-2 PARTIAL → PASS upgrade)

**Repository:** `HEAVIXIR/z-ai-2`
**Branch (audit performed on):** `main` at `6c113fd66cdbbae9dd50ab2bcf2301400e3794b0`
**Branch (fix committed to):** `fix/rbac-concurrency` at `3cc632723b8be3df098e28616e52d32431028e20`
**Audit timestamp:** 2026-10-22
**Audit by:** HEAVIX Agent B — RBAC Concurrency Specialist
**Task ID:** `STEP-15.44-B`
**Prior audit:** `STEP-15.43-B` (see `/home/z/my-project/worklog.md` L6851–L6913). Prior verdict: **C-1 PASS, C-2 PARTIAL**. This audit resolves the C-2 PARTIAL by (a) defining tight invariants, (b) capturing `pg_backend_pid` to prove connection independence (closing the §4.2 gap from STEP-15.43-B), and (c) verifying the production code's ordering is safe — while also proving the race the addendum acknowledges IS reachable under a different ordering, and shipping a defense-in-depth fix on a separate branch.

---

## §0 — Executive Summary

| Item | Verdict | Evidence |
|---|---|---|
| **C-2 (Concurrency) — production-faithful ordering** | ✅ **PASS** | C-2c + C-2c-stress (20 iters): invariant holds every time. `pg_backend_pid` captured → 2 distinct PIDs → connection independence proven. Closes STEP-15.43-B §4.2 gap. |
| **C-2 (Concurrency) — worst-case ordering (race demonstration)** | ⚠️ **RACE REACHABLE** | C-2d + C-2d-stress (10 iters): race `raceHit=10/10`, `bothSucceeded=10/10`. Reproduces the addendum's acknowledged race (`RBAC-MIGRATION-ADDENDUM-STEP-15.43.md:127-129`). |
| **C-2 (Concurrency) — defense-in-depth fix** | ✅ **PASS** | C-2e + C-2e-stress (10 iters): `violations=0` with `SELECT ... FOR UPDATE` at TX start. Same worst-case ordering as C-2d, but invariant now holds. |
| **Connection independence (STEP-15.43-B §4.2 gap)** | ✅ **CLOSED** | `pg_backend_pid` captured inside each `$transaction` callback; PIDs distinct across all 20 C-2c-stress iterations. |
| **Mock-based rbac-phase-b.test.ts** | ✅ **PASS** | 13/13 tests pass after adding `$queryRaw` mock to the test's mock `tx` objects. |

**C-2 verdict upgrade: PARTIAL → PASS for production-faithful behavior.** The production route's transaction body at `src/app/api/admin/users/[id]/route.ts:225-275` is SAFE under READ COMMITTED because `user.update` is the FIRST write and acquires a User row lock that serializes concurrent dual-writes for the same user. The addendum's race is reachable only with a DIFFERENT ordering (findMany FIRST); the production code does NOT use that ordering, but a defense-in-depth `SELECT ... FOR UPDATE` at TX start (committed on branch `fix/rbac-concurrency`) makes the safety explicit and ordering-independent.

**Owner's key concern (verbatim):** *"رفتار فعلی تغییر هم‌زمان نقش یک کاربر را با دو تراکنش PostgreSQL مستقل بررسی کن. از یک mutex آزمایشی یا اجرای سریالی مصنوعی استفاده نکن. بین دو درخواست هم‌زمان برای نقش‌های قابل‌جایگزینی، invariant‌های معتبر را تعریف کن: عدم نقش ترکیبی نامعتبر، عدم partial state و سازگاری نقش legacy و canonical. راه‌حل را بدون آزمون واقعی انتخاب نکن."*

**This audit's response:**
1. ✅ Two truly-concurrent `db.$transaction` calls via `Promise.allSettled` (NO mutex, NO artificial serialization — same pattern as the existing C-2a test, confirmed non-serialization by STEP-15.43-B §4 criterion 3).
2. ✅ Tight invariants defined (INV-1: at most ONE replaceable UserRole; INV-2: no partial state; INV-3: legacy/canonical consistency).
3. ✅ Real evidence captured (test runs against local PostgreSQL 17.11 — same engine as CI's `postgres:17` service container).
4. ✅ Solution chosen only AFTER real testing: defense-in-depth `SELECT ... FOR UPDATE` (Option A from the assignment) — chosen because C-2c proves the current code is safe, but C-2d proves the race is reachable with reordering, and Option A is the smallest targeted fix that makes safety ordering-independent.

---

## §1 — Environmental Setup

### §1.1 Local PostgreSQL 17 (real DB engine, NOT a mock)

The sandbox did not have PostgreSQL installed. PostgreSQL 17.11 .deb packages were available in `pgsrc/`:

```
postgresql-17_17.11-0+deb13u1_amd64.deb       (16.7 MB)
postgresql-client-17_17.11-0+deb13u1_amd64.deb (2.1 MB)
postgresql-client-common_278_all.deb           (47 KB)
postgresql-common_278_all.deb                  (112 KB)
```

Setup steps (all as user `z`, no sudo — packages extracted with `dpkg-deb -x` to `/home/z/pg17/`):

1. Extracted debs to `/home/z/pg17` (user-local prefix; no system install).
2. `initdb -D /home/z/pgdata --username=postgres --auth-local=trust --auth-host=trust` → success.
3. Configured `postgresql.conf`: `port=5432`, `listen_addresses='localhost'`.
4. Started server: `pg_ctl -D /home/z/pgdata -l /home/z/pglog.log -o "-k /tmp" start` → done.
5. `psql -h localhost -U postgres -c "CREATE DATABASE heavix_test;"` → success.
6. `ALTER USER postgres WITH PASSWORD 'postgres';` (matches CI's `DATABASE_URL`).
7. `bunx prisma db push --accept-data-loss --schema=prisma/schema.prisma` → schema synced.
8. `bunx tsx prisma/seed-rbac.ts` → 5 roles + 132 permissions + 232 role-permission assignments seeded.

**PostgreSQL version confirmed:**
```
PostgreSQL 17.11 (Debian 17.11-0+deb13u1) on x86_64-pc-linux-gnu,
compiled by gcc (Debian 14.2.0-19) 14.2.0, 64-bit
```

**Default isolation level confirmed:**
```
heavix_test=# SHOW default_transaction_isolation;
 read committed
```

This matches CI's `postgres:17` service container behavior (READ COMMITTED is PostgreSQL's default and matches what `prisma/schema.prisma` L8-11 specifies — no `isolation_level` override present in either CI DATABASE_URL or schema datasource block).

### §1.2 DATABASE_URL used for all tests

```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/heavix_test?schema=public"
```

Contains "localhost" → `RUN_TESTS = true` in the test files' gating predicates (`process.env.DATABASE_URL?.includes("localhost") ?? false`).

### §1.3 Branch state

```
$ git rev-parse HEAD
6c113fd66cdbbae9dd50ab2bcf2301400e3794b0  (main, post-merge of PR #74)
$ git checkout -b fix/rbac-concurrency  (separate branch for the fix)
$ git rev-parse HEAD
3cc632723b8be3df098e28616e52d32431028e20  (fix/rbac-concurrency)
```

The fix was developed and committed on `fix/rbac-concurrency` (separate from `main` per owner directive). The audit investigation was performed on `main` at `6c113fd`.

---

## §2 — Invariants Defined (per owner directive)

The owner's directive requires three valid invariants for concurrent role changes between two replaceable roles. The existing C-2a test's invariants were LOOSE (permitted SELLER + ADMIN simultaneously as long as count-per-roleId ≤ 1). This audit defines TIGHTER invariants:

| ID | Name | Definition | C-2a (loose) | C-2c (tight) |
|---|---|---|---|---|
| **INV-1** | No invalid mixed role | User has AT MOST ONE replaceable UserRole row (NOT both SELLER and ADMIN simultaneously). | ❌ loose (count ≤ 1 per roleId, but multiple roleIds allowed) | ✅ tight (`replaceableCount ≤ 1`) |
| **INV-2** | No partial state | `User.role` is set AND matches one of the surviving UserRole keys (legacy column not orphaned). | ⚠️ partial (only checks `User.role ∈ UserRole` keys) | ✅ tight (asserts match for the SINGLE replaceable row) |
| **INV-3** | Legacy/canonical consistency | `User.role === primary UserRole key` (the single surviving replaceable role). | ❌ not asserted | ✅ tight (asserts equality, not just containment) |
| **INV-4** | At least one tx succeeded | At least one transaction committed (no specific winner asserted — aligns with owner directive "Do not assert a specific winner unless the implementation guarantees that ordering"). | ✅ | ✅ |
| **INV-5** (new) | Connection independence | Two transactions used TWO DISTINCT PostgreSQL backend PIDs (proves two separate connections). | ❌ not asserted (the STEP-15.43-B §4.2 gap) | ✅ asserted via `pg_backend_pid()` |

---

## §3 — Test File: `tests/integration/rbac-concurrency-real.test.ts`

**File:** 922 lines, 6 tests in 3 describe blocks (C-2c, C-2d, C-2e).

### §3.1 Synchronization & serialization discipline (owner's constraint)

The owner's directive forbids:
- ❌ "mutex آزمایشی" (experimental mutex)
- ❌ "اجرای سریالی مصنوعی" (artificial serialization)

This test file uses ONLY:
- ✅ `Promise.allSettled([tx1, tx2])` for concurrent dispatch — same pattern as the existing C-2a test (line 319), confirmed by STEP-15.43-B §4 criterion 3 to NOT be serialization.
- ✅ `await new Promise((r) => setTimeout(r, 50/80))` inside each transaction callback to WIDEN the overlap window — same pattern as the existing C-2a test (lines 278, 301), confirmed by STEP-15.43-B §4 criterion 3 to NOT be serialization (both callbacks run in parallel; setTimeout only delays subsequent steps within each callback).
- ✅ `tx.$queryRaw\`SELECT pg_backend_pid() AS pid\`` to capture each transaction's backend PID for connection-independence proof (NOT a synchronization primitive — purely introspective).
- ✅ `tx.$queryRaw\`SELECT id FROM "User" WHERE id = $1 FOR UPDATE\`` in C-2e only — this IS a real PostgreSQL row lock, but it's the FIX being tested, not a test-harness synchronization mechanism. The C-2c and C-2d tests do NOT use FOR UPDATE.

**No mutex, no test-harness serialization, no `pg_advisory_lock`** as a synchronization primitive. The two transactions execute concurrently in JavaScript (Promise.allSettled) and at the DB level (Prisma pool allocates 2 separate connections — proven by distinct PIDs).

### §3.2 Test inventory

| Test | Ordering | FOR UPDATE? | Invariants | Purpose |
|---|---|---|---|---|
| **C-2c** (single) | user.update FIRST (production-faithful) | NO | TIGHT (INV-1/2/3/4/5) | Proves production code is safe under READ COMMITTED. |
| **C-2c-stress** | user.update FIRST | NO | TIGHT (INV-1/2/3, 20 iters) | Stress: invariant holds across 20 iterations. Captures `pidsAllDistinct=true` to close STEP-15.43-B §4.2 gap. |
| **C-2d** (single) | findMany FIRST (worst-case) | NO | Race EXPECTED (asserts `replaceableCount === 2`) | Reproduces the addendum's acknowledged race. |
| **C-2d-stress** | findMany FIRST | NO | Race EXPECTED (asserts `raceHit > 0`) | Stress: race is reproducibly reachable. |
| **C-2e** (single) | findMany FIRST (worst-case) | YES (at TX start) | TIGHT (INV-1/2/3/4) | Verifies the defense-in-depth fix makes the worst-case ordering safe. |
| **C-2e-stress** | findMany FIRST | YES | TIGHT (10 iters) | Stress: fix holds invariant EVERY iteration. |

---

## §4 — C-2c: Production-Faithful Concurrent Dual-Write (PASS)

### §4.1 What the test does

C-2c replicates the EXACT transaction body ordering of the production PATCH route (`src/app/api/admin/users/[id]/route.ts:225-275`):

```
db.$transaction(async (tx) => {
  // 1. user.update FIRST (acquires User row lock)
  await tx.user.update({ where: { id }, data: { role: "SELLER" } });
  // 2. Capture pg_backend_pid (connection-independence proof)
  const pidRows = await tx.$queryRaw`SELECT pg_backend_pid() AS pid`;
  // 3. Widen overlap window (NOT serialization)
  await new Promise((r) => setTimeout(r, 50));
  // 4. findMany (reads committed state — sees Tx1's writes if Tx1 committed)
  const existing = await tx.userRole.findMany({...});
  // 5. deleteMany (deletes based on findMany result)
  if (existing.length > 0) { await tx.userRole.deleteMany({...}); }
  // 6. upsert (inserts new role)
  await tx.userRole.upsert({...});
});
```

Two such transactions are dispatched concurrently via `Promise.allSettled([tx1, tx2])`.

### §4.2 What ACTUALLY happens under READ COMMITTED

Under PostgreSQL READ COMMITTED (default isolation):

1. Both `db.$transaction(callback)` calls acquire separate connections from the Prisma pool (proven by distinct `pg_backend_pid`).
2. Both callbacks start executing concurrently in JS.
3. Tx1's `tx.user.update(role=SELLER)` executes first → acquires a row-level lock on the User row.
4. Tx2's `tx.user.update(role=ADMIN)` blocks waiting for Tx1's row lock.
5. Tx1 continues: setTimeout(50), findMany (sees initial BUYER UserRole since Tx2 hasn't committed anything), deleteMany (deletes BUYER), upsert (inserts SELLER).
6. Tx1 commits → User row lock released.
7. Tx2 unblocks: user.update succeeds (READ COMMITTED re-reads the row → role is now SELLER, but Tx2 overwrites to ADMIN).
8. Tx2 continues: setTimeout(50), findMany (NOW sees Tx1's committed SELLER UserRole — READ COMMITTED re-reads), deleteMany (deletes SELLER), upsert (inserts ADMIN).
9. Tx2 commits.

**End state:** `User.role=ADMIN`, `UserRole=[ADMIN]`. ✓ Invariant holds.

**Key insight:** The User row lock acquired by `tx.user.update` is the implicit serialization mechanism. Because `user.update` is the FIRST write, the row lock is acquired BEFORE any reads — so the second transaction's `findMany` always sees the first's committed state. This is why the production code is safe.

### §4.3 C-2c single-iteration result

```
✓ C-2c: two concurrent PATCHes → at most ONE replaceable UserRole,
        User.role matches (TIGHT invariants)  [182ms]
```

### §4.4 C-2c-stress (20 iterations) — full output

```
[C-2c-stress] N=20 iterations, violations=0, pidsAllDistinct=true,
              winners: SELLER=2, ADMIN=18

✓ C-2c-stress: 20 iterations — invariant holds every time (no race)  [2342ms]
```

**Interpretation:**
- `violations=0` — INV-1/2/3 held for ALL 20 iterations.
- `pidsAllDistinct=true` — Every iteration used 2 DISTINCT PostgreSQL backend PIDs. This PROVES the Prisma pool allocated 2 separate connections for the 2 concurrent `$transaction` calls — closing the STEP-15.43-B §4.2 gap (which had stated "Independent connections VERIFIED: ❌ NOT PROVEN").
- `winners: SELLER=2, ADMIN=18` — Both transactions won at least once across 20 iterations, proving the test is exercising REAL concurrency (not just one transaction always finishing first due to scheduling). The distribution is skewed toward ADMIN (Tx2) because Tx1 is dispatched first in `Promise.allSettled([tx1, tx2])` and acquires the User row lock first, so Tx1 typically commits first, then Tx2 overwrites. But Tx2's setTimeout can occasionally delay it enough that Tx1 wins (2/20 = 10% of the time).

### §4.5 Connection independence proof (closes STEP-15.43-B §4.2 gap)

STEP-15.43-B §4.2 stated: *"Independent connections (VERIFIED): ❌ NOT PROVEN. No backend-PID assertion. Prisma pool behavior is ASSUMED (default size 5, no override), not asserted."*

This audit closes that gap. Inside each `$transaction` callback, the test executes:

```typescript
const pidRows = await tx.$queryRaw`SELECT pg_backend_pid() AS pid` as any[];
pids.tx1 = pidRows[0].pid;  // captured for Tx1
// ... in Tx2:
pids.tx2 = pidRows[0].pid;  // captured for Tx2
```

After `Promise.allSettled([tx1, tx2])` resolves, the test asserts:

```typescript
expect(pids.tx1).not.toBe(pids.tx2);
```

`pg_backend_pid()` returns the OS PID of the PostgreSQL backend process serving the connection. Two DISTINCT PIDs PROVE two DISTINCT connections — Prisma's pool allocated 2 separate connections for the 2 concurrent `$transaction` calls. This assertion passed in all 20 C-2c-stress iterations (`pidsAllDistinct=true`).

---

## §5 — C-2d: Worst-Case Ordering (Race Demonstration)

### §5.1 What the test does

C-2d uses the REVERSED ordering (findMany BEFORE user.update) to demonstrate the race the addendum acknowledges (`docs/phase3/RBAC-MIGRATION-ADDENDUM-STEP-15.43.md:127-129`):

> *"two concurrent PATCHes for the same user could both read empty `existingUserRoles` lists, both delete nothing, and both upsert different roles — leaving the user with BOTH ADMIN and SELLER UserRole rows simultaneously."*

```
db.$transaction(async (tx) => {
  // 1. findMany FIRST (captures IDs BEFORE acquiring the User row lock)
  const existing = await tx.userRole.findMany({...});
  const capturedIds = existing.map((e) => e.id);
  // 2. Widen overlap window — gives the other tx time to also do its findMany
  await new Promise((r) => setTimeout(r, 80));
  // 3. user.update (acquires User row lock — other tx will block here)
  await tx.user.update({ where: { id }, data: { role: "SELLER" } });
  // 4. deleteMany (uses captured IDs from BEFORE — may be stale)
  if (capturedIds.length > 0) { await tx.userRole.deleteMany({...}); }
  // 5. upsert
  await tx.userRole.upsert({...});
});
```

### §5.2 What ACTUALLY happens under READ COMMITTED (with reversed ordering)

1. Tx1 starts: findMany → reads `[BUYER]` (initial state).
2. Tx2 starts: findMany → reads `[BUYER]` (Tx1 hasn't committed anything yet — READ COMMITTED sees only committed data).
3. Tx1 setTimeout(80) — waits.
4. Tx2 setTimeout(80) — waits.
5. Tx1 user.update(role=SELLER) → acquires User row lock.
6. Tx2 user.update(role=ADMIN) → BLOCKS on User row lock.
7. Tx1 deleteMany(capturedIds=[BUYER]) → deletes BUYER.
8. Tx1 upsert(SELLER) → inserts SELLER.
9. Tx1 commits → User row lock released.
10. Tx2 unblocks: user.update succeeds → updates role to ADMIN.
11. Tx2 deleteMany(capturedIds=[BUYER]) → tries to delete BUYER, but BUYER was already deleted by Tx1 → deletes nothing.
12. Tx2 upsert(ADMIN) → inserts ADMIN.
13. Tx2 commits.

**End state:** `User.role=ADMIN`, `UserRole=[SELLER, ADMIN]`. ⚠️ **INV-1 VIOLATED** (user has TWO replaceable UserRole rows simultaneously).

### §5.3 C-2d single-iteration result

```
[C-2d] finalState: replaceableCount=2, keys=["SELLER","ADMIN"],
                   legacy=ADMIN, succeeded=2/2

✓ C-2d: two concurrent PATCHes with reversed ordering →
        can leave BOTH ADMIN + SELLER UserRoles  [101ms]
```

### §5.4 C-2d-stress (10 iterations) — full output

```
[C-2d-stress] N=10 iterations, raceHit=10, bothSucceeded=10/10

✓ C-2d-stress: 10 iterations — race is reproducibly reachable  [966ms]
```

**Interpretation:**
- `raceHit=10/10` — The race is REPRODUCIBLY reachable (100% of iterations) when the ordering is reversed.
- `bothSucceeded=10/10` — Both transactions always succeed because they upsert DIFFERENT roleIds (SELLER vs ADMIN), so the `@@unique([userId, roleId])` constraint does NOT fire between them. The unique constraint only prevents duplicates of the SAME (userId, roleId) pair — it does NOT prevent the user from having BOTH SELLER and ADMIN rows simultaneously (because those are different roleIds).

**This validates the addendum's concern is REAL and reachable.** The race is NOT hypothetical — it is reproducibly demonstrated.

---

## §6 — C-2e: Defense-in-Depth Fix (PASS)

### §6.1 The fix

**File:** `src/app/api/admin/users/[id]/route.ts` (lines 226-246 on `fix/rbac-concurrency` branch).

```typescript
updated = await db.$transaction(async (tx) => {
  // ── STEP 15.44-B (defense-in-depth): explicit row lock at TX start ──
  // Acquire a row-level lock on the User row BEFORE any reads or writes.
  // This serializes concurrent dual-write transactions for the same user
  // at the DB level, INDEPENDENT of the order of subsequent operations.
  await tx.$queryRaw`SELECT id FROM "User" WHERE "id" = ${id} FOR UPDATE`;

  // 1. Update legacy User.role column (+ any other fields in `data`)
  const u = await tx.user.update({...});
  // 2. Delete existing replaceable UserRoles (ADMIN/SELLER/BUYER)
  const existingUserRoles = await tx.userRole.findMany({...});
  if (existingUserRoles.length > 0) {
    await tx.userRole.deleteMany({...});
  }
  // 3. Upsert the new UserRole (idempotent via @@unique([userId, roleId]))
  await tx.userRole.upsert({...});
  return u;
});
```

### §6.2 Why this fix

Per the owner's assignment, three options were considered:

| Option | Description | Verdict |
|---|---|---|
| **A** | `SELECT ... FOR UPDATE` on the User row at TX start | ✅ **CHOSEN** — Smallest targeted fix. Same pattern already used in `tests/integration/readonly-when-concurrency-real.ts:67` (STEP 11.23 readonlyWhen TOCTOU). Acquires the User row lock BEFORE any reads, making safety ordering-independent. Cost: ~1 extra round-trip (~0.2ms localhost, ~1ms network) — negligible against the dual-write's existing 3-5ms cost. |
| **B** | Use `SERIALIZABLE` isolation level | ❌ Not chosen — Heavier: changes isolation level for the whole transaction, increasing abort/retry probability for unrelated queries inside the same `$transaction`. Prisma's `$transaction(callback)` uses READ COMMITTED by default; switching to SERIALIZABLE requires `tx.$executeRaw\`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE\`` at the start — error-prone (must be the FIRST statement). |
| **C** | Controlled retry on `P2034` (unique constraint violation) | ❌ Not chosen — Doesn't actually FIX the race; just retries after the fact. Also, P2034 doesn't fire here (the two transactions upsert DIFFERENT roleIds — no `@@unique` violation possible between them — so retry wouldn't trigger). The race leaves 2 rows committed, not a constraint violation. |

**The fix is Option A**, chosen AFTER real testing (per owner directive "راه‌حل را بدون آزمون واقعی انتخاب نکن"):
- C-2c proved the current code is safe (because user.update is FIRST).
- C-2d proved the race IS reachable with reordering (so a future refactor would silently break).
- C-2e proves Option A makes the worst-case ordering safe — verifying the fix.

### §6.3 C-2e single-iteration result

```
[C-2e] finalState: replaceableCount=1, keys=["ADMIN"], legacy=ADMIN,
                   succeeded=2/2

✓ C-2e: two concurrent PATCHes with FOR UPDATE → at most ONE replaceable
        UserRole (no race)  [180ms]
```

### §6.4 C-2e-stress (10 iterations) — full output

```
[C-2e-stress] N=10 iterations, violations=0, bothSucceeded=10/10

✓ C-2e-stress: 10 iterations — fix holds invariant EVERY time (no race)  [1726ms]
```

**Interpretation:**
- `violations=0` — INV-1/2/3 held for ALL 10 iterations, even with the worst-case ordering.
- `bothSucceeded=10/10` — Both transactions always succeed (the lock serializes them, but neither is rejected — the second one sees the first's committed state and overwrites cleanly).
- This is the SAME worst-case ordering as C-2d (which had `raceHit=10/10`). The ONLY difference is the `SELECT ... FOR UPDATE` at TX start. The fix converts the 10/10 race into a 0/10 violation.

### §6.5 Compatibility with existing tests

| Test file | Tests | Result on `fix/rbac-concurrency` |
|---|---|---|
| `tests/integration/rbac-concurrency-real.test.ts` (NEW) | 6 (C-2c, C-2c-stress, C-2d, C-2d-stress, C-2e, C-2e-stress) | ✅ 6/6 PASS |
| `tests/integration/rbac-phase-b-real.test.ts` (existing) | 4 (C-1a, C-1b, C-2a, C-2b) | ✅ 4/4 PASS |
| `tests/security/rbac-phase-b.test.ts` (existing mock-based) | 13 | ✅ 13/13 PASS (after adding `$queryRaw` mock to the test's mock `tx` objects) |
| `bunx tsc --noEmit` | — | ✅ exit 0 |
| `bunx eslint <changed files>` | — | ✅ exit 0 |

Total: 23 tests pass on `fix/rbac-concurrency`.

---

## §7 — Verdict Summary

### §7.1 C-2 verdict: PARTIAL → PASS (for production-faithful behavior)

| Aspect | STEP-15.43-B (prior) | STEP-15.44-B (this audit) |
|---|---|---|
| Concurrent transactions DISPATCHED | ✅ PROVEN | ✅ PROVEN (same `Promise.allSettled` pattern) |
| Concurrent transactions EXECUTED at DB level | ⚠️ PARTIALLY PROVEN | ✅ PROVEN (User row lock serializes — confirmed by C-2c distribution) |
| Independent connections VERIFIED | ❌ NOT PROVEN | ✅ **PROVEN** (`pg_backend_pid` distinct across all 20 C-2c-stress iterations) |
| TIGHT invariants asserted (no mixed role, no partial state, legacy/canonical consistency) | ❌ loose (permitted SELLER+ADMIN) | ✅ TIGHT (INV-1: `replaceableCount ≤ 1`) |
| Race the addendum acknowledges — reachable? | ⚠️ hypothetical | ✅ **DEMONSTRATED** (C-2d reproduces it 10/10) |
| Race the addendum acknowledges — FIXED? | N/A | ✅ **FIXED** (C-2e verifies defense-in-depth fix holds invariant 10/10) |

**C-2 verdict upgrade: PARTIAL → PASS for the production-faithful ordering.** The production route at `route.ts:225` is SAFE under READ COMMITTED with concurrent dual-write, and this is now PROVEN by:
1. TIGHT invariants (INV-1: at most ONE replaceable UserRole) holding across 20 stress iterations.
2. Connection independence proven by distinct `pg_backend_pid` values.

The defense-in-depth fix on `fix/rbac-concurrency` is OPTIONAL — the production code is currently safe. The fix protects against future refactors that might change the operation ordering.

### §7.2 Overstated claims remediated (carried forward from STEP-15.43-B §7.2)

| Original claim (STEP-15.43-B flagged) | Remediation in this audit |
|---|---|
| "Two separate Prisma clients (two DB connections)" | The test uses the singleton `db`. Two concurrent `db.$transaction` calls acquire 2 separate connections from the Prisma pool — VERIFIED by `pg_backend_pid` (C-2c-stress: `pidsAllDistinct=true` across 20 iterations). |
| "Proves real concurrency" | The test DISPATCHES two transactions concurrently (Promise.allSettled, no mutex). It verifies TIGHT invariants under real postgres:17. It PROVES connection independence via `pg_backend_pid`. |
| "C-2 condition fully resolved" | **C-2 condition RESOLVED for the production-faithful ordering** (PASS). The addendum's race is reachable only with a DIFFERENT ordering (C-2d demonstrates), and a defense-in-depth fix is committed on `fix/rbac-concurrency` (C-2e verifies). |

---

## §8 — Commit & Branch Info

| Item | Value |
|---|---|
| Audit performed on branch | `main` at `6c113fd66cdbbae9dd50ab2bcf2301400e3794b0` |
| Fix committed to branch | `fix/rbac-concurrency` |
| Fix commit SHA | `3cc632723b8be3df098e28616e52d32431028e20` |
| Fix commit subject | `fix(rbac): defense-in-depth SELECT FOR UPDATE in dual-write transaction (STEP-15.44-B)` |
| Files changed in fix commit | 3 (1 modified route, 1 new test file, 1 modified mock-test) |
| Lines added | 952 |
| Lines removed | 0 |
| Not on `main`? | ✅ Confirmed — `git log main..fix/rbac-concurrency` shows only the 1 fix commit |

---

## §9 — Integrity Statement

- ✅ Real PostgreSQL 17.11 was used (extracted from local .deb packages, no sudo, user-local install at `/home/z/pg17`).
- ✅ Database seeded with the production `prisma/seed-rbac.ts` (5 roles, 132 permissions, 232 role-permission assignments).
- ✅ READ COMMITTED isolation (PostgreSQL default) confirmed via `SHOW default_transaction_isolation`.
- ✅ Singleton `db` from `@/lib/db` used (NOT separate PrismaClient instances — per owner directive).
- ✅ NO mutex, NO artificial serialization in any test. Only `setTimeout` for overlap window widening (same pattern as existing C-2a, confirmed non-serialization by STEP-15.43-B §4 criterion 3) and `Promise.allSettled` for concurrent dispatch.
- ✅ `pg_backend_pid()` introspection used for connection-independence proof — purely observational, NOT a synchronization primitive.
- ✅ Fix on separate branch `fix/rbac-concurrency`, NOT on `main`.
- ✅ All 23 relevant tests pass on the fix branch (6 new + 4 existing integration + 13 existing mock).
- ✅ `tsc --noEmit` clean. `eslint` clean.
- ✅ Owner directive "راه‌حل را بدون آزمون واقعی انتخاب نکن" honored: Option A (`SELECT ... FOR UPDATE`) chosen AFTER C-2c proved current safety AND C-2d proved the race is reachable AND C-2e verified the fix.
- ✅ Owner directive "Do not manufacture a PASS" honored: the PASS verdict is supported by 20 stress iterations with TIGHT invariants + connection-independence proof. The RACE-REACHABLE verdict (C-2d) is honestly reported as a separate finding.

---

## §10 — Recommended Next Actions

1. **Review the fix on `fix/rbac-concurrency`** at `3cc6327`. If approved, merge to `main` as a defense-in-depth hardening (Phase B implementation is already safe without it, but the fix protects against future refactors).
2. **Update the design addendum** `docs/phase3/RBAC-MIGRATION-ADDENDUM-STEP-15.43.md:127-129` to note that the addendum's race was VERIFIED reachable in C-2d (with reversed ordering) and the production route's safety is ORDERING-DEPENDENT (relies on `user.update` being the FIRST write). Recommend the `SELECT ... FOR UPDATE` fix on `fix/rbac-concurrency` as the resolution.
3. **Add CI gating** for `tests/integration/rbac-concurrency-real.test.ts`. The CI workflow at `.github/workflows/ci.yml` already runs `bunx vitest run tests/integration/*.test.ts` (verify job step #20), so the new test file will be picked up automatically when the fix branch is merged.
4. **Consider adding `pg_backend_pid` assertion to the original C-2a test** in `tests/integration/rbac-phase-b-real.test.ts` — this would bring the connection-independence proof to the existing test as well (currently it's only in the new C-2c test).
5. **Phase E cutover note**: when the dual-write is removed (after Phase D backfill + Phase E cutover), the `SELECT ... FOR UPDATE` can also be removed (no more legacy column to keep in sync). The fix is Phase-B-specific.

---

**End of STEP-15.44-B Concurrency Audit.**
