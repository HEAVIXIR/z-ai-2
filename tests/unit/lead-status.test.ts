import { describe, it, expect } from "vitest";
import {
  LEAD_STATUSES,
  ALLOWED_TRANSITIONS,
  isLeadStatus,
  validateTransition,
  isTerminalStatus,
} from "@/lib/crm/lead-status";

/* ============================================================
   Unit tests for src/lib/crm/lead-status.ts (PR-SC-01)
   ------------------------------------------------------------
   Pins the legal Lead.status transitions so a malformed API payload
   cannot pollute the status column. Fail-closed: unknown values are
   rejected, never silently accepted.
   ============================================================ */

describe("LEAD_STATUSES", () => {
  it("exposes the 5 canonical pipeline states in order", () => {
    expect(LEAD_STATUSES).toEqual(["NEW", "CONTACTED", "QUALIFIED", "CLOSED", "LOST"]);
  });
});

describe("ALLOWED_TRANSITIONS", () => {
  it("NEW can move forward to any non-NEW state", () => {
    expect(ALLOWED_TRANSITIONS.NEW.sort()).toEqual(["CLOSED", "CONTACTED", "LOST", "QUALIFIED"]);
  });
  it("QUALIFIED can only close or lose (no regression)", () => {
    expect(ALLOWED_TRANSITIONS.QUALIFIED.sort()).toEqual(["CLOSED", "LOST"]);
  });
  it("terminal states allow reopen only (no forward)", () => {
    expect(ALLOWED_TRANSITIONS.CLOSED).toEqual(["CONTACTED"]);
    expect(ALLOWED_TRANSITIONS.LOST.sort()).toEqual(["CONTACTED", "NEW"]);
  });
});

describe("isLeadStatus", () => {
  it("accepts the 5 canonical values", () => {
    for (const s of LEAD_STATUSES) expect(isLeadStatus(s)).toBe(true);
  });
  it("rejects unknown strings", () => {
    expect(isLeadStatus("PENDING")).toBe(false);
    expect(isLeadStatus("")).toBe(false);
    expect(isLeadStatus("new")).toBe(false); // case-sensitive
  });
  it("rejects non-strings", () => {
    expect(isLeadStatus(null)).toBe(false);
    expect(isLeadStatus(undefined)).toBe(false);
    expect(isLeadStatus(123)).toBe(false);
  });
});

describe("validateTransition", () => {
  it("accepts legal forward transitions", () => {
    expect(validateTransition("NEW", "CONTACTED")).toEqual({ ok: true });
    expect(validateTransition("CONTACTED", "QUALIFIED")).toEqual({ ok: true });
    expect(validateTransition("QUALIFIED", "CLOSED")).toEqual({ ok: true });
    expect(validateTransition("QUALIFIED", "LOST")).toEqual({ ok: true });
  });
  it("accepts re-engagement from terminal states", () => {
    expect(validateTransition("CLOSED", "CONTACTED")).toEqual({ ok: true });
    expect(validateTransition("LOST", "NEW")).toEqual({ ok: true });
    expect(validateTransition("LOST", "CONTACTED")).toEqual({ ok: true });
  });
  it("accepts no-op (same status) as idempotent", () => {
    for (const s of LEAD_STATUSES) {
      expect(validateTransition(s, s)).toEqual({ ok: true });
    }
  });
  it("rejects regression (QUALIFIED → NEW/CONTACTED)", () => {
    expect(validateTransition("QUALIFIED", "NEW").ok).toBe(false);
    expect(validateTransition("QUALIFIED", "CONTACTED").ok).toBe(false);
  });
  it("rejects forward from terminal (CLOSED → QUALIFIED)", () => {
    expect(validateTransition("CLOSED", "QUALIFIED").ok).toBe(false);
    expect(validateTransition("LOST", "QUALIFIED").ok).toBe(false);
  });
  it("rejects NEW → NEW-only-illegal reverse... (NEW cannot go to itself via a non-noop path — covered by no-op test)", () => {
    // NEW has no reverse; the only illegal NEW transition is a value not in its allowed set.
    expect(validateTransition("NEW", "PENDING").ok).toBe(false);
  });
  it("fail-closed: unknown `from` is rejected with a reason", () => {
    const r = validateTransition("ARCHIVED", "NEW");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("ARCHIVED");
  });
  it("fail-closed: unknown `to` is rejected with allowed list", () => {
    const r = validateTransition("NEW", "WON");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("WON");
      expect(r.error).toContain("NEW");
    }
  });
  it("error message names both statuses + allowed set on illegal transition", () => {
    const r = validateTransition("QUALIFIED", "NEW");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("QUALIFIED");
      expect(r.error).toContain("NEW");
    }
  });
});

describe("isTerminalStatus", () => {
  it("CLOSED and LOST are terminal", () => {
    expect(isTerminalStatus("CLOSED")).toBe(true);
    expect(isTerminalStatus("LOST")).toBe(true);
  });
  it("NEW, CONTACTED, QUALIFIED are NOT terminal", () => {
    expect(isTerminalStatus("NEW")).toBe(false);
    expect(isTerminalStatus("CONTACTED")).toBe(false);
    expect(isTerminalStatus("QUALIFIED")).toBe(false);
  });
  it("unknown status is NOT terminal (fail-safe: renders as active)", () => {
    expect(isTerminalStatus("WIDGET")).toBe(false);
  });
});
