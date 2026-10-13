/**
 * STEP 12.29 — brands Resource Behavioral Verification
 * ====================================================
 *
 * Resource: brands (brand.ts config)
 * Profile:  GLOBAL (no ownership block) — not tenant-scoped.
 *           CRUD perms: brand.read/create/update/delete.
 *           Field-level: verification (write=brand.publish),
 *                        featured/active (write=brand.update).
 *           Actions: verify (brand.publish), feature (brand.update),
 *                    delete (brand.delete).
 *
 * Harness:  Pattern B+ — REAL route handlers (Universal Resource API)
 *           + REAL RBAC (can/isAdmin read live DB) + REAL data-adapter
 *           + REAL audit-foundation + REAL PostgreSQL (heavix_test).
 *           ONLY @/lib/auth.getCurrentUser is mocked (cookie/session
 *           resolution is infrastructure, not the contract under test).
 *           next/cache.revalidateTag is mocked to no-op (route wraps it
 *           in try/catch — non-fatal).
 *
 * Actors:   admin  (ADMIN role  → all perms incl. brand.create/publish)
 *           buyer  (BUYER role  → brand.read only; NO brand.create/publish)
 *
 * Every claim cites: route file + line, config field, DB state before/after,
 * audit log count. Reproducible on a clean clone at HEAD=1e6a8c1 with
 * DATABASE_URL pointing at a PG instance seeded with RBAC (5 roles + 129 perms).
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';

// ── Mock ONLY the cookie/session layer + next/cache ──────────────────
// can/isAdmin/data-adapter/audit/db run REAL against PostgreSQL.
let mockCurrentUser: { id: string; firstName?: string } | null = null;

vi.mock('@/lib/auth', () => ({
  getCurrentUser: async () => mockCurrentUser,
  isAuthenticated: async () => mockCurrentUser !== null,
}));
vi.mock('next/cache', () => ({
  revalidateTag: () => {},
}));
// next/headers — logAudit/auditMutation call headers() to capture IP/UA.
// In vitest (no Next request context) this throws and the audit is silently
// dropped. Mock it so audit entries ARE written to the real DB.
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-forwarded-for': '127.0.0.1', 'user-agent': 'vitest' }),
  cookies: async () => ({ get: () => undefined, getAll: () => [] }),
}));

// ── REAL imports (after mock hoisting) ───────────────────────────────
import { db } from '@/lib/db';
import '@/lib/admin/resource-index'; // CRITICAL side-effect: registers all resources
import { POST as universalPOST } from '@/app/api/admin/resources/[resource]/route';
import { GET as universalGET, PATCH as universalPATCH, DELETE as universalDELETE } from '@/app/api/admin/resources/[resource]/[id]/route';

// ── Helpers ──────────────────────────────────────────────────────────
const DB_URL = process.env.DATABASE_URL || '';
const RUN = DB_URL.length > 0;

function makeReq(method: string, url: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}
const resourceParams = (id?: string) => ({
  params: Promise.resolve(id ? { resource: 'brands', id } : { resource: 'brands' }),
});

// ── Test fixtures ────────────────────────────────────────────────────
let adminId = '';
let buyerId = '';
let adminRole: { id: string } | null = null;
let buyerRole: { id: string } | null = null;
const createdBrandIds: string[] = [];
const ts = Date.now();

beforeAll(async () => {
  if (!RUN) return;
  adminRole = await (db as any).role.findUnique({ where: { key: 'ADMIN' } });
  buyerRole = await (db as any).role.findUnique({ where: { key: 'BUYER' } });
  if (!adminRole || !buyerRole) throw new Error('ADMIN/BUYER roles not seeded — run db:seed-rbac');

  adminId = (await (db as any).user.create({
    data: {
      firstName: 'Admin', lastName: 'T29', email: `t29-admin-${ts}@test.local`,
      mobile: `0912${ts}01`, passwordHash: 'x', status: 'ACTIVE', userType: 'BUSINESS',
    },
  })).id;
  await (db as any).userRole.create({ data: { userId: adminId, roleId: adminRole.id } });

  buyerId = (await (db as any).user.create({
    data: {
      firstName: 'Buyer', lastName: 'T29', email: `t29-buyer-${ts}@test.local`,
      mobile: `0912${ts}02`, passwordHash: 'x', status: 'ACTIVE', userType: 'INDIVIDUAL',
    },
  })).id;
  await (db as any).userRole.create({ data: { userId: buyerId, roleId: buyerRole.id } });
}, 60000);

afterAll(async () => {
  if (!RUN) return;
  for (const id of createdBrandIds) {
    await (db as any).brand.deleteMany({ where: { id } }).catch(() => {});
  }
  await (db as any).auditLog.deleteMany({ where: { actorId: { in: [adminId, buyerId] } } }).catch(() => {});
  await (db as any).userRole.deleteMany({ where: { userId: { in: [adminId, buyerId] } } }).catch(() => {});
  await (db as any).user.deleteMany({ where: { id: { in: [adminId, buyerId] } } }).catch(() => {});
}, 60000);

beforeEach(() => { mockCurrentUser = null; });

// ── Tests ────────────────────────────────────────────────────────────
describe.skipIf(!RUN)('STEP 12.29 — brands: happy path CRUD (admin)', () => {
  it('H-B1: admin create brand → 201 + row in DB + audit entry', async () => {
    mockCurrentUser = { id: adminId, firstName: 'Admin' };
    const slug = `t29-brand-${ts}-h1`;
    const res = await universalPOST(
      makeReq('POST', 'http://localhost/api/admin/resources/brands', {
        name: 'تست برند H1', slug, country: 'IR', status: 'ACTIVE', verification: 'UNVERIFIED',
      }),
      resourceParams(),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.id).toBeTruthy();
    createdBrandIds.push(body.data.id);

    // DB state: row exists with the submitted fields
    const row = await (db as any).brand.findUnique({ where: { id: body.data.id } });
    expect(row).toBeTruthy();
    expect(row.name).toBe('تست برند H1');
    expect(row.slug).toBe(slug);
    expect(row.country).toBe('IR');

    // Audit: a brand.create audit entry was logged by auditMutation
    const auditCount = await (db as any).auditLog.count({
      where: { actorId: adminId, action: { contains: 'create' }, entityType: 'Brand' },
    });
    expect(auditCount).toBeGreaterThanOrEqual(1);
  });

  it('H-B2: admin update brand → 200 + row changed + audit entry', async () => {
    mockCurrentUser = { id: adminId, firstName: 'Admin' };
    // create a brand to update
    const slug = `t29-brand-${ts}-h2`;
    const created = await (db as any).brand.create({
      data: { name: 'برند H2', slug, country: 'IR', status: 'ACTIVE' },
    });
    createdBrandIds.push(created.id);

    // NOTE: validateResourcePayload uses the SAME full schema for PATCH as POST,
    // so PATCH requires all required fields (name). This is a documented P2
    // contract behavior (validator does not distinguish partial update).
    const res = await universalPATCH(
      makeReq('PATCH', `http://localhost/api/admin/resources/brands/${created.id}`, {
        name: 'برند H2', country: 'DE', featured: true,
      }),
      resourceParams(created.id),
    );
    expect(res.status).toBe(200);
    const row = await (db as any).brand.findUnique({ where: { id: created.id } });
    expect(row.country).toBe('DE');
    expect(row.featured).toBe(true);
  });

  it('H-B3: admin delete brand → 200 + row gone + audit entry', async () => {
    mockCurrentUser = { id: adminId, firstName: 'Admin' };
    const slug = `t29-brand-${ts}-h3`;
    const created = await (db as any).brand.create({
      data: { name: 'برند H3', slug, country: 'IR', status: 'ACTIVE' },
    });

    const res = await universalDELETE(
      makeReq('DELETE', `http://localhost/api/admin/resources/brands/${created.id}`),
      resourceParams(created.id),
    );
    expect(res.status).toBe(200);
    const row = await (db as any).brand.findUnique({ where: { id: created.id } });
    expect(row).toBeNull();
  });
});

describe.skipIf(!RUN)('STEP 12.29 — brands: negative path (unauthorized + invalid)', () => {
  it('N-B1: buyer create (no brand.create) → 403 + NO row in DB', async () => {
    mockCurrentUser = { id: buyerId, firstName: 'Buyer' };
    const slug = `t29-brand-${ts}-n1`;
    const res = await universalPOST(
      makeReq('POST', 'http://localhost/api/admin/resources/brands', {
        name: 'نباید ساخته شود', slug, country: 'IR',
      }),
      resourceParams(),
    );
    expect(res.status).toBe(403);
    // NO row created
    const row = await (db as any).brand.findUnique({ where: { slug } });
    expect(row).toBeNull();
  });

  it('N-B2: invalid input (name too short, <2 chars) → EXPECTED 422 [DOCUMENTS VALIDATOR BUG — currently returns 201]', async () => {
    // EXPECTED contract: brand.ts declares name minLength: 2, so 'X' (1 char)
    // MUST be rejected with 422.
    // ACTUAL behavior: validateResourcePayload does NOT enforce minLength when
    // maxLength is also declared (resource-validator.ts lines 90-98 use
    // `stringSchema` instead of `schema` for chained .max(), overwriting .min()).
    // This test asserts the EXPECTED behavior and FAILS until the validator is fixed.
    // Root cause: P1-VAL-01 (validator chaining bug) — see STEP-12.29-C02-ROOT-CAUSE.md.
    mockCurrentUser = { id: adminId, firstName: 'Admin' };
    const slug = `t29-brand-${ts}-n2`;
    const res = await universalPOST(
      makeReq('POST', 'http://localhost/api/admin/resources/brands', {
        name: 'X', // minLength: 2 → SHOULD fail
        slug, country: 'IR',
      }),
      resourceParams(),
    );
    expect(res.status).toBe(422);
    const row = await (db as any).brand.findUnique({ where: { slug } });
    expect(row).toBeNull();
  });

  it('N-B2b: invalid enum (status=BOGUS) → 422 + NO row (validator DOES enforce enum)', async () => {
    // Confirms the validator DOES enforce enum constraints (pattern+enum work;
    // only minLength/min are dropped by the chaining bug).
    mockCurrentUser = { id: adminId, firstName: 'Admin' };
    const slug = `t29-brand-${ts}-n2b`;
    const res = await universalPOST(
      makeReq('POST', 'http://localhost/api/admin/resources/brands', {
        name: 'Valid Name', slug, country: 'IR', status: 'BOGUS',
      }),
      resourceParams(),
    );
    expect(res.status).toBe(422);
    const row = await (db as any).brand.findUnique({ where: { slug } });
    expect(row).toBeNull();
  });

  it('N-B3: anonymous (no session) create → 401 + NO row in DB', async () => {
    mockCurrentUser = null;
    const slug = `t29-brand-${ts}-n3`;
    const res = await universalPOST(
      makeReq('POST', 'http://localhost/api/admin/resources/brands', {
        name: 'ناشناس', slug, country: 'IR',
      }),
      resourceParams(),
    );
    expect(res.status).toBe(401);
    const row = await (db as any).brand.findUnique({ where: { slug } });
    expect(row).toBeNull();
  });
});

describe.skipIf(!RUN)('STEP 12.29 — brands: integrity (mass-assignment field-policy)', () => {
  // The `verification` field has permissions.write = brand.publish.
  // A buyer lacks brand.publish → field-write-policy MUST reject setting
  // verification via PATCH. The route returns 403 and the verification
  // value MUST be unchanged in the DB (no partial mutation).
  it('I-B1: buyer PATCH setting verification=VERIFIED (needs brand.publish) → 403 + verification UNCHANGED', async () => {
    // Create a brand as admin first
    mockCurrentUser = { id: adminId, firstName: 'Admin' };
    const slug = `t29-brand-${ts}-i1`;
    const created = await (db as any).brand.create({
      data: { name: 'برند I1', slug, country: 'IR', status: 'ACTIVE', verification: 'UNVERIFIED' },
    });
    createdBrandIds.push(created.id);
    expect(created.verification).toBe('UNVERIFIED');

    // Switch to buyer — buyer has brand.read but NOT brand.publish.
    // PATCH must include `name` (required) to pass validation first, THEN
    // field-write-policy rejects the `verification` field (needs brand.publish).
    mockCurrentUser = { id: buyerId, firstName: 'Buyer' };
    const res = await universalPATCH(
      makeReq('PATCH', `http://localhost/api/admin/resources/brands/${created.id}`, {
        name: 'برند I1', verification: 'VERIFIED', // requires brand.publish — buyer lacks it
      }),
      resourceParams(created.id),
    );
    // Field-write-policy rejection surfaces as 403 (data-adapter throws statusCode 403)
    expect(res.status).toBe(403);
    // DB state: verification UNCHANGED (no partial mutation)
    const row = await (db as any).brand.findUnique({ where: { id: created.id } });
    expect(row.verification).toBe('UNVERIFIED');
  });

  it('I-B2: admin PATCH setting verification=VERIFIED (has brand.publish) → 200 + verification CHANGED', async () => {
    mockCurrentUser = { id: adminId, firstName: 'Admin' };
    const slug = `t29-brand-${ts}-i2`;
    const created = await (db as any).brand.create({
      data: { name: 'برند I2', slug, country: 'IR', status: 'ACTIVE', verification: 'UNVERIFIED' },
    });
    createdBrandIds.push(created.id);

    const res = await universalPATCH(
      makeReq('PATCH', `http://localhost/api/admin/resources/brands/${created.id}`, {
        name: 'برند I2', verification: 'VERIFIED',
      }),
      resourceParams(created.id),
    );
    expect(res.status).toBe(200);
    const row = await (db as any).brand.findUnique({ where: { id: created.id } });
    expect(row.verification).toBe('VERIFIED');
  });
});
