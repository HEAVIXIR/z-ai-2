/**
 * Guard for scripts that create synthetic phase/test fixtures.
 *
 * These scripts use the application Prisma client and DATABASE_URL, so
 * a mistaken invocation can write test users/listings/payments into a
 * real database. Require an explicit opt-in, non-production runtime,
 * a loopback DB host, and a database name ending in "_test".
 */
export function assertTestSeedTarget(scriptName: string): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error(`[${scriptName}] Refusing to seed test fixtures in NODE_ENV=production.`);
  }

  if (process.env.HEAVIX_ALLOW_TEST_FIXTURE_SEED !== "1") {
    throw new Error(
      `[${scriptName}] Refusing to seed fixtures without HEAVIX_ALLOW_TEST_FIXTURE_SEED=1.`,
    );
  }

  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl) {
    throw new Error(`[${scriptName}] DATABASE_URL is required.`);
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`[${scriptName}] DATABASE_URL is not a valid URL.`);
  }

  const host = parsed.hostname.toLowerCase();
  const allowedHosts = new Set(["localhost", "127.0.0.1", "::1", "postgres"]);
  if (!allowedHosts.has(host)) {
    throw new Error(
      `[${scriptName}] Refusing non-local database host "${host}" for test fixtures.`,
    );
  }

  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
  if (!/_test$/i.test(databaseName)) {
    throw new Error(
      `[${scriptName}] Refusing database "${databaseName}"; test fixture database names must end in "_test".`,
    );
  }
}
