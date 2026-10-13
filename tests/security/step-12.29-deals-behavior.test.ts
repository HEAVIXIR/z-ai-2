/**
 * STEP 12.29 — deals Resource Behavioral Verification
 * ====================================================
 *
 * Resource: deals (dealConfig in marketplace-resources.ts)
 * Profile:  TENANT-SCOPED (ownership: { ownerField: 'sellerId',
 *           moderatePermission: 'deal.manage' }). Universal Route ONLY
 *           (no dedicated API). CRUD perms: read=deal.read,
 *           create/update/delete=deal.manage. Actions: confirm + cancel
 *           (both deal.manage).
 *
 * Harness:  Pattern B+ — REAL route handlers (Universal Resource API) +
 *           REAL executeAction + REAL RBAC + REAL DB + REAL audit.
 *           Only @/lib/auth + next/cache + next/headers mocked.
 *
 * Actors:   admin (ADMIN → all), sellerA + sellerB (SELLER → deal.read/manage).
 *
 * Critical invariants under test:
 *   - Tenant scope via Universal Route: seller sees ONLY own deals.
 *   - Fail-closed: non-owner gets 404 (no existence leak).
 *   - No mutation on rejected PATCH/DELETE.
 *   - Universal Route data filter: sellerA list excludes sellerB deals.
 *   - Action ownership: sellerB confirm sellerA deal → denied + no mutation.
 *   - admin sees all deals (no tenant filter).
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';

let mockCurrentUser: { id: string; firstName?: string } | null = null;

vi.mock('@/lib/auth', () => ({
  getCurrentUser: async () => mockCurrentUser,
  isAuthenticated: async () => mockCurrentUser !== null,
}));
vi.mock('next/cache', () => ({ revalidateTag: () => {} }));
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-forwarded-for': '127.0.0.1', 'user-agent': 'vitest' }),
  cookies: async () => ({ get: () => undefined, getAll: () => [] }),
}));

import { db } from '@/lib/db';
import '@/lib/admin/resource-index';
import { GET as listGET } from '@/app/api/admin/resources/[resource]/route';
import { GET as itemGET, PATCH as universalPATCH, DELETE as universalDELETE } from '@/app/api/admin/resources/[resource]/[id]/route';
import { executeAction } from '@/lib/admin/action-engine';

const DB_URL = process.env.DATABASE_URL || '';
const RUN = DB_URL.length > 0;

function makeReq(method: string, url: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}
const rp = (id?: string) => ({ params: Promise.resolve(id ? { resource: 'deals', id } : { resource: 'deals' }) });

let adminId = '', sellerAId = '', sellerBId = '';
let adminRole: any, sellerRole: any;
const createdDealIds: string[] = [];
const ts = Date.now();

beforeAll(async () => {
  if (!RUN) return;
  adminRole = await (db as any).role.findUnique({ where: { key: 'ADMIN' } });
  sellerRole = await (db as any).role.findUnique({ where: { key: 'SELLER' } });
  if (!adminRole || !sellerRole) throw new Error('roles not seeded');

  const mk = async (first: string, suffix: string, roleId: string) => {
    const u = await (db as any).user.create({
      data: { firstName: first, lastName: 'T29D', email: `t29d-${suffix}-${ts}@test.local`,
        mobile: `0914${ts}${suffix}`, passwordHash: 'x', status: 'ACTIVE', userType: 'BUSINESS' },
    });
    await (db as any).userRole.create({ data: { userId: u.id, roleId } });
    return u.id;
  };
  adminId = await mk('Admin', 'd1', adminRole.id);
  sellerAId = await mk('SellerA', 'd2', sellerRole.id);
  sellerBId = await mk('SellerB', 'd3', sellerRole.id);
}, 60000);

afterAll(async () => {
  if (!RUN) return;
  for (const id of createdDealIds) await (db as any).deal.deleteMany({ where: { id } }).catch(() => {});
  await (db as any).auditLog.deleteMany({ where: { actorId: { in: [adminId, sellerAId, sellerBId] } } }).catch(() => {});
  await (db as any).userRole.deleteMany({ where: { userId: { in: [adminId, sellerAId, sellerBId] } } }).catch(() => {});
  await (db as any).user.deleteMany({ where: { id: { in: [adminId, sellerAId, sellerBId] } } }).catch(() => {});
}, 60000);

beforeEach(() => { mockCurrentUser = null; });

async function seedDeal(sellerId: string, numSuffix: string, status = 'DRAFT') {
  // dealNumber must match ^DEAL-\d{4,}$ (config validation) — numeric only after DEAL-
  const d = await (db as any).deal.create({
    data: { dealNumber: `DEAL-${ts}${numSuffix}`, sourceType: 'LISTING_OFFER', sourceId: 'src-' + numSuffix,
      sellerId, status, currency: 'IRR', transactionType: 'SALE', agreedAmount: BigInt(10000) },
  });
  createdDealIds.push(d.id);
  return d;
}

// ── Happy path (Universal Route tenant scope) ────────────────────────
describe.skipIf(!RUN)('STEP 12.29 — deals: happy path (Universal Route tenant scope)', () => {
  it('H-D1: sellerA list via Universal Route → sees ONLY own deals [EXPECTED — DOCUMENTS P0 TENANT BYPASS]', async () => {
    // INTENDED contract (dealConfig comment): "A SELLER sees/edits only their
    // own deals". ACTUAL: SELLER role (permissions.ts:256) has deal.manage,
    // which is dealConfig.ownership.moderatePermission. So resolveTenantCtx
    // sets hasModeratePerm=true for ALL sellers → buildTenantWhere returns
    // {where:{}} → seller sees EVERY seller's deals. This test asserts the
    // INTENDED behavior and FAILS until the permission collision is fixed.
    // Root cause: P0-DEAL-01 (deal.manage used as both CRUD perm AND moderate perm).
    const mine = await seedDeal(sellerAId, '01');
    const other = await seedDeal(sellerBId, '02');
    mockCurrentUser = { id: sellerAId, firstName: 'SellerA' };
    const res = await listGET(
      makeReq('GET', 'http://localhost/api/admin/resources/deals'),
      rp(),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    // filterReadableFieldsAsync strips `id` (not in config.fields); use dealNumber.
    const nums = body.data.items.map((i: any) => i.dealNumber);
    expect(nums).toContain(mine.dealNumber);
    expect(nums).not.toContain(other.dealNumber); // INTENDED: sellerB's deal NOT visible
  });

  it('H-D2: admin list via Universal Route → sees ALL deals (no tenant filter)', async () => {
    const a = await seedDeal(sellerAId, '03');
    const b = await seedDeal(sellerBId, '04');
    mockCurrentUser = { id: adminId, firstName: 'Admin' };
    const res = await listGET(
      makeReq('GET', 'http://localhost/api/admin/resources/deals'),
      rp(),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    const nums = body.data.items.map((i: any) => i.dealNumber);
    expect(nums).toContain(a.dealNumber);
    expect(nums).toContain(b.dealNumber); // admin sees both
  });
});

// ── Negative path (cross-tenant fail-closed) ─────────────────────────
describe.skipIf(!RUN)('STEP 12.29 — deals: negative path (cross-tenant fail-closed)', () => {
  it('N-D1: sellerA GET sellerB deal → EXPECTED 404 [DOCUMENTS P0 TENANT BYPASS — currently 200]', async () => {
    // INTENDED: sellerA gets 404 for sellerB's deal (fail-closed tenant scope).
    // ACTUAL: 200 — sellerA has deal.manage (moderatePermission) → bypass.
    const b = await seedDeal(sellerBId, '11');
    mockCurrentUser = { id: sellerAId, firstName: 'SellerA' };
    const res = await itemGET(
      makeReq('GET', `http://localhost/api/admin/resources/deals/${b.id}`),
      rp(b.id),
    );
    expect(res.status).toBe(404);
  });

  it('N-D2: sellerA PATCH sellerB deal → EXPECTED 404 [DOCUMENTS P0 TENANT BYPASS] + row UNCHANGED', async () => {
    const b = await seedDeal(sellerBId, '12', 'DRAFT');
    const origStatus = b.status;
    mockCurrentUser = { id: sellerAId, firstName: 'SellerA' };
    const res = await universalPATCH(
      makeReq('PATCH', `http://localhost/api/admin/resources/deals/${b.id}`, {
        dealNumber: b.dealNumber, sourceType: 'LISTING_OFFER', sourceId: b.sourceId,
        status: 'COMPLETED',
      }),
      rp(b.id),
    );
    expect(res.status).toBe(404);
    const row = await (db as any).deal.findUnique({ where: { id: b.id } });
    expect(row.status).toBe(origStatus); // unchanged
  });

  it('N-D3: sellerA DELETE sellerB deal → EXPECTED 404 [DOCUMENTS P0 TENANT BYPASS] + row STILL EXISTS', async () => {
    const b = await seedDeal(sellerBId, '13');
    mockCurrentUser = { id: sellerAId, firstName: 'SellerA' };
    const res = await universalDELETE(
      makeReq('DELETE', `http://localhost/api/admin/resources/deals/${b.id}`),
      rp(b.id),
    );
    expect(res.status).toBe(404);
    const row = await (db as any).deal.findUnique({ where: { id: b.id } });
    expect(row).not.toBeNull();
  });
});

// ── Integrity (action ownership via executeAction) ───────────────────
describe.skipIf(!RUN)('STEP 12.29 — deals: integrity (action ownership)', () => {
  it('I-D1: admin confirm sellerA deal via executeAction → status CONFIRMED + audit', async () => {
    const a = await seedDeal(sellerAId, '21', 'DRAFT');
    const result = await executeAction('deals', a.id, 'confirm', { userId: adminId });
    expect(result.success).toBe(true);
    const row = await (db as any).deal.findUnique({ where: { id: a.id } });
    expect(row.status).toBe('CONFIRMED');
    const audit = await (db as any).auditLog.count({
      where: { actorId: adminId, action: 'deals.confirm', entityId: a.id },
    });
    expect(audit).toBeGreaterThanOrEqual(1);
  });

  it('I-D2: sellerB confirm sellerA deal → ownership denied + NO mutation + NO audit', async () => {
    const a = await seedDeal(sellerAId, '22', 'DRAFT');
    const result = await executeAction('deals', a.id, 'confirm', {
      userId: sellerBId,
      tenantCtx: { userId: sellerBId, isAdmin: false, hasModeratePerm: false },
    });
    expect(result.success).toBe(false);
    const row = await (db as any).deal.findUnique({ where: { id: a.id } });
    expect(row.status).toBe('DRAFT'); // unchanged
    const audit = await (db as any).auditLog.count({
      where: { actorId: sellerBId, action: 'deals.confirm', entityId: a.id },
    });
    expect(audit).toBe(0); // no audit for rejected action
  });

  it('I-D3: sellerA confirm own deal → allowed + status CONFIRMED + audit', async () => {
    const a = await seedDeal(sellerAId, '23', 'DRAFT');
    const result = await executeAction('deals', a.id, 'confirm', {
      userId: sellerAId,
      tenantCtx: { userId: sellerAId, isAdmin: false, hasModeratePerm: false },
    });
    expect(result.success).toBe(true);
    const row = await (db as any).deal.findUnique({ where: { id: a.id } });
    expect(row.status).toBe('CONFIRMED');
    const audit = await (db as any).auditLog.count({
      where: { actorId: sellerAId, action: 'deals.confirm', entityId: a.id },
    });
    expect(audit).toBeGreaterThanOrEqual(1);
  });
});
