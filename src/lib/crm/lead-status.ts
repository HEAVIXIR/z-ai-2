/**
 * HEAVIX — Lead Status transitions (PR-SC-01, ADR-005 §3)
 * ============================================================
 * Deterministic, app-layer validation for the Lead.status field.
 *
 * The DB column is a plain String (not a Postgres enum) so the PR-SC-01
 * migration is a single additive ALTER TABLE with a safe default and no
 * blocking enum cast. This module is the single source of truth for the
 * allowed values and the legal transitions; every API mutation that
 * changes Lead.status MUST call {@link validateTransition} first.
 *
 * Pipeline:
 *   NEW → CONTACTED → QUALIFIED → CLOSED | LOST
 *
 * Re-engagement is allowed out of terminal states (CLOSED → CONTACTED,
 * LOST → NEW | CONTACTED) so a seller can reopen a deal when a buyer
 * returns. NEW cannot move backwards (it is the entry state). QUALIFIED
 * cannot regress to NEW or CONTACTED without being re-classified.
 *
 * @module crm/lead-status
 */

export const LEAD_STATUSES = [
  "NEW",
  "CONTACTED",
  "QUALIFIED",
  "CLOSED",
  "LOST",
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

/**
 * Map of legal forward/reopen transitions.
 * Key = current status, value = set of statuses the lead may move TO.
 * Any transition NOT in this map is rejected by {@link validateTransition}.
 */
export const ALLOWED_TRANSITIONS: Record<LeadStatus, LeadStatus[]> = {
  NEW: ["CONTACTED", "QUALIFIED", "CLOSED", "LOST"],
  CONTACTED: ["QUALIFIED", "CLOSED", "LOST"],
  QUALIFIED: ["CLOSED", "LOST"],
  CLOSED: ["CONTACTED"], // reopen
  LOST: ["NEW", "CONTACTED"], // re-engage
};

/**
 * Type guard: is the given string a valid LeadStatus?
 * Used to validate inbound API payloads before any DB write.
 */
export function isLeadStatus(value: unknown): value is LeadStatus {
  return typeof value === "string" && (LEAD_STATUSES as readonly string[]).includes(value);
}

/**
 * Validate a status transition.
 *
 * @returns `{ ok: true }` if the transition is legal.
 * @returns `{ ok: false, error }` with a human-readable reason if not.
 *
 * Fail-closed: an unknown `from` or `to` value is rejected (ok: false),
 * never silently accepted. This prevents malformed payloads from
 * polluting the status column.
 */
export function validateTransition(
  from: string,
  to: string,
): { ok: true } | { ok: false; error: string } {
  if (!isLeadStatus(from)) {
    return { ok: false, error: `Unknown current status: "${from}"` };
  }
  if (!isLeadStatus(to)) {
    return { ok: false, error: `Unknown target status: "${to}". Allowed: ${LEAD_STATUSES.join(", ")}` };
  }
  if (from === to) {
    // No-op transition: legal (idempotent PATCH), but we still report ok.
    return { ok: true };
  }
  const allowed = ALLOWED_TRANSITIONS[from];
  if (!allowed.includes(to)) {
    return {
      ok: false,
      error: `Illegal transition: ${from} → ${to}. Allowed from ${from}: ${allowed.join(", ") || "(terminal)"}`,
    };
  }
  return { ok: true };
}

/**
 * Is the status terminal (no forward progress possible, only reopen)?
 * Used by the UI to render CLOSED/LOST as end-of-pipeline columns.
 */
export function isTerminalStatus(status: string): boolean {
  return status === "CLOSED" || status === "LOST";
}
