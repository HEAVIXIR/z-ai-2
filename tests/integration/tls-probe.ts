/* ────────────────────────────────────────────────────────────────────────
 * HEAVIX — STEP 15.88 — TLS Probe (subprocess helper)
 *
 * A minimal script that connects to a PostgreSQL server via the REAL Prisma
 * connection path (PrismaClient → Rust query engine → TLS) and prints
 * PROBE_RESULT=SUCCESS or PROBE_RESULT=FAILURE with the error.
 *
 * Run as a SUBPROCESS so each TLS scenario gets a fresh Prisma query engine
 * that reads PGSSLROOTCERT and the connection-string sslmode/sslrootcert
 * independently (Prisma's query engine is a singleton per-process and does
 * not re-read env vars after the first client is created).
 *
 * Env:
 *   PROBE_DATABASE_URL — full Prisma connection string (incl. sslmode, sslrootcert)
 *   PGSSLROOTCERT      — path to the CA cert (read by Prisma's query engine)
 *
 * Output:
 *   PROBE_RESULT=SUCCESS        (exit 0) — TLS handshake + query succeeded
 *   PROBE_RESULT=FAILURE        (exit 1) — connection/query rejected
 *   PROBE_ERROR=<message>       — the raw error (for diagnostic logging only)
 *   PROBE_EXIT_CODE=<n>         — the process exit code
 *
 * ──────────────────────────────────────────────────────────────────────── */
import { PrismaClient } from '@prisma/client';

async function main(): Promise<void> {
  const url = process.env.PROBE_DATABASE_URL;
  if (!url) {
    console.log('PROBE_RESULT=FAILURE');
    console.log('PROBE_ERROR=PROBE_DATABASE_URL is not set');
    process.exit(2);
  }

  const prisma = new PrismaClient({
    datasources: { db: { url } },
    log: ['error', 'warn'],
  });

  try {
    await prisma.$queryRaw`SELECT 1 as proof`;
    console.log('PROBE_RESULT=SUCCESS');
    await prisma.$disconnect();
    process.exit(0);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log('PROBE_RESULT=FAILURE');
    // Print the full message so the parent test can inspect it (Prisma wraps
    // TLS errors in generic "User was denied access" messages, but the presence
    // of FAILURE is the security-relevant signal).
    console.log(`PROBE_ERROR=${msg.replace(/\n/g, ' ').slice(0, 500)}`);
    await prisma.$disconnect().catch(() => {});
    process.exit(1);
  }
}

main().catch((e) => {
  console.log('PROBE_RESULT=FAILURE');
  console.log(`PROBE_ERROR=unhandled: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
