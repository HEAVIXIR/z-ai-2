/**
 * HEAVIX — V-E Security Event Logging Foundation (Directive 49.2X-07)
 *
 * Reuses existing AuditLog table with semantic prefix to avoid migration:
 *   action: 'security.auth.fail' | 'security.authz.deny' | 'security.bypass.attempt'
 *   entityType: 'SecurityEvent'
 *   actorType: 'SYSTEM' (for unauthenticated) or existing actorType
 *
 * ASVS V16.3.1: authentication success/failure logging
 * ASVS V16.3.2: authorization denial logging
 * ASVS V16.3.3: bypass attempt logging
 *
 * CRITICAL: logging failure must NOT convert DENY → ALLOW.
 * Authorization remains fail-closed regardless of logging state.
 *
 * NEVER LOG: password, token, API key, DATABASE_URL, .env secrets, credential values.
 */

import { logAudit } from '@/lib/admin/audit';
import { headers } from 'next/headers';

export type SecurityEventType =
  | 'AUTH_FAIL'       // authentication failure (V16.3.1)
  | 'AUTHZ_DENY'      // authorization denial (V16.3.2)
  | 'BYPASS_ATTEMPT'; // validation/business-logic bypass attempt (V16.3.3)

export interface SecurityEventInput {
  type: SecurityEventType;
  subjectId?: string | null;
  route?: string | null;
  operation?: string | null;
  requiredPermission?: string | null;
  reason?: string | null;
  requestId?: string | null;
}

/**
 * Log a security event to AuditLog with semantic prefix.
 * Failures in logging are silently caught to avoid blocking authorization decisions.
 * Authorization decisions (ALLOW/DENY) are made BEFORE calling this function.
 */
export async function logSecurityEvent(input: SecurityEventInput): Promise<void> {
  try {
    const action = `security.${input.type.toLowerCase().replace('_', '.')}`;
    let ip: string | null = null;
    let userAgent: string | null = null;

    try {
      const h = await headers();
      ip = h.get('x-forwarded-for') || null;
      userAgent = h.get('user-agent') || null;
    } catch {
      // headers() not available in this context — proceed without IP/userAgent
    }

    await logAudit({
      actorId: input.subjectId ?? null,
      actorType: 'SYSTEM',
      action,
      entityType: 'SecurityEvent',
      entityId: null,
      reason: input.reason ?? null,
      ip,
      userAgent,
      requestId: input.requestId ?? null,
    });
  } catch (error) {
    // CRITICAL: logging failure must NOT block authorization or grant access.
    // Silently fail — the DENY decision was already made by the caller.
    console.error('[security-event] Failed to log security event:', error);
  }
}
