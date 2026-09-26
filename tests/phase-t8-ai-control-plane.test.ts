/**
 * HEAVIX — T8: AI Control Plane Contract Tests
 *
 * Verifies the AI Control Plane foundation meets the Definition-of-Done
 * chain using file-content assertions (same pattern as Phase C1
 * navigation contract tests + T4 page builder lifecycle tests).
 *
 * No DB dependency — these are pure structural/contract assertions.
 *
 * Scope:
 *   1. Permission keys — ai.read / ai.manage / ai.execute exist in the
 *      PERMISSIONS array (src/lib/authorization/permissions.ts).
 *   2. AI domain models — AIAgent, AIBudget, AIGatewayLog, AITaskPolicy
 *      exist in prisma/schema.prisma.
 *   3. Admin page — src/app/admin/ai/page.tsx exists and is a server
 *      component that gates on getCurrentUser + requirePermission('ai.read')
 *      + logAudit list_view + queries the 4 AI models.
 *   4. Navigation seed — the `ai-control` standalone nav item exists in
 *      prisma/seed-admin-navigation.ts with the canonical ai.read gate.
 *   5. AI audit hooks — the AI gateway route + AI agents route both
 *      call logAudit (provider/model/agent management is auditable).
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';

// ── File paths ──────────────────────────────────────────────
const PERMISSIONS_FILE = 'src/lib/authorization/permissions.ts';
const SCHEMA_FILE = 'prisma/schema.prisma';
const AI_PAGE = 'src/app/admin/ai/page.tsx';
const NAV_SEED = 'prisma/seed-admin-navigation.ts';
const AI_GATEWAY_ROUTE = 'src/app/api/ai-gateway/route.ts';
const AI_AGENTS_ROUTE = 'src/app/api/admin/ai-agents/route.ts';
const AI_AGENTS_LIB = 'src/lib/ai-agents/index.ts';

function read(p: string): string {
  return fs.readFileSync(p, 'utf8');
}

function assertFileExists(p: string) {
  if (!fs.existsSync(p)) {
    throw new Error(`Expected file not found: ${p}`);
  }
}

// ══════════════════════════════════════════════════════════════
// 1. PERMISSION KEYS — ai.read / ai.manage / ai.execute
// ══════════════════════════════════════════════════════════════
describe('T8 AI Control Plane — Permission Keys', () => {
  it('permissions file exists', () => {
    assertFileExists(PERMISSIONS_FILE);
  });

  it('PERMISSIONS array contains ai.read', () => {
    const c = read(PERMISSIONS_FILE);
    expect(c).toMatch(/['"]ai\.read['"]/);
  });

  it('PERMISSIONS array contains ai.manage', () => {
    const c = read(PERMISSIONS_FILE);
    expect(c).toMatch(/['"]ai\.manage['"]/);
  });

  it('PERMISSIONS array contains ai.execute', () => {
    const c = read(PERMISSIONS_FILE);
    expect(c).toMatch(/['"]ai\.execute['"]/);
  });

  it('ADMIN role receives all AI permissions (spread of PERMISSIONS)', () => {
    const c = read(PERMISSIONS_FILE);
    // ADMIN: [...PERMISSIONS] guarantees the admin gets ai.* keys.
    expect(c).toMatch(/ADMIN:\s*\[\.\.\.PERMISSIONS\]/);
  });
});

// ══════════════════════════════════════════════════════════════
// 2. AI DOMAIN MODELS — schema.prisma
// ══════════════════════════════════════════════════════════════
describe('T8 AI Control Plane — AI Domain Models in schema.prisma', () => {
  it('schema file exists', () => {
    assertFileExists(SCHEMA_FILE);
  });

  it('AIAgent model exists in schema', () => {
    const c = read(SCHEMA_FILE);
    expect(c).toMatch(/^model AIAgent \{/m);
  });

  it('AIBudget model exists in schema', () => {
    const c = read(SCHEMA_FILE);
    expect(c).toMatch(/^model AIBudget \{/m);
  });

  it('AIGatewayLog model exists in schema', () => {
    const c = read(SCHEMA_FILE);
    expect(c).toMatch(/^model AIGatewayLog \{/m);
  });

  it('AITaskPolicy model exists in schema (task policy allow-list)', () => {
    const c = read(SCHEMA_FILE);
    expect(c).toMatch(/^model AITaskPolicy \{/m);
  });
});

// ══════════════════════════════════════════════════════════════
// 3. ADMIN PAGE — /admin/ai server component
// ══════════════════════════════════════════════════════════════
describe('T8 AI Control Plane — Admin Page Contract', () => {
  it('admin page file exists at src/app/admin/ai/page.tsx', () => {
    assertFileExists(AI_PAGE);
  });

  it('is a server component (no "use client" directive)', () => {
    const c = read(AI_PAGE);
    const firstLine = c.split('\n')[0];
    expect(firstLine).not.toMatch(/^['"]use client['"]/);
  });

  it('declares force-dynamic export', () => {
    const c = read(AI_PAGE);
    expect(c).toMatch(/export const dynamic\s*=\s*['"]force-dynamic['"]/);
  });

  it('does NOT have @ts-nocheck on line 1', () => {
    const c = read(AI_PAGE);
    const firstLine = c.split('\n')[0];
    expect(firstLine).not.toMatch(/^\/\/\s*@ts-nocheck/);
  });

  it('imports getCurrentUser from @/lib/auth', () => {
    const c = read(AI_PAGE);
    expect(c).toMatch(/import.*getCurrentUser.*from ['"]@\/lib\/auth['"]/);
  });

  it('imports requirePermission from @/lib/authorization', () => {
    const c = read(AI_PAGE);
    expect(c).toMatch(/import.*requirePermission.*from ['"]@\/lib\/authorization['"]/);
  });

  it('gates on requirePermission(user.id, "ai.read")', () => {
    const c = read(AI_PAGE);
    expect(c).toMatch(/requirePermission\([^,]*,\s*['"]ai\.read['"]/);
  });

  it('imports logAudit from @/lib/audit and calls it for list_view', () => {
    const c = read(AI_PAGE);
    expect(c).toMatch(/import.*logAudit.*from ['"]@\/lib\/audit['"]/);
    expect(c).toMatch(/await logAudit\(/);
    expect(c).toMatch(/action:\s*['"]ai\.control_plane\.list_view['"]/);
    expect(c).toMatch(/entityType:\s*['"]AIAgent['"]/);
  });

  it('queries all 4 AI domain models (aIAgent / aIGatewayLog / aITaskPolicy / aIBudget)', () => {
    const c = read(AI_PAGE);
    expect(c).toMatch(/db\.aIAgent\./);
    expect(c).toMatch(/db\.aIGatewayLog\./);
    expect(c).toMatch(/db\.aITaskPolicy\./);
    expect(c).toMatch(/db\.aIBudget\./);
  });

  it('queries recent AI gateway logs with limit 20 + orderBy createdAt desc', () => {
    const c = read(AI_PAGE);
    expect(c).toMatch(/db\.aIGatewayLog\.findMany/);
    expect(c).toMatch(/orderBy:\s*\{\s*createdAt:\s*['"]desc['"]/);
    expect(c).toMatch(/take:\s*20/);
  });

  it('queries AI agents list with limit 20', () => {
    const c = read(AI_PAGE);
    expect(c).toMatch(/db\.aIAgent\.findMany/);
    expect(c).toMatch(/take:\s*20/);
  });
});

// ══════════════════════════════════════════════════════════════
// 4. NAVIGATION SEED — ai-control standalone nav item
// ══════════════════════════════════════════════════════════════
describe('T8 AI Control Plane — Navigation Seed', () => {
  it('nav seed file exists', () => {
    assertFileExists(NAV_SEED);
  });

  it('seed registers the ai-control standalone nav item', () => {
    const c = read(NAV_SEED);
    expect(c).toMatch(/key:\s*['"]ai-control['"]/);
    expect(c).toMatch(/href:\s*['"]\/admin\/ai['"]/);
    expect(c).toMatch(/icon:\s*['"]Brain['"]/);
    expect(c).toMatch(/sortOrder:\s*10\.6/);
    expect(c).toMatch(/permissionKey:\s*['"]ai\.read['"]/);
  });
});

// ══════════════════════════════════════════════════════════════
// 5. AI AUDIT HOOKS — gateway + agents routes call logAudit
// ══════════════════════════════════════════════════════════════
describe('T8 AI Control Plane — AI Audit Hooks Verification', () => {
  it('AI gateway route imports + calls logAudit', () => {
    assertFileExists(AI_GATEWAY_ROUTE);
    const c = read(AI_GATEWAY_ROUTE);
    expect(c).toMatch(/import.*logAudit.*from ['"]@\/lib\/audit['"]/);
    expect(c).toMatch(/await logAudit\(/);
  });

  it('AI gateway route audits denied requests with ai.execute action', () => {
    const c = read(AI_GATEWAY_ROUTE);
    // The preflight rejection path must record a security event.
    expect(c).toMatch(/action:\s*['"]ai\.execute['"]/);
    expect(c).toMatch(/entityType:\s*['"]AIGateway['"]/);
  });

  it('AI agents admin route imports + calls logAudit for agent runs', () => {
    assertFileExists(AI_AGENTS_ROUTE);
    const c = read(AI_AGENTS_ROUTE);
    expect(c).toMatch(/import.*logAudit.*from ['"]@\/lib\/audit['"]/);
    expect(c).toMatch(/action:\s*['"]ai\.agent\.run['"]/);
  });

  it('AI agents library (src/lib/ai-agents/index.ts) imports logAudit', () => {
    assertFileExists(AI_AGENTS_LIB);
    const c = read(AI_AGENTS_LIB);
    expect(c).toMatch(/import.*logAudit.*from ['"]@\/lib\/audit['"]/);
  });
});
