/**
 * HEAVIX — STEP 15.88: TEST-ONLY configuration for CI.
 *
 * This file is a COMPILE-TIME constant — NOT an environment variable.
 * It cannot be set by an operator in staging/production. The value is
 * hardcoded in the source code and only changes via code review.
 *
 * The production script (scripts/rbac-backfill-dryrun.ts) does NOT
 * import this file. Only test files import it. This ensures the test
 * bypass CANNOT affect the production path.
 *
 * WHY THIS EXISTS:
 *   CI uses postgres:17 Docker container without TLS. The production
 *   preflight requires sslmode=verify-full. Without this test-only
 *   constant, CI tests that run the preflight would fail because the
 *   CI DATABASE_URL doesn't have sslmode=verify-full.
 *
 *   The tests that need to run the dry-run script in CI use this
 *   constant to inject sslmode=verify-full into the DATABASE_URL
 *   before passing it to the script. This is a TEST HARNESS action,
 *   not a production bypass.
 *
 * SECURITY PROPERTIES:
 *   - NOT an environment variable — cannot be set by operators
 *   - NOT imported by the production script — only by test files
 *   - Requires code review to change — visible in the diff
 *   - Does not weaken the production path in any way
 */

/**
 * When true, test harnesses inject sslmode=verify-full into DATABASE_URL
 * before running the dry-run script. This simulates TLS for CI tests.
 *
 * NOTE: This does NOT prove actual TLS handshake validation. It only
 * allows the preflight's sslmode CHECK to pass in CI. Actual TLS
 * behavior (CA validation, hostname verification) is NOT tested by CI
 * — it requires a TLS-enabled PostgreSQL server.
 *
 * Finding D remains UNVERIFIED until actual TLS handshake validation
 * is proven against a real TLS-enabled PostgreSQL server.
 */
export const TEST_ONLY_SKIP_TLS_CHECK = true;
