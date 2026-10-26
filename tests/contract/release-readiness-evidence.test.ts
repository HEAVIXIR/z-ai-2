import { describe, expect, it } from "vitest";
import {
  effectiveReadinessStatus,
  releaseReadiness,
  MAX_EVIDENCE_AGE_MS,
  type ReadinessGate,
  type ReadinessSnapshot,
} from "@/lib/admin/release-readiness-snapshot";

const now = new Date("2026-10-26T10:05:00.000Z");
const sha = "a".repeat(40);
const snapshot: ReadinessSnapshot = {
  mainSha: sha,
  observedAt: "2026-10-26T10:04:00.000Z",
  sourceUrl: "https://github.com/HEAVIXIR/z-ai-2/commit/" + sha,
  gates: [],
};
const gate: ReadinessGate = {
  id: "sample",
  title: "sample gate",
  status: "PASS",
  evidenceSha: sha,
  sourceUrl: "https://github.com/HEAVIXIR/z-ai-2",
  evidence: "test evidence",
};

describe("release readiness evidence fail-closed rules", () => {
  it("exports the timestamped releaseReadiness snapshot", () => {
    expect(releaseReadiness.mainSha).toMatch(/^[a-f0-9]{40}$/);
    expect(releaseReadiness.gates.length).toBeGreaterThan(0);
  });
  it("keeps fresh evidence PASS only when runtime SHA and evidence SHA match the snapshot", () => {
    expect(effectiveReadinessStatus(gate, snapshot, now, sha)).toBe("PASS");
  });

  it("downgrades evidence from a different commit to PENDING", () => {
    expect(
      effectiveReadinessStatus(
        { ...gate, evidenceSha: "b".repeat(40) },
        snapshot,
        now,
        sha,
      ),
    ).toBe("PENDING");
  });

  it("downgrades all evidence to PENDING when runtime SHA differs", () => {
    expect(effectiveReadinessStatus(gate, snapshot, now, "c".repeat(40))).toBe(
      "PENDING",
    );
  });

  it("downgrades evidence older than the freshness window to PENDING", () => {
    const oldSnapshot = {
      ...snapshot,
      observedAt: new Date(now.getTime() - MAX_EVIDENCE_AGE_MS - 1).toISOString(),
    };
    expect(effectiveReadinessStatus(gate, oldSnapshot, now, sha)).toBe("PENDING");
  });

  it("downgrades missing evidence SHA, snapshot timestamp, or runtime SHA to PENDING", () => {
    expect(
      effectiveReadinessStatus({ ...gate, evidenceSha: null }, snapshot, now, sha),
    ).toBe("PENDING");
    expect(
      effectiveReadinessStatus(gate, { ...snapshot, observedAt: "" }, now, sha),
    ).toBe("PENDING");
    expect(effectiveReadinessStatus(gate, snapshot, now, null)).toBe("PENDING");
    expect(
      effectiveReadinessStatus({ ...gate, sourceUrl: "" }, snapshot, now, sha),
    ).toBe("PENDING");
    expect(
      effectiveReadinessStatus({ ...gate, evidence: "" }, snapshot, now, sha),
    ).toBe("PENDING");
  });
});
