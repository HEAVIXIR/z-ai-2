import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { execSync } from "node:child_process";
import { db } from "@/lib/db";

/* ============================================================
   HEAVIX — STEP 15.44 — REAL PostgreSQL Concurrency Audit (Track B)
   ------------------------------------------------------------
   Owner directive (Task STEP-15.44-B):
   "رفتار فعلی تغییر هم‌زمان نقش یک کاربر را با دو تراکنش PostgreSQL
    مستقل بررسی کن. از یک mutex آزمایشی یا اجرای سریالی مصنوعی استفاده نکن."

   (Investigate the current behavior of concurrent role changes for a
    single user via two INDEPENDENT PostgreSQL transactions. Do NOT use
    a mutex or artificial serialization.)

   This file does TWO things:

   (1) C-2c — production-faithful concurrent dual-write with TIGHT
       invariants. Replicates the EXACT transaction body ordering of
       src/app/api/admin/users/[id]/route.ts:225-254 (user.update
       FIRST → findMany → deleteMany → upsert). Captures pg_backend_pid
       inside each transaction to PROVE connection independence
       (closes the C-2 PARTIAL gap from STEP-15.43-B §4.2).

   (2) C-2d — worst-case ordering (findMany BEFORE user.update).
       Reproduces the race the design addendum acknowledges: "two
       concurrent PATCHes for the same user could both read empty
       existingUserRoles lists ... leaving the user with BOTH ADMIN
       and SELLER UserRole rows simultaneously" (RBAC-MIGRATION-
       ADDENDUM-STEP-15.43.md:127-129). This test DEMONSTRATES that
       the race IS reachable with a different ordering — validating
       the addendum's concern and motivating why the production
       route's ordering (user.update first) is the protection.

   INVARIANTS (per owner directive — "invariant‌های معتبر"):
     INV-1 (NO invalid mixed role): user has AT MOST ONE replaceable
            UserRole row (NOT both SELLER and ADMIN simultaneously).
     INV-2 (NO partial state): User.role is set AND matches one of
            the surviving UserRole rows (i.e., the legacy column is
            not orphaned from the canonical set).
     INV-3 (Legacy/canonical consistency): User.role === primary
            UserRole key (the single surviving replaceable role).

   These invariants are STRICTER than the C-2a test's loose invariants
   (which permit SELLER+ADMIN as long as count per roleId ≤ 1).

   NO mutex. NO artificial serialization. The only timing aids are:
     - setTimeout(50ms) inside each tx callback to WIDEN the overlap
       window (the SAME pattern as the existing C-2a test, confirmed
       by STEP-15.43-B §4 criterion 3 to NOT be serialization).
     - Promise.allSettled([tx1, tx2]) for concurrent dispatch
       (the SAME pattern as the existing C-2a test, line 319).
   ============================================================ */

const RUN_TESTS = process.env.DATABASE_URL?.includes("localhost") ?? false;

