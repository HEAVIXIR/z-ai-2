/* ────────────────────────────────────────────────────────────────────────
 * HEAVIX — STEP 15.88 — Real TLS Behavioral Proof (Finding D)
 *
 * Task ID: STEP-15.88-TLS-PROOF
 *
 * WHAT THIS IS
 *   A behavioral TLS test that connects to REAL TLS-enabled PostgreSQL 17
 *   servers via TWO connection paths and documents exactly what each enforces:
 *
 *   (A) The REAL PRISMA connection path (PrismaClient → Rust query engine → TLS)
 *   (B) The libpq/psql reference path (the standard PostgreSQL TLS implementation)
 *
 *   This dual-path approach is REQUIRED because the two paths behave DIFFERENTLY
 *   for sslmode=verify-full — a finding that has direct governance implications
 *   for Finding D (server identity verification).
 *
 * ─── FINDING (discovered during STEP 15.88) ───────────────────────────────
 *
 *   PRISMA 6.19.3's query engine establishes TLS (proven by the server log:
 *   "SSL enabled (protocol=TLSv1.3, cipher=TLS_AES_256_GCM_SHA384)"), BUT it
 *   does NOT enforce CA validation or hostname verification even when:
 *     • the connection URL contains `sslmode=verify-full`
 *     • the connection URL contains `sslrootcert=<path>`
 *     • the PGSSLROOTCERT env var is set
 *
 *   PROOF: a probe with `sslrootcert=/nonexistent/ca.crt` (a file that does
 *   not exist) and `sslmode=verify-full` SUCCEEDS. If Prisma read sslrootcert,
 *   the connection would fail with "file not found". It does not — Prisma
 *   accepts the server's TLS cert without validating it against any CA.
 *
 *   This means a man-in-the-middle attacker could present ANY certificate
 *   (even a self-signed one) and Prisma would accept the connection. The
 *   `sslmode=verify-full` parameter in the Prisma connection string is, in
 *   practice, treated like `sslmode=require` (TLS encryption without identity
 *   verification).
 *
 *   By contrast, libpq/psql (the reference PostgreSQL client) CORRECTLY enforces
 *   sslmode=verify-full: it rejects untrusted CAs, hostname mismatches, and
 *   expired certificates.
 *
 *   ─── GOVERNANCE IMPLICATION ──────────────────────────────────────────────
 *   Finding D (server identity verification) CANNOT be closed by relying on
 *   `sslmode=verify-full` in the Prisma connection string alone. The preflight
 *   script's string check (`sslmode=verify-full` present in DATABASE_URL) is
 *   NECESSARY but NOT SUFFICIENT: it does not guarantee that the actual
 *   Prisma connection verifies the server's identity.
 *
 *   To truly close Finding D, the connection path must be changed to one that
 *   enforces full TLS verification — options include:
 *     1. Upgrade Prisma to a version that correctly enforces verify-full (if
 *        such a version exists; verify before assuming the upgrade fixes it)
 *     2. Use a TLS-terminating proxy (e.g., stunnel, PgBouncer with TLS) that
 *        validates the server cert and re-presents a verified connection
 *     3. Replace the Prisma connection path with a libpq-based driver (e.g.,
 *        `pg` / node-postgres) that respects sslmode=verify-full + sslrootcert
 *
 *   This test suite documents the finding honestly. The Prisma-path tests
 *   assert Prisma's ACTUAL behavior (including the limitation). The libpq-path
 *   tests assert the REFERENCE correct behavior. Both must pass for the
 *   evidence to be complete.
 *
 * ─── INFRASTRUCTURE REQUIREMENT ────────────────────────────────────────────
 *   TWO real PostgreSQL 17 servers with TLS:
 *     - VALID cluster  : port 5433, cert CN=localhost, SAN=DNS:localhost,
 *                       signed by a trusted CA, NOT expired
 *     - EXPIRED cluster: port 5434, cert signed by the SAME trusted CA,
 *                       but notAfter is in the PAST (already expired)
 *   Both have pg_hba.conf set to `hostssl` (no plaintext `host` lines).
 *
 *   When this infrastructure is NOT available, every test SKIPS. The suite
 *   NEVER passes without real TLS servers. Honesty over false-green.
 *
 * RUN
 *   HEAVIX_TLS_PROOF_RUN=1 \
 *   HEAVIX_TLS_CERT_DIR=/path/to/certs \
 *   bunx vitest run tests/integration/rbac-tls-behavioral-real.test.ts
 *
 * ──────────────────────────────────────────────────────────────────────── */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import * as net from 'node:net';

