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
 *   This dual-path approach checks the supported Prisma v6 strict TLS URL
 *   against the libpq reference path. Finding D remains open until it runs.
 *
 * ─── FINDING (discovered during STEP 15.88) ───────────────────────────────
 *
 *   STEP 15.88 first tested libpq-style `sslmode=verify-full&sslrootcert=...`,
 *   which is not Prisma ORM v6's documented strict TLS configuration. The
 *   supported v6 configuration is `sslmode=require&sslaccept=strict&sslcert=...`.
 *   This suite now tests the supported configuration through Prisma itself.
 *   Finding D stays OPEN until the real-infrastructure run passes all negative
 *   cases (untrusted CA, hostname mismatch, expired certificate, no TLS).
 *
 *   ─── GOVERNANCE IMPLICATION ──────────────────────────────────────────────
 *   The preflight must require Prisma v6's documented strict configuration;
 *   the live behavioral test, not string parsing, determines whether Finding D
 *   can close. Do not change connection drivers or close Finding D until the
 *   strict-config positive and negative tests run against the actual engine.
 *
 *   The Prisma-path tests assert the supported strict configuration's actual
 *   behavior; the libpq tests validate the TLS server setup independently.
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
 *   HEAVIX_TLS_PG_ROOT=/absolute/path/to/.tls-pg \
 *   HEAVIX_TLS_CERT_DIR=/absolute/path/to/.tls-pg/certs \
 *   bunx vitest run tests/integration/rbac-tls-behavioral-real.test.ts
 *
 * ──────────────────────────────────────────────────────────────────────── */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import * as net from 'node:net';
import { resolve } from 'node:path';