describe.skipIf(!RUN_TESTS)(
  "STEP 15.44 — REAL PostgreSQL Concurrency Audit (Track B — C-2c + C-2d)",
  () => {
    beforeAll(async () => {
      // Ensure schema is pushed (CI does this in workflow, but be safe)
      execSync("bunx prisma db push --accept-data-loss --schema=prisma/schema.prisma", {
        encoding: "utf-8",
        timeout: 60000,
        env: { ...process.env },
      });
    });

    beforeEach(async () => {
      // Clean up any test users/roles left from prior runs.
      const testUsers = await db.user.findMany({
        where: { email: { startsWith: "rbac-phaseb-conc-test-" } },
        select: { id: true },
      });
      for (const u of testUsers) {
        await db.userRole.deleteMany({ where: { userId: u.id } });
      }
      await db.user.deleteMany({
        where: { email: { startsWith: "rbac-phaseb-conc-test-" } },
      });
    });

    // ── Helper: snapshot of the user's role state ──
    async function snapshotState(userId: string) {
      const user = await db.user.findUnique({
        where: { id: userId },
        select: { role: true },
      });
      const userRoles = await db.userRole.findMany({
        where: { userId, role: { key: { in: ["ADMIN", "SELLER", "BUYER"] } } },
        select: { id: true, role: { select: { key: true } } },
      });
      return {
        legacyRole: user?.role ?? null,
        replaceableRoleKeys: userRoles.map((ur) => ur.role.key),
        replaceableCount: userRoles.length,
      };
    }

    /* ============================================================
       C-2c: PRODUCTION-FAITHFUL concurrent dual-write
       ------------------------------------------------------------
       This test replicates the EXACT transaction body ordering of the
       production PATCH /api/admin/users/[id] route (route.ts:225-254):

         tx.user.update         (acquires User row lock — FIRST)
         setTimeout(50ms)       (widens overlap window — NOT serialization)
         tx.userRole.findMany   (reads committed state)
         tx.userRole.deleteMany (deletes based on findMany result)
         tx.userRole.upsert     (inserts new role)

       Under READ COMMITTED:
         - The user.update acquires a row lock on the User row.
         - The SECOND transaction's user.update BLOCKS until the FIRST
           commits (PostgreSQL row-level lock).
         - When the SECOND unblocks, READ COMMITTED re-reads the row,
           so its subsequent findMany sees the FIRST's committed
           UserRole writes → its deleteMany removes them.
         - Result: the row lock serializes the conflicting writes.
       ============================================================ */
    describe("C-2c: production-faithful concurrent dual-write (user.update FIRST)", () => {
      it("two concurrent PATCHes → at most ONE replaceable UserRole, User.role matches (TIGHT invariants)", async () => {
        const buyerRole = await db.role.findUnique({
          where: { key: "BUYER" },
          select: { id: true },
        });
        const sellerRole = await db.role.findUnique({
          where: { key: "SELLER" },
          select: { id: true },
        });
        const adminRole = await db.role.findUnique({
          where: { key: "ADMIN" },
          select: { id: true },
        });
        expect(buyerRole && sellerRole && adminRole).toBeTruthy();

        const user = await db.user.create({
          data: {
            firstName: "Conc",
            lastName: "Faithful",
            email: "rbac-phaseb-conc-test-faithful@example.com",
            mobile: "9990000010",
            passwordHash: "hash",
            role: "BUYER",
            status: "ACTIVE",
            emailVerified: true,
          },
        });
        await db.userRole.create({
          data: { userId: user.id, roleId: buyerRole!.id },
        });

        // Capture initial state for post-hoc verification
        const initial = await snapshotState(user.id);
        expect(initial.replaceableCount).toBe(1);
        expect(initial.legacyRole).toBe("BUYER");

        // PIDs captured inside each transaction (closes STEP-15.43-B §4.2 gap)
        const pids: { tx1?: bigint; tx2?: bigint } = {};

        // ── Tx1: change role to SELLER (production-faithful ordering) ──
        const tx1 = db.$transaction(async (tx) => {
          // 1. user.update FIRST (acquires User row lock — production route.ts:227)
          await tx.user.update({
            where: { id: user.id },
            data: { role: "SELLER" },
          });
          // Capture backend PID for connection-independence proof
          const pidRows = await tx.$queryRaw`SELECT pg_backend_pid() AS pid` as any[];
          pids.tx1 = pidRows[0].pid;
          // 2. Widen overlap window (NOT serialization — same pattern as C-2a L278)
          await new Promise((r) => setTimeout(r, 50));
          // 3. findMany (production route.ts:236)
          const existing = await tx.userRole.findMany({
            where: { userId: user.id, role: { key: { in: ["ADMIN", "SELLER", "BUYER"] } } },
            select: { id: true },
          });
          // 4. deleteMany (production route.ts:241)
          if (existing.length > 0) {
            await tx.userRole.deleteMany({
              where: { id: { in: existing.map((e) => e.id) } },
            });
          }
          // 5. upsert (production route.ts:247)
          await tx.userRole.upsert({
            where: { userId_roleId: { userId: user.id, roleId: sellerRole!.id } },
            create: { userId: user.id, roleId: sellerRole!.id },
            update: {},
          });
        });

        // ── Tx2: change role to ADMIN (concurrent) ──
        const tx2 = db.$transaction(async (tx) => {
          // 1. user.update FIRST (acquires User row lock — production route.ts:227)
          await tx.user.update({
            where: { id: user.id },
            data: { role: "ADMIN" },
          });
          // Capture backend PID for connection-independence proof
          const pidRows = await tx.$queryRaw`SELECT pg_backend_pid() AS pid` as any[];
          pids.tx2 = pidRows[0].pid;
          // 2. Widen overlap window (NOT serialization — same pattern as C-2a L301)
          await new Promise((r) => setTimeout(r, 50));
          // 3. findMany (production route.ts:236)
          const existing = await tx.userRole.findMany({
            where: { userId: user.id, role: { key: { in: ["ADMIN", "SELLER", "BUYER"] } } },
            select: { id: true },
          });
          // 4. deleteMany (production route.ts:241)
          if (existing.length > 0) {
            await tx.userRole.deleteMany({
              where: { id: { in: existing.map((e) => e.id) } },
            });
          }
          // 5. upsert (production route.ts:247)
          await tx.userRole.upsert({
            where: { userId_roleId: { userId: user.id, roleId: adminRole!.id } },
            create: { userId: user.id, roleId: adminRole!.id },
            update: {},
          });
        });

        // ── Run concurrently (Promise.allSettled, NOT serialized) ──
        const results = await Promise.allSettled([tx1, tx2]);
        const succeeded = results.filter((r) => r.status === "fulfilled").length;

        // ── Fresh query for final state ──
        const finalState = await snapshotState(user.id);

        // ── TIGHT INVARIANT ASSERTIONS ──

        // INV-1 (NO invalid mixed role): at most ONE replaceable UserRole row.
        // The C-2a test permitted count <= 1 PER ROLE (allowing SELLER + ADMIN
        // simultaneously). This TIGHTER invariant forbids that mixed state.
        expect(finalState.replaceableCount).toBeLessThanOrEqual(1);

        // INV-2 (NO partial state): User.role is set AND matches one of the
        // surviving UserRole keys (legacy column not orphaned from canonical).
        expect(finalState.legacyRole).toBeTruthy();
        if (finalState.replaceableCount > 0) {
          expect(finalState.replaceableRoleKeys).toContain(finalState.legacyRole);
        }

        // INV-3 (Legacy/canonical consistency): User.role === primary
        // UserRole key (the single surviving replaceable role).
        if (finalState.replaceableCount === 1) {
          expect(finalState.legacyRole).toBe(finalState.replaceableRoleKeys[0]);
        }

        // INV-4 (no specific winner asserted, per owner directive):
        // at least one tx succeeded. The winner is non-deterministic under
        // concurrency — we do NOT assert which one.
        expect(succeeded).toBeGreaterThanOrEqual(1);

        // ── Connection-independence proof (closes STEP-15.43-B §4.2 gap) ──
        // pg_backend_pid returns the OS PID of the PostgreSQL backend process
        // serving this transaction's connection. Two DISTINCT PIDs PROVE the
        // two transactions used two SEPARATE connections (i.e., truly
        // independent at the DB level — NOT two callbacks multiplexed on
        // one connection).
        expect(pids.tx1).toBeTruthy();
        expect(pids.tx2).toBeTruthy();
        expect(pids.tx1).not.toBe(pids.tx2);

        // ── Cleanup ──
        await db.userRole.deleteMany({ where: { userId: user.id } });
        await db.user.delete({ where: { id: user.id } });
      });

      // Stress test: run the same concurrent dual-write N times to catch
      // any non-deterministic race. If the invariant holds for all N
      // iterations, we have strong evidence that the row lock serializes
      // the transactions reliably.
      it("C-2c-stress: 20 iterations — invariant holds every time (no race)", async () => {
        const buyerRole = await db.role.findUnique({
          where: { key: "BUYER" },
          select: { id: true },
        });
        const sellerRole = await db.role.findUnique({
          where: { key: "SELLER" },
          select: { id: true },
        });
        const adminRole = await db.role.findUnique({
          where: { key: "ADMIN" },
          select: { id: true },
        });
        expect(buyerRole && sellerRole && adminRole).toBeTruthy();

        const N = 20;
        let violations = 0;
        let pidsAllDistinct = true;
        const observedWinners: string[] = [];

        for (let i = 0; i < N; i++) {
          const user = await db.user.create({
            data: {
              firstName: "Stress",
              lastName: `Iter${i}`,
              email: `rbac-phaseb-conc-test-stress-${i}@example.com`,
              mobile: `99900${10000 + i}`,
              passwordHash: "hash",
              role: "BUYER",
              status: "ACTIVE",
              emailVerified: true,
            },
          });
          await db.userRole.create({
            data: { userId: user.id, roleId: buyerRole!.id },
          });

          const pids: { tx1?: bigint; tx2?: bigint } = {};

          const tx1 = db.$transaction(async (tx) => {
            await tx.user.update({
              where: { id: user.id },
              data: { role: "SELLER" },
            });
            const pidRows = await tx.$queryRaw`SELECT pg_backend_pid() AS pid` as any[];
            pids.tx1 = pidRows[0].pid;
            await new Promise((r) => setTimeout(r, 50));
            const existing = await tx.userRole.findMany({
              where: { userId: user.id, role: { key: { in: ["ADMIN", "SELLER", "BUYER"] } } },
              select: { id: true },
            });
            if (existing.length > 0) {
              await tx.userRole.deleteMany({
                where: { id: { in: existing.map((e) => e.id) } },
              });
            }
            await tx.userRole.upsert({
              where: { userId_roleId: { userId: user.id, roleId: sellerRole!.id } },
              create: { userId: user.id, roleId: sellerRole!.id },
              update: {},
            });
          });

          const tx2 = db.$transaction(async (tx) => {
            await tx.user.update({
              where: { id: user.id },
              data: { role: "ADMIN" },
            });
            const pidRows = await tx.$queryRaw`SELECT pg_backend_pid() AS pid` as any[];
            pids.tx2 = pidRows[0].pid;
            await new Promise((r) => setTimeout(r, 50));
            const existing = await tx.userRole.findMany({
              where: { userId: user.id, role: { key: { in: ["ADMIN", "SELLER", "BUYER"] } } },
              select: { id: true },
            });
            if (existing.length > 0) {
              await tx.userRole.deleteMany({
                where: { id: { in: existing.map((e) => e.id) } },
              });
            }
            await tx.userRole.upsert({
              where: { userId_roleId: { userId: user.id, roleId: adminRole!.id } },
              create: { userId: user.id, roleId: adminRole!.id },
              update: {},
            });
          });

          const results = await Promise.allSettled([tx1, tx2]);
          const finalState = await snapshotState(user.id);

          // Track PIDs for connection-independence summary
          if (pids.tx1 && pids.tx2 && pids.tx1 === pids.tx2) {
            pidsAllDistinct = false;
          }

          // TIGHT invariant check for this iteration
          const invariantViolated =
            finalState.replaceableCount > 1 ||
            (finalState.replaceableCount === 1 && finalState.legacyRole !== finalState.replaceableRoleKeys[0]) ||
            (finalState.replaceableCount === 0 && finalState.legacyRole !== "BUYER");

          if (invariantViolated) {
            violations++;
            console.error(
              `[C-2c-stress iter ${i}] VIOLATION: replaceableCount=${finalState.replaceableCount}, ` +
                `keys=${JSON.stringify(finalState.replaceableRoleKeys)}, legacy=${finalState.legacyRole}`,
            );
          } else {
            // Track the winner (non-deterministic) for distribution summary
            if (finalState.replaceableCount === 1) {
              observedWinners.push(finalState.replaceableRoleKeys[0]);
            }
          }

          // ── Cleanup ──
          await db.userRole.deleteMany({ where: { userId: user.id } });
          await db.user.delete({ where: { id: user.id } }).catch(() => {});
        }

        // ── Stress-test summary assertions ──
        expect(violations).toBe(0); // NO invariant violations across N iterations
        expect(pidsAllDistinct).toBe(true); // All iterations used 2 distinct connections

        // Distribution: both SELLER and ADMIN should have won at least once
        // (proves the test is actually exercising concurrency — not just one
        // transaction always finishing first due to some scheduling artifact).
        const sellerWins = observedWinners.filter((w) => w === "SELLER").length;
        const adminWins = observedWinners.filter((w) => w === "ADMIN").length;
        console.log(
          `[C-2c-stress] N=${N} iterations, violations=${violations}, ` +
            `pidsAllDistinct=${pidsAllDistinct}, winners: SELLER=${sellerWins}, ADMIN=${adminWins}`,
        );
        // We don't strictly assert both > 0 (that's non-deterministic), but log it.
      });
    });

    /* ============================================================
       C-2d: WORST-CASE ordering (findMany BEFORE user.update)
       ------------------------------------------------------------
       This test reproduces the race the design addendum acknowledges
       (RBAC-MIGRATION-ADDENDUM-STEP-15.43.md:127-129):

         "two concurrent PATCHes for the same user could both read
          empty existingUserRoles lists, both delete nothing, and
          both upsert different roles — leaving the user with BOTH
          ADMIN and SELLER UserRole rows simultaneously."

       The production route does user.update FIRST (which acquires a
       row lock and serializes the transactions). This test uses the
       REVERSED ordering (findMany FIRST) to demonstrate that the race
       IS reachable if the ordering is changed — validating the
       addendum's concern and motivating why the production route's
       ordering matters.
       ============================================================ */
    describe("C-2d: worst-case ordering (findMany BEFORE user.update) — demonstrates addendum's race", () => {
      it("two concurrent PATCHes with reversed ordering → can leave BOTH ADMIN + SELLER UserRoles", async () => {
        const buyerRole = await db.role.findUnique({
          where: { key: "BUYER" },
          select: { id: true },
        });
        const sellerRole = await db.role.findUnique({
          where: { key: "SELLER" },
          select: { id: true },
        });
        const adminRole = await db.role.findUnique({
          where: { key: "ADMIN" },
          select: { id: true },
        });
        expect(buyerRole && sellerRole && adminRole).toBeTruthy();

        const user = await db.user.create({
          data: {
            firstName: "Conc",
            lastName: "Worst",
            email: "rbac-phaseb-conc-test-worst@example.com",
            mobile: "9990000020",
            passwordHash: "hash",
            role: "BUYER",
            status: "ACTIVE",
            emailVerified: true,
          },
        });
        await db.userRole.create({
          data: { userId: user.id, roleId: buyerRole!.id },
        });

        const initial = await snapshotState(user.id);
        expect(initial.replaceableCount).toBe(1);

        // ── Tx1: REVERSED ordering — findMany FIRST, then user.update ──
        const tx1 = db.$transaction(async (tx) => {
          // 1. findMany FIRST (captures IDs BEFORE acquiring the User row lock)
          const existing = await tx.userRole.findMany({
            where: { userId: user.id, role: { key: { in: ["ADMIN", "SELLER", "BUYER"] } } },
            select: { id: true },
          });
          const capturedIds = existing.map((e) => e.id);
          // 2. Widen overlap window — gives Tx2 time to also do its findMany
          await new Promise((r) => setTimeout(r, 80));
          // 3. user.update (acquires User row lock — Tx2 will block here)
          await tx.user.update({
            where: { id: user.id },
            data: { role: "SELLER" },
          });
          // 4. deleteMany (uses captured IDs from BEFORE — may be stale)
          if (capturedIds.length > 0) {
            await tx.userRole.deleteMany({
              where: { id: { in: capturedIds } },
            });
          }
          // 5. upsert
          await tx.userRole.upsert({
            where: { userId_roleId: { userId: user.id, roleId: sellerRole!.id } },
            create: { userId: user.id, roleId: sellerRole!.id },
            update: {},
          });
        });

        // ── Tx2: REVERSED ordering — findMany FIRST, then user.update ──
        const tx2 = db.$transaction(async (tx) => {
          // 1. findMany FIRST
          const existing = await tx.userRole.findMany({
            where: { userId: user.id, role: { key: { in: ["ADMIN", "SELLER", "BUYER"] } } },
            select: { id: true },
          });
          const capturedIds = existing.map((e) => e.id);
          // 2. Widen overlap window
          await new Promise((r) => setTimeout(r, 80));
          // 3. user.update — BLOCKS on User row lock held by Tx1
          await tx.user.update({
            where: { id: user.id },
            data: { role: "ADMIN" },
          });
          // 4. deleteMany (uses captured IDs from BEFORE — Tx1's SELLER row NOT captured)
          if (capturedIds.length > 0) {
            await tx.userRole.deleteMany({
              where: { id: { in: capturedIds } },
            });
          }
          // 5. upsert
          await tx.userRole.upsert({
            where: { userId_roleId: { userId: user.id, roleId: adminRole!.id } },
            create: { userId: user.id, roleId: adminRole!.id },
            update: {},
          });
        });

        // ── Run concurrently (Promise.allSettled, NOT serialized) ──
        const results = await Promise.allSettled([tx1, tx2]);
        const succeeded = results.filter((r) => r.status === "fulfilled").length;

        // ── Fresh query for final state ──
        const finalState = await snapshotState(user.id);

        // ── EXPECTED: race IS reachable with reversed ordering ──
        // The addendum acknowledges this. The test asserts:
        //   - BOTH transactions succeeded (no @@unique violation since
        //     they upsert DIFFERENT roleIds).
        //   - The user ENDS UP WITH BOTH ADMIN AND SELLER UserRole rows
        //     simultaneously — INVARIANT VIOLATION under the TIGHT
        //     invariant (INV-1: at most ONE replaceable role).
        // This demonstrates the race the addendum describes.

        console.log(
          `[C-2d] finalState: replaceableCount=${finalState.replaceableCount}, ` +
            `keys=${JSON.stringify(finalState.replaceableRoleKeys)}, legacy=${finalState.legacyRole}, ` +
            `succeeded=${succeeded}/2`,
        );

        // Both transactions should succeed (different roleIds → no @@unique violation)
        expect(succeeded).toBe(2);

        // The race SHOULD leave BOTH ADMIN and SELLER UserRoles (INV-1 VIOLATED).
        // This is the BEHAVIORAL EVIDENCE that the addendum's race is real
        // and reachable when the ordering is reversed.
        expect(finalState.replaceableCount).toBe(2);
        expect(finalState.replaceableRoleKeys.sort()).toEqual(["ADMIN", "SELLER"]);

        // ── Cleanup ──
        await db.userRole.deleteMany({ where: { userId: user.id } });
        await db.user.delete({ where: { id: user.id } });
      });

      // Stress test: run the worst-case N times to confirm the race is
      // REPRODUCIBLY reachable (not a one-time fluke).
      it("C-2d-stress: 10 iterations — race is reproducibly reachable", async () => {
        const buyerRole = await db.role.findUnique({
          where: { key: "BUYER" },
          select: { id: true },
        });
        const sellerRole = await db.role.findUnique({
          where: { key: "SELLER" },
          select: { id: true },
        });
        const adminRole = await db.role.findUnique({
          where: { key: "ADMIN" },
          select: { id: true },
        });
        expect(buyerRole && sellerRole && adminRole).toBeTruthy();

        const N = 10;
        let raceHitCount = 0;
        let bothSucceededCount = 0;

        for (let i = 0; i < N; i++) {
          const user = await db.user.create({
            data: {
              firstName: "Worst",
              lastName: `Iter${i}`,
              email: `rbac-phaseb-conc-test-worst-${i}@example.com`,
              mobile: `99900${20000 + i}`,
              passwordHash: "hash",
              role: "BUYER",
              status: "ACTIVE",
              emailVerified: true,
            },
          });
          await db.userRole.create({
            data: { userId: user.id, roleId: buyerRole!.id },
          });

          const tx1 = db.$transaction(async (tx) => {
            const existing = await tx.userRole.findMany({
              where: { userId: user.id, role: { key: { in: ["ADMIN", "SELLER", "BUYER"] } } },
              select: { id: true },
            });
            const capturedIds = existing.map((e) => e.id);
            await new Promise((r) => setTimeout(r, 80));
            await tx.user.update({
              where: { id: user.id },
              data: { role: "SELLER" },
            });
            if (capturedIds.length > 0) {
              await tx.userRole.deleteMany({
                where: { id: { in: capturedIds } },
              });
            }
            await tx.userRole.upsert({
              where: { userId_roleId: { userId: user.id, roleId: sellerRole!.id } },
              create: { userId: user.id, roleId: sellerRole!.id },
              update: {},
            });
          });

          const tx2 = db.$transaction(async (tx) => {
            const existing = await tx.userRole.findMany({
              where: { userId: user.id, role: { key: { in: ["ADMIN", "SELLER", "BUYER"] } } },
              select: { id: true },
            });
            const capturedIds = existing.map((e) => e.id);
            await new Promise((r) => setTimeout(r, 80));
            await tx.user.update({
              where: { id: user.id },
              data: { role: "ADMIN" },
            });
            if (capturedIds.length > 0) {
              await tx.userRole.deleteMany({
                where: { id: { in: capturedIds } },
              });
            }
            await tx.userRole.upsert({
              where: { userId_roleId: { userId: user.id, roleId: adminRole!.id } },
              create: { userId: user.id, roleId: adminRole!.id },
              update: {},
            });
          });

          const results = await Promise.allSettled([tx1, tx2]);
          const succeeded = results.filter((r) => r.status === "fulfilled").length;
          if (succeeded === 2) bothSucceededCount++;

          const finalState = await snapshotState(user.id);
          if (
            finalState.replaceableCount === 2 &&
            finalState.replaceableRoleKeys.includes("ADMIN") &&
            finalState.replaceableRoleKeys.includes("SELLER")
          ) {
            raceHitCount++;
          }

          // ── Cleanup ──
          await db.userRole.deleteMany({ where: { userId: user.id } });
          await db.user.delete({ where: { id: user.id } }).catch(() => {});
        }

        console.log(
          `[C-2d-stress] N=${N} iterations, raceHit=${raceHitCount}, ` +
            `bothSucceeded=${bothSucceededCount}/${N}`,
        );

        // The race is REPRODUCIBLY reachable — at least one iteration hits it.
        // (We don't require ALL N iterations to hit it because the race depends
        //  on the OS scheduler's timing — but it should hit MORE OFTEN THAN NOT.)
        expect(raceHitCount).toBeGreaterThan(0);
      });
    });

    /* ============================================================
       C-2e: WORST-CASE ordering + SELECT ... FOR UPDATE (defense-in-depth fix)
       ------------------------------------------------------------
       This test verifies the targeted defense-in-depth fix on branch
       `fix/rbac-concurrency` (commit to be reported). The fix adds an
       explicit `SELECT id FROM "User" WHERE id = $1 FOR UPDATE` at the
       START of the dual-write transaction in
       src/app/api/admin/users/[id]/route.ts (route.ts:226-246).

       The fix is "defense-in-depth": the production code's CURRENT
       ordering (user.update FIRST) is ALREADY safe (proven by C-2c).
       The fix makes the safety EXPLICIT and ORDERING-INDEPENDENT — so
       a future refactor that reorders the operations will NOT silently
       introduce the race.

       This test applies the SAME worst-case ordering as C-2d (findMany
       FIRST) BUT adds the SELECT ... FOR UPDATE at the start. The race
       should NO LONGER be reachable. TIGHT invariants should hold.
       ============================================================ */
    describe("C-2e: worst-case ordering + SELECT ... FOR UPDATE fix → invariant HOLDS", () => {
      it("two concurrent PATCHes with FOR UPDATE → at most ONE replaceable UserRole (no race)", async () => {
        const buyerRole = await db.role.findUnique({
          where: { key: "BUYER" },
          select: { id: true },
        });
        const sellerRole = await db.role.findUnique({
          where: { key: "SELLER" },
          select: { id: true },
        });
        const adminRole = await db.role.findUnique({
          where: { key: "ADMIN" },
          select: { id: true },
        });
        expect(buyerRole && sellerRole && adminRole).toBeTruthy();

        const user = await db.user.create({
          data: {
            firstName: "Conc",
            lastName: "Fix",
            email: "rbac-phaseb-conc-test-fix@example.com",
            mobile: "9990000030",
            passwordHash: "hash",
            role: "BUYER",
            status: "ACTIVE",
            emailVerified: true,
          },
        });
        await db.userRole.create({
          data: { userId: user.id, roleId: buyerRole!.id },
        });

        const initial = await snapshotState(user.id);
        expect(initial.replaceableCount).toBe(1);

        // ── Tx1: SELECT FOR UPDATE FIRST, then findMany, then user.update ──
        const tx1 = db.$transaction(async (tx) => {
          // 0. SELECT FOR UPDATE — acquires User row lock AT TX START
          await tx.$queryRaw`SELECT id FROM "User" WHERE "id" = ${user.id} FOR UPDATE`;
          // 1. findMany (now BLOCKS other tx's SELECT FOR UPDATE — when this
          //    tx reads, the other tx cannot start its findMany until we commit)
          const existing = await tx.userRole.findMany({
            where: { userId: user.id, role: { key: { in: ["ADMIN", "SELLER", "BUYER"] } } },
            select: { id: true },
          });
          const capturedIds = existing.map((e) => e.id);
          await new Promise((r) => setTimeout(r, 80));
          await tx.user.update({
            where: { id: user.id },
            data: { role: "SELLER" },
          });
          if (capturedIds.length > 0) {
            await tx.userRole.deleteMany({
              where: { id: { in: capturedIds } },
            });
          }
          await tx.userRole.upsert({
            where: { userId_roleId: { userId: user.id, roleId: sellerRole!.id } },
            create: { userId: user.id, roleId: sellerRole!.id },
            update: {},
          });
        });

        // ── Tx2: SELECT FOR UPDATE FIRST, then findMany, then user.update ──
        const tx2 = db.$transaction(async (tx) => {
          // 0. SELECT FOR UPDATE — BLOCKS until Tx1 commits (User row lock)
          await tx.$queryRaw`SELECT id FROM "User" WHERE "id" = ${user.id} FOR UPDATE`;
          // 1. findMany — now sees Tx1's COMMITTED state (because Tx1 released
          //    the row lock on commit, and READ COMMITTED re-reads)
          const existing = await tx.userRole.findMany({
            where: { userId: user.id, role: { key: { in: ["ADMIN", "SELLER", "BUYER"] } } },
            select: { id: true },
          });
          const capturedIds = existing.map((e) => e.id);
          await new Promise((r) => setTimeout(r, 80));
          await tx.user.update({
            where: { id: user.id },
            data: { role: "ADMIN" },
          });
          if (capturedIds.length > 0) {
            await tx.userRole.deleteMany({
              where: { id: { in: capturedIds } },
            });
          }
          await tx.userRole.upsert({
            where: { userId_roleId: { userId: user.id, roleId: adminRole!.id } },
            create: { userId: user.id, roleId: adminRole!.id },
            update: {},
          });
        });

        const results = await Promise.allSettled([tx1, tx2]);
        const succeeded = results.filter((r) => r.status === "fulfilled").length;

        const finalState = await snapshotState(user.id);

        console.log(
          `[C-2e] finalState: replaceableCount=${finalState.replaceableCount}, ` +
            `keys=${JSON.stringify(finalState.replaceableRoleKeys)}, legacy=${finalState.legacyRole}, ` +
            `succeeded=${succeeded}/2`,
        );

        // ── TIGHT INVARIANT ASSERTIONS (same as C-2c) ──
        // The fix should make these HOLD even with the worst-case ordering.
        expect(finalState.replaceableCount).toBeLessThanOrEqual(1); // INV-1
        expect(finalState.legacyRole).toBeTruthy(); // INV-2
        if (finalState.replaceableCount > 0) {
          expect(finalState.replaceableRoleKeys).toContain(finalState.legacyRole); // INV-2
        }
        if (finalState.replaceableCount === 1) {
          expect(finalState.legacyRole).toBe(finalState.replaceableRoleKeys[0]); // INV-3
        }
        expect(succeeded).toBeGreaterThanOrEqual(1); // INV-4

        // ── Cleanup ──
        await db.userRole.deleteMany({ where: { userId: user.id } });
        await db.user.delete({ where: { id: user.id } });
      });

      it("C-2e-stress: 10 iterations — fix holds invariant EVERY time (no race)", async () => {
        const buyerRole = await db.role.findUnique({
          where: { key: "BUYER" },
          select: { id: true },
        });
        const sellerRole = await db.role.findUnique({
          where: { key: "SELLER" },
          select: { id: true },
        });
        const adminRole = await db.role.findUnique({
          where: { key: "ADMIN" },
          select: { id: true },
        });
        expect(buyerRole && sellerRole && adminRole).toBeTruthy();

        const N = 10;
        let violations = 0;
        let bothSucceededCount = 0;

        for (let i = 0; i < N; i++) {
          const user = await db.user.create({
            data: {
              firstName: "FixStress",
              lastName: `Iter${i}`,
              email: `rbac-phaseb-conc-test-fix-${i}@example.com`,
              mobile: `99900${30000 + i}`,
              passwordHash: "hash",
              role: "BUYER",
              status: "ACTIVE",
              emailVerified: true,
            },
          });
          await db.userRole.create({
            data: { userId: user.id, roleId: buyerRole!.id },
          });

          const tx1 = db.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT id FROM "User" WHERE "id" = ${user.id} FOR UPDATE`;
            const existing = await tx.userRole.findMany({
              where: { userId: user.id, role: { key: { in: ["ADMIN", "SELLER", "BUYER"] } } },
              select: { id: true },
            });
            const capturedIds = existing.map((e) => e.id);
            await new Promise((r) => setTimeout(r, 80));
            await tx.user.update({
              where: { id: user.id },
              data: { role: "SELLER" },
            });
            if (capturedIds.length > 0) {
              await tx.userRole.deleteMany({
                where: { id: { in: capturedIds } },
              });
            }
            await tx.userRole.upsert({
              where: { userId_roleId: { userId: user.id, roleId: sellerRole!.id } },
              create: { userId: user.id, roleId: sellerRole!.id },
              update: {},
            });
          });

          const tx2 = db.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT id FROM "User" WHERE "id" = ${user.id} FOR UPDATE`;
            const existing = await tx.userRole.findMany({
              where: { userId: user.id, role: { key: { in: ["ADMIN", "SELLER", "BUYER"] } } },
              select: { id: true },
            });
            const capturedIds = existing.map((e) => e.id);
            await new Promise((r) => setTimeout(r, 80));
            await tx.user.update({
              where: { id: user.id },
              data: { role: "ADMIN" },
            });
            if (capturedIds.length > 0) {
              await tx.userRole.deleteMany({
                where: { id: { in: capturedIds } },
              });
            }
            await tx.userRole.upsert({
              where: { userId_roleId: { userId: user.id, roleId: adminRole!.id } },
              create: { userId: user.id, roleId: adminRole!.id },
              update: {},
            });
          });

          const results = await Promise.allSettled([tx1, tx2]);
          const succeeded = results.filter((r) => r.status === "fulfilled").length;
          if (succeeded === 2) bothSucceededCount++;

          const finalState = await snapshotState(user.id);
          const invariantViolated =
            finalState.replaceableCount > 1 ||
            (finalState.replaceableCount === 1 && finalState.legacyRole !== finalState.replaceableRoleKeys[0]) ||
            (finalState.replaceableCount === 0 && finalState.legacyRole !== "BUYER");
          if (invariantViolated) {
            violations++;
            console.error(
              `[C-2e-stress iter ${i}] VIOLATION: replaceableCount=${finalState.replaceableCount}, ` +
                `keys=${JSON.stringify(finalState.replaceableRoleKeys)}, legacy=${finalState.legacyRole}`,
            );
          }

          await db.userRole.deleteMany({ where: { userId: user.id } });
          await db.user.delete({ where: { id: user.id } }).catch(() => {});
        }

        console.log(
          `[C-2e-stress] N=${N} iterations, violations=${violations}, ` +
            `bothSucceeded=${bothSucceededCount}/${N}`,
        );
        expect(violations).toBe(0); // The fix makes the invariant hold EVERY iteration
      });
    });
  },
);
