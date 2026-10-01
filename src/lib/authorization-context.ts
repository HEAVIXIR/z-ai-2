/**
 * HEAVIX — V-A AuthorizationContext (Directive 49.2X-07)
 *
 * Standard context for passing authorization identity to trusted services.
 * This is NOT just an alias for userId — it carries the information
 * needed for service-level authorization re-checks.
 *
 * ASVS V8.3.1: authorization must be enforced in a trusted service layer.
 * ASVS V8.3.3: uses the original subject's permissions, not the
 * intermediary service's permissions.
 */

export interface AuthorizationContext {
  /** The original requesting subject (user ID or 'ADMIN' for admin-cookie sessions) */
  subjectId: string;
  /** Session identifier for correlation (if available) */
  sessionId?: string | null;
  /** Authentication method used */
  authenticationMethod: 'session' | 'admin-cookie';
  /** Request ID for correlation with logs */
  requestId?: string | null;
}

/**
 * Create an AuthorizationContext from a user object (from getCurrentUser()).
 */
export function createAuthContext(
  userId: string,
  options?: {
    sessionId?: string | null;
    authenticationMethod?: 'session' | 'admin-cookie';
    requestId?: string | null;
  },
): AuthorizationContext {
  return {
    subjectId: userId,
    sessionId: options?.sessionId ?? null,
    authenticationMethod: options?.authenticationMethod ?? 'session',
    requestId: options?.requestId ?? null,
  };
}