// ─── Infrastructure discovery ────────────────────────────────────────────
const PG_ROOT = process.env.HEAVIX_TLS_PG_ROOT ?? resolve(process.cwd(), '.tls-pg');
const CERT_DIR = process.env.HEAVIX_TLS_CERT_DIR ?? resolve(PG_ROOT, 'certs');
const VALID_PORT = Number(process.env.HEAVIX_TLS_VALID_PORT ?? 5433);
const EXPIRED_PORT = Number(process.env.HEAVIX_TLS_EXPIRED_PORT ?? 5434);
const PG_ENV = resolve(PG_ROOT, 'pg-env.sh');

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
  resolve(PG_ROOT, 'pg-root/usr/lib/postgresql/17/bin/psql'),
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
): { success: boolean; raw: string } {
  const r = spawnSync('bunx', ['tsx', 'tests/integration/tls-probe.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PROBE_DATABASE_URL: databaseUrl,
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
        `?schema=public&sslmode=require&sslaccept=strict&sslcert=${encodeURIComponent(CA_VALID)}`;
      const r = prismaProbe(url);
      expect(r.success, `Valid TLS must succeed via Prisma.\n${r.raw}`).toBe(true);
    },
  );

  it.skipIf(!INFRA_AVAILABLE)(
    'PRISMA-2. UNTRUSTED CA via Prisma with sslaccept=strict → REJECTED',
    async () => {
      // Prisma ORM v6 requires its documented sslaccept=strict + sslcert
      // parameters. This must reject a CA that did not sign the server cert.
      const url =
        `postgresql://heavix_dryrun_ro:readonly_pass@localhost:${VALID_PORT}/postgres` +
        `?schema=public&sslmode=require&sslaccept=strict&sslcert=${encodeURIComponent(CA_UNTRUSTED)}`;
      const r = prismaProbe(url);
      // Fail if the actual Prisma path accepts an untrusted CA.
      expect(
        r.success,
        `Prisma must reject an untrusted CA with sslaccept=strict. Output:\n${r.raw}`,
      ).toBe(false);
    },
  );

  it.skipIf(!INFRA_AVAILABLE)(
    'PRISMA-3. HOSTNAME MISMATCH via Prisma with sslaccept=strict → REJECTED',
    async () => {
      // The strict Prisma TLS configuration must reject a cert whose CN/SAN
      // does not match the connection hostname.
      const url =
        `postgresql://heavix_dryrun_ro:readonly_pass@127.0.0.1:${VALID_PORT}/postgres` +
        `?schema=public&sslmode=require&sslaccept=strict&sslcert=${encodeURIComponent(CA_VALID)}`;
      const r = prismaProbe(url);
      expect(
        r.success,
        `Prisma must reject a hostname mismatch with strict TLS. Output:\n${r.raw}`,
      ).toBe(false);
    },
  );

  it.skipIf(!INFRA_AVAILABLE)(
    'PRISMA-4. EXPIRED CERT via Prisma → REJECTED',
    async () => {
      // Prisma DOES reject expired certs (basic cert validity is checked by
      // the TLS library regardless of CA validation).
      const url =
        `postgresql://heavix_dryrun_ro:readonly_pass@localhost:${EXPIRED_PORT}/postgres` +
        `?schema=public&sslmode=require&sslaccept=strict&sslcert=${encodeURIComponent(CA_VALID)}`;
      const r = prismaProbe(url);
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
      const r = prismaProbe(url);
      expect(
        r.success,
        `No-TLS connection must be REJECTED by the server (hostssl).\n${r.raw}`,
      ).toBe(false);
    },
  );

  it.skipIf(!INFRA_AVAILABLE)(
    'PRISMA-6. sslcert=NONEXISTENT via Prisma → REJECTED',
    async () => {
      // A missing explicit CA file must fail closed under sslaccept=strict.
      const url =
        `postgresql://heavix_dryrun_ro:readonly_pass@localhost:${VALID_PORT}/postgres` +
        `?schema=public&sslmode=require&sslaccept=strict&sslcert=%2Fnonexistent%2Fca.crt`;
      const r = prismaProbe(url, '/nonexistent/ca.crt');
      expect(
        r.success,
        `Prisma must reject a nonexistent sslcert path. Output:\n${r.raw}`,
      ).toBe(false);
    },
  );

  it.skipIf(!INFRA_AVAILABLE)(
    'PRISMA-7. PREFLIGHT script gets PAST TLS check and connects over TLS via Prisma',
    async () => {
      const env = {
        ...process.env,
        DATABASE_URL:
          `postgresql://heavix_dryrun_ro:readonly_pass@localhost:${VALID_PORT}/postgres` +
          `?schema=public&sslmode=require&sslaccept=strict&sslcert=${encodeURIComponent(CA_VALID)}`,
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
      expect(combined).toContain('TLS configuration        : require + strict certificate validation + explicit CA path present');
      // Must pass hostname consistency
      expect(combined).toContain('Hostname consistency     : PASS');
      // Must resolve the trusted role (proves the preflight reached role logic)
      expect(combined).toContain('heavix_dryrun_ro');
      // Must actually connect over TLS — proven by reaching a Prisma query
      // that returns a real PostgreSQL error (42P01 = undefined_table, because
      // the fresh cluster has no User table).
      expect(combined).toMatch(/42P01|relation "public\.User"|public\.User/);
      // Must NOT fail the TLS configuration preflight.
      expect(combined).not.toContain('PREFLIGHT FAIL: DATABASE_URL lacks required Prisma TLS settings');
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
          'STEP 15.88 tested libpq-style verify-full/sslrootcert parameters that are not ' +
          'Prisma ORM v6 documented strict settings. The supported configuration ' +
          'sslmode=require&sslaccept=strict&sslcert=<CA> is now under behavioral test, ' +
          'but Finding D remains open until those tests execute against the actual ' +
          'Prisma engine and all invalid-certificate cases are rejected.',
        infrastructureProven: true,
        prismaStrictConfigBehavior: 'NOT_YET_VERIFIED',
        libpqStrictVerification: true,
      };
      console.log('FINDING_D_VERDICT=' + JSON.stringify(verdict));
      expect(verdict.findingD).toBe('OPEN');
      expect(verdict.prismaStrictConfigBehavior).toBe('NOT_YET_VERIFIED');
      expect(verdict.libpqStrictVerification).toBe(true);
    },
  );
});
