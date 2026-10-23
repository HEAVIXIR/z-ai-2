/**
 * HEAVIX — STEP 15.71: Pure helpers for dry-run script
 *
 * Extracted from scripts/rbac-backfill-dryrun.ts so that unit tests
 * can import and test the REAL implementation, not a duplicated copy.
 *
 * These functions are pure (no DB access, no side effects).
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
 * Example: "postgresql://user:p@ss:w0rd@host:5432/db?schema=public"
 *       → "postgresql://***@host:5432/db?schema=public"
 */
export function sanitizeConnectionString(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.username = '';
    parsed.password = '';
    return parsed.toString().replace(/\/\/@/, '/***@');
  } catch {
    return '<unable to parse connection string — possible malformed URL>';
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
