/**
 * HEAVIX — STEP 15.71 / 15.72: Pure helpers for dry-run script
 *
 * Extracted from scripts/rbac-backfill-dryrun.ts so that unit tests
 * can import and test the REAL implementation, not a duplicated copy.
 *
 * These functions are pure (no DB access, no side effects).
 *
 * STEP 15.72 addendum (Finding 2, 4, 5):
 *   - TRUSTED_READONLY_ROLE_ALLOWLIST — fixed allowlist of trusted role names
 *   - resolveTrustedRole() — validates DRYRUN_EXPECTED_ROLE against the allowlist
 *   - extractHost() — parses host from DATABASE_URL for server identity checks
 *   - categorizeDbError() — returns a safe categorized diagnostic (no raw text)
 *   - redactConnectionDetails() — defensive redaction for any text that may
 *     contain URLs (used in catch blocks alongside categorizeDbError)
 */

export const CANONICAL_ROLE_KEYS = ['ADMIN', 'SELLER', 'BUYER', 'MODERATOR', 'SUPPORT'] as const;
export type CanonicalRoleKey = typeof CANONICAL_ROLE_KEYS[number];

const LEGACY_ROLE_MAP: Record<string, CanonicalRoleKey> = {
  ADMIN: 'ADMIN',
  SUPERADMIN: 'ADMIN',
  SELLER: 'SELLER',
  BUYER: 'BUYER',
  MODERATOR: 'MODERATOR',
  SUPPORT: 'SUPPORT',
};

/**
 * STEP 15.72 Finding 2: Fixed allowlist of trusted read-only role names.
 *
 * This constant is defined OUTSIDE caller-controlled runtime environment so
 * that an operator cannot elevate privileges by setting DRYRUN_EXPECTED_ROLE
 * to an arbitrary value. Only role names present in this list are accepted
 * by resolveTrustedRole().
 *
 * Currently the only trusted identity is `heavix_dryrun_ro`, the role created
 * by `scripts/rbac-create-readonly-role.sql` with explicit GRANT SELECT +
 * REVOKE of all write privileges.
 */
export const TRUSTED_READONLY_ROLE_ALLOWLIST = ['heavix_dryrun_ro'] as const;
export type TrustedReadonlyRole = typeof TRUSTED_READONLY_ROLE_ALLOWLIST[number];

/**
 * STEP 15.72 Finding 2: Resolve the trusted read-only role name.
 *
 * Validates the caller-supplied DRYRUN_EXPECTED_ROLE against a fixed
 * allowlist configured OUTSIDE the caller-controlled runtime environment.
 * If the supplied value is not in the allowlist, the function fails closed
 * (returns null) — the preflight must abort in that case.
 *
 * Behavior:
 *   - undefined / null / empty / whitespace-only → defaults to 'heavix_dryrun_ro'
 *     (which is in the allowlist, so this is a safe default)
 *   - value present and in allowlist → returns the trimmed value
 *   - value present but NOT in allowlist → returns null (fail closed)
 *
 * This function is pure — no DB access, no side effects, no env reads.
 */
export function resolveTrustedRole(
  expectedRole: string | undefined | null,
): TrustedReadonlyRole | null {
  const trimmed = (expectedRole ?? '').trim();
  const candidate = trimmed === '' ? 'heavix_dryrun_ro' : trimmed;
  if (TRUSTED_READONLY_ROLE_ALLOWLIST.includes(candidate as TrustedReadonlyRole)) {
    return candidate as TrustedReadonlyRole;
  }
  return null;
}

/**
 * Map a legacy User.role value to a canonical Role.key.
 * Returns null for unrecognized values (INVALID classification).
 *
 * Edge cases:
 *   - null/undefined → 'BUYER' (per design doc default fallback)
 *   - empty string → 'BUYER' (defensive)
 *   - whitespace-only → 'BUYER' (defensive)
 *   - SUPERADMIN → 'ADMIN' (legacy alias)
 *   - Case-insensitive matching
 *   - Unknown values → null (INVALID)
 */
export function mapLegacyRole(legacy: string | null | undefined): CanonicalRoleKey | null {
  if (legacy === null || legacy === undefined) return 'BUYER';
  const upper = legacy.toUpperCase().trim();
  if (upper === '') return 'BUYER';
  if (CANONICAL_ROLE_KEYS.includes(upper as CanonicalRoleKey)) return upper as CanonicalRoleKey;
  if (LEGACY_ROLE_MAP[upper]) return LEGACY_ROLE_MAP[upper];
  return null;
}