// ─── Infrastructure discovery ────────────────────────────────────────────
const CERT_DIR =
  process.env.HEAVIX_TLS_CERT_DIR ?? '/home/z/z-ai-2/.tls-pg/certs';
const VALID_PORT = Number(process.env.HEAVIX_TLS_VALID_PORT ?? 5433);
const EXPIRED_PORT = Number(process.env.HEAVIX_TLS_EXPIRED_PORT ?? 5434);
const PG_ENV = '/home/z/z-ai-2/.tls-pg/pg-env.sh';

const CA_VALID = `${CERT_DIR}/ca-valid.crt`;
const CA_UNTRUSTED = `${CERT_DIR}/ca-untrusted.crt`;

function portListening(port: number, host = '127.0.0.1'): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    sock.setTimeout(1500);
    sock.once('connect', () => {
      sock.destroy();
      resolve(true);
    });
    sock.once('error', () => {
      sock.destroy();
      resolve(false);
    });
    sock.once('timeout', () => {
      sock.destroy();
      resolve(false);
    });
    sock.connect(port, host);
  });
}

// Top-level infrastructure detection so it.skipIf sees the real value.
const PROOF_RUN = process.env.HEAVIX_TLS_PROOF_RUN === '1';
const _validUp = PROOF_RUN ? await portListening(VALID_PORT) : false;
const _expiredUp = PROOF_RUN ? await portListening(EXPIRED_PORT) : false;
const _psqlExists = existsSync(
  '/home/z/z-ai-2/.tls-pg/pg-root/usr/lib/postgresql/17/bin/psql',
);
const _certsPresent =
  PROOF_RUN &&
  existsSync(CA_VALID) &&
  existsSync(CA_UNTRUSTED) &&
  readFileSync(CA_VALID, 'utf8').includes('BEGIN CERTIFICATE');
const INFRA_AVAILABLE =
  PROOF_RUN && _validUp && _expiredUp && _certsPresent && _psqlExists;

if (PROOF_RUN && !INFRA_AVAILABLE) {
   
  console.warn(
    `[rbac-tls-behavioral-real] SKIP: proofRun=${PROOF_RUN} validUp=${_validUp} expiredUp=${_expiredUp} certsPresent=${_certsPresent} psqlExists=${_psqlExists}`,
  );
}

// ─── Helper: spawn the TLS probe subprocess (Prisma path) ───────────────────
function prismaProbe(
  databaseUrl: string,
  pgsslrootcert: string,
): { success: boolean; raw: string } {
  const r = spawnSync('bunx', ['tsx', 'tests/integration/tls-probe.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PROBE_DATABASE_URL: databaseUrl,
      PGSSLROOTCERT: pgsslrootcert,
    },
    encoding: 'utf8',
    timeout: 45_000,
  });
  const combined = `${r.stdout ?? ''}\n${r.stderr ?? ''}`;
  return {
    success: combined.includes('PROBE_RESULT=SUCCESS'),
    raw: combined,
  };
}

