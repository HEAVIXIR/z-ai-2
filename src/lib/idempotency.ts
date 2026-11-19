/**
 * HEAVIX — Idempotency helper (H.2.4e)
 * ------------------------------------------------------------
 * Makes submission retries safe: a client that resubmits the same
 * payload with the same `Idempotency-Key` header resolves to the
 * PRIOR result instead of creating a duplicate entity.
 *
 * The mechanism is audit-log-backed:
 *   1. extractIdempotencyKey(req) — reads + validates the header.
 *   2. findIdempotentResult({ key, action, actorId }) — looks up the
 *      most recent AuditLog row stamped with that key+action+actor.
 *      If found, the route returns the cached { id, status } from the
 *      audit `afterJson` payload (HTTP 200, idempotentReplay: true).
 *   3. The create path writes its audit row with idempotencyKey set
 *      (see src/lib/admin/audit.ts), so the NEXT retry finds it.
 *
 * Race note: two truly-concurrent requests with the same key can both
 * create before either audits. The AuditLog.idempotencyKey @unique
 * constraint means only one audit row survives; the second logAudit is
 * best-effort and swallows the P2002. The per-user rate limiter is the
 * secondary throttle. This is acceptable for the documented requirement
 * ("one submission cannot create duplicate requests on retry"): a retry
 * is sequential (client resends after a network blip), not concurrent.
 *
 * The header is OPTIONAL — callers that omit it get normal (non-
 * idempotent) behavior, preserving backward compatibility.
 */
import { db } from "@/lib/db";

/** Max length of an accepted idempotency key (defensive cap). */
const MAX_IDEMPOTENCY_KEY_LEN = 128;

/**
 * Read and validate the `Idempotency-Key` header. Returns the trimmed
 * key, or null when absent/invalid. A key must be 1..128 chars of
 * reasonably safe characters (letters, digits, dash, underscore, colon,
 * dot) so it cannot be used as a log-injection vector.
 */
export function extractIdempotencyKey(req: Request): string | null {
  const raw = req.headers.get("idempotency-key");
  if (!raw) return null;
  const key = raw.trim();
  if (!key || key.length > MAX_IDEMPOTENCY_KEY_LEN) return null;
  // Allowlist charset to keep audit-log rows safe to store + index.
  if (!/^[A-Za-z0-9._:-]+$/.test(key)) return null;
  return key;
}

export interface IdempotentResult {
  /** The entity id recorded in the prior audit row. */
  id: string;
  /** The status recorded in the prior audit `afterJson` payload (if any). */
  status: string | null;
}

/**
 * Look up the most recent audit row stamped with the given
 * idempotencyKey + action + actor. Returns the cached { id, status }
 * when found, or null when no prior submission exists for that key.
 *
 * The lookup is scoped by actorId so one user's key cannot collide
 * with another's (the @unique constraint is global, but the lookup
 * narrows by actor — a key reused by two different users is treated
 * as two independent submissions, which is the safe default).
 */
export async function findIdempotentResult(params: {
  key: string;
  action: string;
  actorId: string;
}): Promise<IdempotentResult | null> {
  const row = await db.auditLog.findFirst({
    where: {
      idempotencyKey: params.key,
      action: params.action,
      actorId: params.actorId,
    },
    select: { entityId: true, afterJson: true },
    orderBy: { createdAt: "desc" },
    take: 1,
  });
  if (!row || !row.entityId) return null;
  let status: string | null = null;
  if (row.afterJson) {
    try {
      const parsed = JSON.parse(row.afterJson) as Record<string, unknown>;
      // Prefer the schema status when present; fall back to the semantic
      // status field some audit payloads record.
      const s = parsed.schemaStatus ?? parsed.status;
      if (typeof s === "string") status = s;
    } catch {
      // Malformed audit payload — treat as a hit with unknown status so
      // the caller still gets the prior id (preventing a duplicate).
      status = null;
    }
  }
  return { id: row.entityId, status };
}