/**
 * Sanitize a PostgreSQL connection string for safe display.
 * Strips ALL credential information (username AND password) and keeps
 * only scheme/host/port/db for operator verification.
 * STEP 15.71 Phase A: robust URL parsing that handles passwords
 * containing reserved characters (@, :, /, ?, #, %).
 *
 * STEP 15.72 Finding 1: On parse failure, return a FIXED generic message —
 * do NOT print any fragment of the input (no sanitized URL fragments,
 * no host, no db name, no scheme). A fixed generic message guarantees
 * that no password fragment can leak through a malformed URL.
 *
 * Example: "postgresql://user:p@ss:w0rd@host:5432/db?schema=public"
 *       → "postgresql://***@host:5432/db?schema=public"
 *
 * Malformed: "not-a-valid-url" → "<unable to parse connection string>"
 *   (no input fragments, no parsed components, no scheme)
 */
export function sanitizeConnectionString(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.username = '';
    parsed.password = '';
    return parsed.toString().replace(/\/\/@/, '/***@');
  } catch {
    // STEP 15.72 Finding 1: fixed generic message — never print ANY sanitized URL
    // fragment on parse failure (no host, no db, no scheme).
    return '<unable to parse connection string>';
  }
}

/**
 * Extract the database name from a connection string for target confirmation.
 * Returns the `dbname` path segment, or null if unparseable.
 */
export function extractDbName(url: string): string | null {
  try {
    const parsed = new URL(url);
    // pathname is like "/dbname" or "/dbname?schema=public"
    const pathname = parsed.pathname;
    if (!pathname || pathname === '/') return null;
    return decodeURIComponent(pathname.slice(1).split('?')[0]);
  } catch {
    return null;
  }
}

/**
 * STEP 15.72 Finding 4: Extract the host from a connection string.
 *
 * Used for server/cluster identity verification — the preflight compares
 * the parsed host with DRYRUN_EXPECTED_HOST (operator-declared) and with
 * the live `inet_server_addr()` result (DNS-resolved) to detect proxy /
 * MITM scenarios where the connection lands on the wrong server.
 *
 * Returns the hostname (no port, no credentials, no scheme), or null if
 * unparseable. IPv4 and IPv6 hostnames are both returned verbatim.
 *
 * Example: "postgresql://user:pass@db.example.com:5432/heavix?schema=public"
 *       → "db.example.com"
 *
 * Example: "postgresql://user:pass@127.0.0.1:5432/heavix"
 *       → "127.0.0.1"
 */
export function extractHost(url: string): string | null {
  try {
    const parsed = new URL(url);
    // parsed.hostname is automatically lowercased and excludes the port.
    // It also strips surrounding brackets from IPv6 literals (e.g. [::1] → ::1).
    return parsed.hostname || null;
  } catch {
    return null;
  }
}

/**
 * STEP 15.72 Finding 5: Categorize a database error for safe display.
 *
 * Replaces the previous pattern of `console.error(err)` /
 * `console.error(rawMsg)` which either:
 *   - leaked raw error text (which may contain connection strings / hosts /
 *     role names — credential exposure risk), OR
 *   - was sanitized via sanitizeConnectionString(rawMsg) which returned a
 *     generic "unable to parse" message for ALL Prisma errors (which
 *     obscured the actual failure cause from operators).
 *
 * categorizeDbError() inspects the error's message (without ever printing
 * the raw text) and returns a fixed safe message + a category enum. This
 * lets operators distinguish failure types (auth vs connection vs permission)
 * without credential exposure.
 *
 * Categories:
 *   - CONNECTION_REFUSED — can't reach the database host
 *   - AUTHENTICATION_FAILED — wrong credentials / role doesn't exist
 *   - DATABASE_NOT_FOUND — db doesn't exist on the server
 *   - PERMISSION_DENIED — role lacks required privileges
 *   - UNKNOWN — uncategorized (no raw error text shown)
 *
 * Pure function — no side effects. Never throws.
 */
export type DbErrorCategory =
  | 'CONNECTION_REFUSED'
  | 'AUTHENTICATION_FAILED'
  | 'DATABASE_NOT_FOUND'
  | 'PERMISSION_DENIED'
  | 'UNKNOWN';

