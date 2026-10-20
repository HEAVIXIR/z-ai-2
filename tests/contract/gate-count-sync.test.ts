/**
 * HEAVIX — STEP 14.89: Gate Count Sync Test (OF-6 prevention)
 *
 * Purpose: Prevent the MIG-05 gate evidence string from drifting
 * from the actual source count in legacy-migration-checklist.ts.
 *
 * This test was recommended as OF-6 in STEP 14.87 and implemented
 * per owner directive STEP 14.89 D-01.3.
 *
 * The test asserts:
 *   1. The count in MIG-05's evidence string matches migrationStats().byStatus.PENDING
 *   2. The count in MIG-05's title matches migrationStats().byStatus.PENDING
 *   3. The total gate count is stable (74 items)
 *   4. Exactly 1 PENDING gate exists (MIG-05)
 *   5. MIG-03's progressPct matches migrationStats().progressPct
 *
 * If any of these drift, the test fails — preventing a repeat of
 * the STEP 14.81 staleness incident (where MIG-05 said "42" but
 * the source had 38 PENDING entries).
 *
 * This is a pure contract test — no database required.
 * Runs in CI verify job under: bunx vitest run tests/contract/
 */

import { describe, it, expect } from "vitest";
import { PRODUCTION_READINESS_GATE } from "@/lib/admin/production-readiness-gate";
import { migrationStats } from "@/lib/admin/legacy-migration-checklist";

describe("Gate Count Sync — production-readiness-gate vs legacy-migration-checklist", () => {
  const stats = migrationStats();

  it("MIG-05 evidence string count matches migrationStats().byStatus.PENDING", () => {
    const mig05 = PRODUCTION_READINESS_GATE.find((g) => g.id === "MIG-05");
    expect(mig05).toBeDefined();

    // Extract the first number from the evidence string.
    // Evidence format: "migrationStats().byStatus.PENDING = 38 (verified: ...)"
    const match = mig05!.evidence.match(/=\s*(\d+)/);
    expect(match).not.toBeNull();
    const evidenceCount = parseInt(match![1], 10);

    expect(evidenceCount).toBe(stats.byStatus.PENDING);
  });

  it("MIG-05 title count matches migrationStats().byStatus.PENDING", () => {
    const mig05 = PRODUCTION_READINESS_GATE.find((g) => g.id === "MIG-05");
    expect(mig05).toBeDefined();

    // Title format: "38 pages PENDING migration (post-launch)"
    const match = mig05!.title.match(/(\d+)\s+pages/);
    expect(match).not.toBeNull();
    const titleCount = parseInt(match![1], 10);

    expect(titleCount).toBe(stats.byStatus.PENDING);
  });

  it("MIG-03 progressPct matches migrationStats().progressPct", () => {
    const mig03 = PRODUCTION_READINESS_GATE.find((g) => g.id === "MIG-03");
    expect(mig03).toBeDefined();

    // Evidence format: "migrationStats().progressPct = 60"
    const match = mig03!.evidence.match(/=\s*(\d+)/);
    expect(match).not.toBeNull();
    const evidencePct = parseInt(match![1], 10);

    expect(evidencePct).toBe(stats.progressPct);
  });

  it("total gate count is 74", () => {
    expect(PRODUCTION_READINESS_GATE.length).toBe(74);
  });

  it("exactly 1 PENDING gate item exists (MIG-05)", () => {
    const pending = PRODUCTION_READINESS_GATE.filter((g) => g.status === "PENDING");
    expect(pending.length).toBe(1);
    expect(pending[0].id).toBe("MIG-05");
  });

  it("all gate IDs are unique", () => {
    const ids = PRODUCTION_READINESS_GATE.map((g) => g.id);
    const uniqueIds = new Set(ids);
    expect(ids.length).toBe(uniqueIds.size);
  });

  it("migrationStats breakdown is internally consistent", () => {
    // byStatus counts should sum to total
    const { byStatus } = stats;
    const sum =
      byStatus.MIGRATED +
      byStatus.IN_PROGRESS +
      byStatus.PENDING +
      byStatus.DEPRECATED +
      byStatus.KEEP_AS_IS;
    expect(sum).toBe(stats.total);

    // pending = IN_PROGRESS + PENDING (per line 220 of legacy-migration-checklist.ts)
    expect(stats.pending).toBe(byStatus.IN_PROGRESS + byStatus.PENDING);

    // addressed = MIGRATED + KEEP_AS_IS + DEPRECATED (per line 219)
    expect(stats.addressed).toBe(
      byStatus.MIGRATED + byStatus.KEEP_AS_IS + byStatus.DEPRECATED,
    );

    // progressPct = round(addressed / total * 100) (per line 221)
    expect(stats.progressPct).toBe(
      Math.round((stats.addressed / stats.total) * 100),
    );
  });
});