// ─── Helper: run psql (libpq reference path) ────────────────────────────────
function psqlProbe(connParams: string): { success: boolean; raw: string } {
  // Source pg-env.sh so psql + LD_LIBRARY_PATH are available, then run psql.
  const cmd = `source ${PG_ENV} && PGPASSWORD=readonly_pass psql "${connParams}" -c "SELECT 1 AS proof;" 2>&1`;
  const r = spawnSync('bash', ['-c', cmd], {
    encoding: 'utf8',
    timeout: 30_000,
  });
  const combined = `${r.stdout ?? ''}\n${r.stderr ?? ''}`;
  // psql returns exit 0 and prints the row on success.
  const success = r.status === 0 && combined.includes('proof');
  return { success, raw: combined };
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION A — REAL PRISMA CONNECTION PATH (actual behavior, including the
// sslmode=verify-full CA/hostname limitation discovered in STEP 15.88)
// ═══════════════════════════════════════════════════════════════════════════
describe('STEP 15.88 — Section A: Prisma connection path TLS behavior', () => {
  it.skipIf(!INFRA_AVAILABLE)(
    'PRISMA-1. VALID TLS (correct CA + correct hostname + valid cert) → SUCCESS',
    async () => {
      const url =
        `postgresql://heavix_dryrun_ro:readonly_pass@localhost:${VALID_PORT}/postgres` +
        `?schema=public&sslmode=verify-full&sslrootcert=${CA_VALID}`;
      const r = prismaProbe(url, CA_VALID);
      expect(r.success, `Valid TLS must succeed via Prisma.\n${r.raw}`).toBe(true);
    },
  );

  it.skipIf(!INFRA_AVAILABLE)(
    'PRISMA-2. UNTRUSTED CA via Prisma → ACCEPTED (DOCUMENTED LIMITATION, not a security guarantee)',
    async () => {
      // FINDING: Prisma 6.19.3 accepts a server cert even when the client
      // provides an UNTRUSTED CA (a different CA that did not sign the server
      // cert). This proves Prisma does NOT enforce CA validation for
      // sslmode=verify-full. This test ASSERTS the limitation (documents it)
      // rather than the desired security behavior. See the libpq section for
      // the reference correct behavior.
      const url =
        `postgresql://heavix_dryrun_ro:readonly_pass@localhost:${VALID_PORT}/postgres` +
        `?schema=public&sslmode=verify-full&sslrootcert=${CA_UNTRUSTED}`;
      const r = prismaProbe(url, CA_UNTRUSTED);
      // We EXPECT Prisma to (incorrectly) succeed here — this is the finding.
      // If a future Prisma version fixes this, this test will FAIL, which is
      // the desired signal to update the finding.
      expect(
        r.success,
        `Prisma unexpectedly REJECTED the untrusted CA (this is GOOD — it means ` +
          `Prisma now enforces CA validation; update this test and the Finding D ` +
          `report). Probe output:\n${r.raw}`,
      ).toBe(true);
    },
  );

  it.skipIf(!INFRA_AVAILABLE)(
    'PRISMA-3. HOSTNAME MISMATCH via Prisma → ACCEPTED (DOCUMENTED LIMITATION)',
    async () => {
      // FINDING: Prisma accepts a cert whose CN/SAN does not match the connect
      // hostname (cert is for "localhost", client connects via "127.0.0.1").
      // This proves Prisma does NOT enforce hostname verification for
      // sslmode=verify-full.
      const url =
        `postgresql://heavix_dryrun_ro:readonly_pass@127.0.0.1:${VALID_PORT}/postgres` +
        `?schema=public&sslmode=verify-full&sslrootcert=${CA_VALID}`;
      const r = prismaProbe(url, CA_VALID);
      expect(
        r.success,
        `Prisma unexpectedly REJECTED the hostname mismatch (this is GOOD — it ` +
          `means Prisma now enforces hostname verification; update this test and ` +
          `the Finding D report). Probe output:\n${r.raw}`,
      ).toBe(true);
    },
  );

  it.skipIf(!INFRA_AVAILABLE)(
    'PRISMA-4. EXPIRED CERT via Prisma → REJECTED',
    async () => {
      // Prisma DOES reject expired certs (basic cert validity is checked by
      // the TLS library regardless of CA validation).
      const url =
        `postgresql://heavix_dryrun_ro:readonly_pass@localhost:${EXPIRED_PORT}/postgres` +
        `?schema=public&sslmode=verify-full&sslrootcert=${CA_VALID}`;
      const r = prismaProbe(url, CA_VALID);
      expect(
        r.success,
        `Expired cert must be REJECTED via Prisma (basic TLS validity check).\n${r.raw}`,
      ).toBe(false);
    },
  );

  it.skipIf(!INFRA_AVAILABLE)(
    'PRISMA-5. NO TLS (sslmode=disable) via Prisma → REJECTED by server (hostssl)',
    async () => {
      const url =
        `postgresql://heavix_dryrun_ro:readonly_pass@localhost:${VALID_PORT}/postgres` +
        `?schema=public&sslmode=disable`;
      const r = prismaProbe(url, CA_VALID);
      expect(
        r.success,
        `No-TLS connection must be REJECTED by the server (hostssl).\n${r.raw}`,
      ).toBe(false);
    },
  );

  it.skipIf(!INFRA_AVAILABLE)(
    'PRISMA-6. sslrootcert=NONEXISTENT via Prisma → ACCEPTED (proves Prisma ignores sslrootcert)',
    async () => {
      // The DEFINITIVE proof that Prisma does not read sslrootcert: point it
      // at a file that does not exist. If Prisma read sslrootcert, the
      // connection would fail with "file not found". It succeeds, proving
      // Prisma ignores the param and does not perform CA validation.
      const url =
        `postgresql://heavix_dryrun_ro:readonly_pass@localhost:${VALID_PORT}/postgres` +
        `?schema=public&sslmode=verify-full&sslrootcert=/nonexistent/ca.crt`;
      const r = prismaProbe(url, '/nonexistent/ca.crt');
      expect(
        r.success,
        `Prisma unexpectedly FAILED with a nonexistent sslrootcert (this is GOOD — ` +
          `it means Prisma now reads sslrootcert; update this test and the Finding D ` +
          `report). Probe output:\n${r.raw}`,
      ).toBe(true);
    },
  );

  it.skipIf(!INFRA_AVAILABLE)(
    'PRISMA-7. PREFLIGHT script gets PAST TLS check and connects over TLS via Prisma',
    async () => {
      const env = {
        ...process.env,
        DATABASE_URL:
          `postgresql://heavix_dryrun_ro:readonly_pass@localhost:${VALID_PORT}/postgres` +
          `?schema=public&sslmode=verify-full&sslrootcert=${CA_VALID}`,
        PGSSLROOTCERT: CA_VALID,
        DRYRUN_CONFIRM_TARGET: 'postgres',
        DRYRUN_EXPECTED_HOST: 'localhost',
      };
      const r = spawnSync(
        'bunx',
        ['tsx', 'scripts/rbac-backfill-dryrun.ts'],
        { cwd: process.cwd(), env, encoding: 'utf8', timeout: 60_000 },
      );
      const combined = `${r.stdout ?? ''}\n${r.stderr ?? ''}`;
      // Must pass the TLS string check
      expect(combined).toContain('sslmode=verify-full present');
      // Must pass hostname consistency
      expect(combined).toContain('Hostname consistency     : PASS');
      // Must resolve the trusted role (proves the preflight reached role logic)
      expect(combined).toContain('heavix_dryrun_ro');
      // Must actually connect over TLS — proven by reaching a Prisma query
      // that returns a real PostgreSQL error (42P01 = undefined_table, because
      // the fresh cluster has no User table).
      expect(combined).toMatch(/42P01|relation "public\.User"|public\.User/);
      // Must NOT contain a TLS/SSL handshake failure
      expect(combined).not.toMatch(
        /PREFLIGHT FAIL: DATABASE_URL does not use sslmode=verify-full/,
      );
    },
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// SECTION B — libpq/psql REFERENCE PATH (proves the TLS infrastructure is
// correct and that sslmode=verify-full CAN enforce full verification when
// the client implements it properly)
// ═══════════════════════════════════════════════════════════════════════════
describe('STEP 15.88 — Section B: libpq/psql reference TLS behavior', () => {
  it.skipIf(!INFRA_AVAILABLE)(
    'LIBPQ-1. VALID TLS (correct CA + correct hostname) → SUCCESS',
    async () => {
      const r = psqlProbe(
        `host=localhost port=${VALID_PORT} user=heavix_dryrun_ro dbname=postgres ` +
          `sslmode=verify-full sslrootcert=${CA_VALID}`,
      );
      expect(r.success, `Valid TLS must succeed via libpq.\n${r.raw}`).toBe(true);
    },
  );

  it.skipIf(!INFRA_AVAILABLE)(
    'LIBPQ-2. UNTRUSTED CA via libpq → REJECTED (certificate verify failed)',
    async () => {
      const r = psqlProbe(
        `host=localhost port=${VALID_PORT} user=heavix_dryrun_ro dbname=postgres ` +
          `sslmode=verify-full sslrootcert=${CA_UNTRUSTED}`,
      );
      expect(
        r.success,
        `Untrusted CA must be REJECTED by libpq (this is the CORRECT behavior that ` +
          `Prisma lacks). Output:\n${r.raw}`,
      ).toBe(false);
      // libpq surfaces a specific certificate verification error
      expect(r.raw).toMatch(/certificate verify failed|verify|SSL error/i);
    },
  );

  it.skipIf(!INFRA_AVAILABLE)(
    'LIBPQ-3. HOSTNAME MISMATCH via libpq → REJECTED',
    async () => {
      // cert is for "localhost", connect via "127.0.0.1" which is not in the SAN
      const r = psqlProbe(
        `host=127.0.0.1 port=${VALID_PORT} user=heavix_dryrun_ro dbname=postgres ` +
          `sslmode=verify-full sslrootcert=${CA_VALID}`,
      );
      expect(
        r.success,
        `Hostname mismatch must be REJECTED by libpq (this is the CORRECT behavior ` +
          `that Prisma lacks). Output:\n${r.raw}`,
      ).toBe(false);
      expect(r.raw).toMatch(/does not match|hostname|server certificate/i);
    },
  );

  it.skipIf(!INFRA_AVAILABLE)(
    'LIBPQ-4. EXPIRED CERT via libpq → REJECTED',
    async () => {
      const r = psqlProbe(
        `host=localhost port=${EXPIRED_PORT} user=heavix_dryrun_ro dbname=postgres ` +
          `sslmode=verify-full sslrootcert=${CA_VALID}`,
      );
      expect(
        r.success,
        `Expired cert must be REJECTED by libpq.\n${r.raw}`,
      ).toBe(false);
      expect(r.raw).toMatch(/certificate verify failed|expired|verify/i);
    },
  );

  it.skipIf(!INFRA_AVAILABLE)(
    'LIBPQ-5. NO TLS (sslmode=disable) via libpq → REJECTED by server (hostssl)',
    async () => {
      const r = psqlProbe(
        `host=localhost port=${VALID_PORT} user=heavix_dryrun_ro dbname=postgres ` +
          `sslmode=disable`,
      );
      expect(
        r.success,
        `No-TLS connection must be REJECTED by the server.\n${r.raw}`,
      ).toBe(false);
      expect(r.raw).toMatch(/no pg_hba|no encryption|encryption/i);
    },
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// SECTION C — FINDING D VERDICT
// ═══════════════════════════════════════════════════════════════════════════
describe('STEP 15.88 — Section C: Finding D verdict', () => {
  it.skipIf(!INFRA_AVAILABLE)(
    'VERDICT. Finding D (server identity) status after STEP 15.88 real TLS proof',
    async () => {
      // This is a documentation test — it does not connect. It exists to
      // record the Finding D verdict in the test output so reviewers see it.
      const verdict = {
        findingD: 'OPEN',
        reason:
          'Prisma 6.19.3 establishes TLS but does NOT enforce CA validation ' +
          'or hostname verification for sslmode=verify-full (proven by PRISMA-2, ' +
          'PRISMA-3, PRISMA-6). The preflight string check is necessary but not ' +
          'sufficient. The TLS infrastructure is correct (proven by LIBPQ-*), ' +
          'but the production connection path (Prisma) does not verify server ' +
          'identity. Remediation requires changing the connection path (Prisma ' +
          'upgrade that enforces verify-full, OR a TLS-terminating proxy, OR a ' +
          'libpq-based driver).',
        infrastructureProven: true,
        prismaEnforcesVerifyFull: false,
        libpqEnforcesVerifyFull: true,
      };
       
      console.log('FINDING_D_VERDICT=' + JSON.stringify(verdict));
      expect(verdict.findingD).toBe('OPEN');
      expect(verdict.prismaEnforcesVerifyFull).toBe(false);
      expect(verdict.libpqEnforcesVerifyFull).toBe(true);
    },
  );
});