export interface CategorizedDbError {
  category: DbErrorCategory;
  message: string;
}

export function categorizeDbError(err: unknown): CategorizedDbError {
  // Defensive: never throw — categorization must always produce a result.
  let raw = '';
  try {
    raw = err instanceof Error ? err.message : String(err ?? '');
  } catch {
    raw = '';
  }
  const lower = raw.toLowerCase();

  // CONNECTION_REFUSED — host unreachable, port closed, network error.
  // Prisma code P1001, Node ECONNREFUSED / ETIMEDOUT / ENOTFOUND.
  if (
    lower.includes('p1001') ||
    lower.includes('econnrefused') ||
    lower.includes('connection refused') ||
    lower.includes("can't reach database server") ||
    lower.includes('connect etimedout') ||
    lower.includes('getaddrinfo enotfound') ||
    lower.includes('connection terminated') ||
    lower.includes('connection timeout') ||
    lower.includes('timed out')
  ) {
    return {
      category: 'CONNECTION_REFUSED',
      message:
        'Database connection refused — host unreachable or not listening on the expected port. Verify host, port, network connectivity, and firewall rules.',
    };
  }

  // AUTHENTICATION_FAILED — wrong password, role doesn't exist, etc.
  // Prisma code P1000, PostgreSQL SQLSTATE 28P01 / 28000.
  if (
    lower.includes('p1000') ||
    lower.includes('authentication failed') ||
    lower.includes('password authentication failed') ||
    lower.includes('28p01') ||
    lower.includes('28000') ||
    (lower.includes('role') && lower.includes('does not exist'))
  ) {
    return {
      category: 'AUTHENTICATION_FAILED',
      message:
        'Database authentication failed — invalid role name or password. Verify DATABASE_URL credentials and that the role exists on the target server.',
    };
  }

  // DATABASE_NOT_FOUND — db name doesn't exist on the server.
  // Prisma code P1003, PostgreSQL SQLSTATE 3D000.
  if (
    lower.includes('p1003') ||
    lower.includes('3d000') ||
    (lower.includes('database') && lower.includes('does not exist'))
  ) {
    return {
      category: 'DATABASE_NOT_FOUND',
      message:
        'Database not found — the database name does not exist on the server. Verify DRYRUN_CONFIRM_TARGET matches a real database name on the expected host.',
    };
  }

  // PERMISSION_DENIED — role lacks required privileges for the operation.
  // PostgreSQL SQLSTATE 42501 / 42502 etc.
  if (
    lower.includes('permission denied') ||
    lower.includes('42501') ||
    lower.includes('insufficient privilege') ||
    lower.includes('must be owner') ||
    lower.includes('must have') ||
    lower.includes('access denied') ||
    lower.includes('permission denied for')
  ) {
    return {
      category: 'PERMISSION_DENIED',
      message:
        'Database permission denied — the role lacks required privileges for this operation. Verify the read-only role has SELECT on pg_catalog and all RBAC tables, and that no write privilege is held.',
    };
  }

  // UNKNOWN — uncategorized. Do not return any raw error text.
  return {
    category: 'UNKNOWN',
    message:
      'An uncategorized database error occurred. No raw error text is shown to prevent credential leakage. Check server-side logs for the underlying cause.',
  };
}

/**
 * STEP 15.72 Finding 5: Defensive redaction for any text that may contain
 * connection strings.
 *
 * Used alongside categorizeDbError() in catch blocks where the error object
 * might be coerced to a string (e.g., `Error: ... postgresql://user:pw@host`).
 * Replaces any `postgresql://...` or `postgres://...` URL pattern with a fixed
 * placeholder so no host, port, db name, or query string fragment leaks.
 *
 * This is a defensive layer — categorizeDbError() never returns raw text,
 * but if a future code path prints an Error object's `.stack` or `.cause`,
 * this redaction ensures connection strings are masked.
 *
 * Pure function — no side effects. Never throws.
 */
export function redactConnectionDetails(text: string): string {
  // Match postgresql:// or postgres:// URLs up to the next whitespace or quote.
  // Replace with a fixed placeholder that leaks no host/port/db/credentials.
  return text.replace(
    /(postgresql|postgres):\/\/[^\s"'<>]+/gi,
    '<redacted:connection-string>',
  );
}
