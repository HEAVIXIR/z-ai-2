/**
 * HEAVIX — T9: Analytics/Observability Control Plane Contract Tests
 *
 * Verifies the Analytics/Observability Control Plane foundation meets
 * the Definition-of-Done chain using file-content assertions (same
 * pattern as Phase T8 AI control plane tests + Phase C1 navigation
 * contract tests + T4 page builder lifecycle tests).
 *
 * No DB dependency — these are pure structural/contract assertions.
 *
 * Scope:
 *   1. Permission keys — analytics.read / analytics.manage exist in
 *      the PERMISSIONS array (src/lib/authorization/permissions.ts).
 *   2. Analytics domain models — AnalyticsEvent + SiteStat exist in
 *      prisma/schema.prisma (SearchQuery + DemandSignal are also
 *      referenced by the broader analytics stack but the canonical
 *      pair is asserted here to keep the contract tight).
 *   3. Admin page — src/app/admin/observability/page.tsx exists and
 *      is a server component that gates on getCurrentUser +
 *      requirePermission('analytics.read') + logAudit list_view +
 *      queries the business counts + technical counts.
 *   4. Navigation seed — the `observability` standalone nav item
 *      exists in prisma/seed-admin-navigation.ts with the canonical
 *      analytics.read gate + Gauge icon + sortOrder 10.7.
 *   5. /api/metrics route exists — the Prometheus text-format
 *      endpoint (T5-W2) is the technical-observability data source
 *      the page deep-links to from the "Prometheus metrics" anchor.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';

// ── File paths ──────────────────────────────────────────────
const PERMISSIONS_FILE = 'src/lib/authorization/permissions.ts';
const SCHEMA_FILE = 'prisma/schema.prisma';
const OBSERVABILITY_PAGE = 'src/app/admin/observability/page.tsx';
const NAV_SEED = 'prisma/seed-admin-navigation.ts';
const METRICS_ROUTE = 'src/app/api/metrics/route.ts';

function read(p: string): string {
  return fs.readFileSync(p, 'utf8');
}

function assertFileExists(p: string) {
  if (!fs.existsSync(p)) {
    throw new Error(`Expected file not found: ${p}`);
  }
}

// ══════════════════════════════════════════════════════════════
// 1. PERMISSION KEYS — analytics.read / analytics.manage
// ══════════════════════════════════════════════════════════════
describe('T9 Analytics/Observability — Permission Keys', () => {
  it('permissions file exists', () => {
    assertFileExists(PERMISSIONS_FILE);
  });

  it('PERMISSIONS array contains analytics.read', () => {
    const c = read(PERMISSIONS_FILE);
    expect(c).toMatch(/['"]analytics\.read['"]/);
  });

  it('PERMISSIONS array contains analytics.manage', () => {
    const c = read(PERMISSIONS_FILE);
    expect(c).toMatch(/['"]analytics\.manage['"]/);
  });

  it('ADMIN role receives all analytics permissions (spread of PERMISSIONS)', () => {
    const c = read(PERMISSIONS_FILE);
    // ADMIN: [...PERMISSIONS] guarantees the admin gets analytics.* keys.
    expect(c).toMatch(/ADMIN:\s*\[\.\.\.PERMISSIONS\]/);
  });
});

// ══════════════════════════════════════════════════════════════
// 2. ANALYTICS DOMAIN MODELS — schema.prisma
// ══════════════════════════════════════════════════════════════
describe('T9 Analytics/Observability — Analytics Domain Models in schema.prisma', () => {
  it('schema file exists', () => {
    assertFileExists(SCHEMA_FILE);
  });

  it('AnalyticsEvent model exists in schema', () => {
    const c = read(SCHEMA_FILE);
    expect(c).toMatch(/^model AnalyticsEvent \{/m);
  });

  it('SiteStat model exists in schema', () => {
    const c = read(SCHEMA_FILE);
    expect(c).toMatch(/^model SiteStat \{/m);
  });
});

// ══════════════════════════════════════════════════════════════
// 3. ADMIN PAGE — /admin/observability server component
// ══════════════════════════════════════════════════════════════
describe('T9 Analytics/Observability — Admin Page Contract', () => {
  it('admin page file exists at src/app/admin/observability/page.tsx', () => {
    assertFileExists(OBSERVABILITY_PAGE);
  });

  it('is a server component (no "use client" directive)', () => {
    const c = read(OBSERVABILITY_PAGE);
    const firstLine = c.split('\n')[0];
    expect(firstLine).not.toMatch(/^['"]use client['"]/);
  });

  it('declares force-dynamic export', () => {
    const c = read(OBSERVABILITY_PAGE);
    expect(c).toMatch(/export const dynamic\s*=\s*['"]force-dynamic['"]/);
  });

  it('does NOT have @ts-nocheck on line 1', () => {
    const c = read(OBSERVABILITY_PAGE);
    const firstLine = c.split('\n')[0];
    expect(firstLine).not.toMatch(/^\/\/\s*@ts-nocheck/);
  });

  it('imports getCurrentUser from @/lib/auth', () => {
    const c = read(OBSERVABILITY_PAGE);
    expect(c).toMatch(/import.*getCurrentUser.*from ['"]@\/lib\/auth['"]/);
  });

  it('imports requirePermission from @/lib/authorization', () => {
    const c = read(OBSERVABILITY_PAGE);
    expect(c).toMatch(/import.*requirePermission.*from ['"]@\/lib\/authorization['"]/);
  });

  it('gates on requirePermission(user.id, "analytics.read")', () => {
    const c = read(OBSERVABILITY_PAGE);
    expect(c).toMatch(/requirePermission\([^,]*,\s*['"]analytics\.read['"]/);
  });

  it('imports logAudit from @/lib/audit and calls it for list_view', () => {
    const c = read(OBSERVABILITY_PAGE);
    expect(c).toMatch(/import.*logAudit.*from ['"]@\/lib\/audit['"]/);
    expect(c).toMatch(/await logAudit\(/);
    expect(c).toMatch(/action:\s*['"]observability\.list_view['"]/);
    expect(c).toMatch(/entityType:\s*['"]Observability['"]/);
  });

  it('queries business counts (users / listings / orders / payments / deals / rfqs)', () => {
    const c = read(OBSERVABILITY_PAGE);
    expect(c).toMatch(/db\.user\.count\(\)/);
    expect(c).toMatch(/db\.listing\.count\(\)/);
    expect(c).toMatch(/db\.order\.count\(\)/);
    expect(c).toMatch(/db\.payment\.count\(\)/);
    expect(c).toMatch(/db\.deal\.count\(\)/);
    expect(c).toMatch(/db\.rFQ\.count\(\)/);
  });

  it('queries technical observability counts (aIGatewayLog / auditLog)', () => {
    const c = read(OBSERVABILITY_PAGE);
    expect(c).toMatch(/db\.aIGatewayLog\.count\(\)/);
    expect(c).toMatch(/db\.auditLog\.count\(\)/);
  });

  it('probes main DB health with db.$queryRaw SELECT 1', () => {
    const c = read(OBSERVABILITY_PAGE);
    expect(c).toMatch(/db\.\$queryRaw`SELECT 1`/);
  });

  it('probes store DB health with storeDb.$queryRaw SELECT 1', () => {
    const c = read(OBSERVABILITY_PAGE);
    expect(c).toMatch(/storeDb\.\$queryRaw`SELECT 1`/);
  });

  it('reads process.uptime() for the Node process age metric', () => {
    const c = read(OBSERVABILITY_PAGE);
    expect(c).toMatch(/process\.uptime\(\)/);
  });
});

// ══════════════════════════════════════════════════════════════
// 4. NAVIGATION SEED — observability standalone nav item
// ══════════════════════════════════════════════════════════════
describe('T9 Analytics/Observability — Navigation Seed', () => {
  it('nav seed file exists', () => {
    assertFileExists(NAV_SEED);
  });

  it('seed registers the observability standalone nav item', () => {
    const c = read(NAV_SEED);
    expect(c).toMatch(/key:\s*['"]observability['"]/);
    expect(c).toMatch(/href:\s*['"]\/admin\/observability['"]/);
    expect(c).toMatch(/icon:\s*['"]Gauge['"]/);
    expect(c).toMatch(/sortOrder:\s*10\.7/);
    expect(c).toMatch(/permissionKey:\s*['"]analytics\.read['"]/);
  });
});

// ══════════════════════════════════════════════════════════════
// 5. /api/metrics ROUTE — Prometheus text-format endpoint
// ══════════════════════════════════════════════════════════════
describe('T9 Analytics/Observability — Prometheus Metrics Route', () => {
  it('metrics route file exists at src/app/api/metrics/route.ts', () => {
    assertFileExists(METRICS_ROUTE);
  });

  it('metrics route exports a GET handler', () => {
    const c = read(METRICS_ROUTE);
    expect(c).toMatch(/export async function GET\(/);
  });

  it('metrics route emits Prometheus text format (TYPE gauge)', () => {
    const c = read(METRICS_ROUTE);
    expect(c).toMatch(/# TYPE /);
    expect(c).toMatch(/gauge/);
  });
});
