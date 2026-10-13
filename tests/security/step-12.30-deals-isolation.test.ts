/**
 * STEP 12.30 — Deals Tenant Isolation Reproduction + Fix Verification
 * ====================================================================
 *
 * This test reproduces P0-DEAL-01 (deals tenant isolation bypass) with the
 * 6 mandatory scenarios from the STEP 12.30 directive, and verifies the fix.
 *
 * BEFORE FIX: scenarios 1-5 FAIL (sellerA can access/edit/delete/action
 *   sellerB's deals via Universal Admin Route, because SELLER has
 *   deal.manage = dealConfig.ownership.moderatePermission → hasModeratePerm=true
 *   → buildTenantWhere returns {where:{}} → no tenant filter).
 *   Scenario 6 PASSES (sellerA can act on own deal).
 *
 * AFTER FIX (Option A: deal.moderate permission): scenarios 1-5 PASS
 *   (sellerA gets 404/403 for sellerB's deals; no mutation; no audit).
 *   Scenario 6 still PASSES (sellerA can act on own deal).
 *
 * Harness: Pattern B+ — REAL route handlers (Universal Route list/get/
 *   patch/delete/action) + REAL RBAC (can/isAdmin read live DB) + REAL
 *   data-adapter + REAL audit + REAL PostgreSQL. Only @/lib/auth.
 *   getCurrentUser + next/cache + next/headers mocked (infrastructure).
 *
 * Actors: admin (ADMIN → all perms), sellerA + sellerB (SELLER →
 *   deal.read + deal.manage; after fix: NOT deal.moderate).
 *
 * Reproducible: DATABASE_URL=postgresql://...heavix_test, HEAD=1e6a8c1,
 *   bunx vitest run tests/security/step-12.30-deals-isolation.test.ts
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
import { POST as actionPOST } from '@/app/api/admin/resources/[resource]/[id]/action/route';
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
  if (!adminRole || !sellerRole) throw new Error('ADMIN/SELLER roles not seeded — run db:seed-rbac');

  const mk = async (first: string, suffix: string, roleId: string) => {
    const u = await (db as any).user.create({
      data: { firstName: first, lastName: 'T30', email: `t30-${suffix}-${ts}@test.local`,
        mobile: `0915${ts}${suffix}`, passwordHash: 'x', status: 'ACTIVE', userType: 'BUSINESS' },
    });
    await (db as any).userRole.create({ data: { userId: u.id, roleId } });
    return u.id;
  };
  adminId = await mk('Admin', '30a', adminRole.id);
  sellerAId = await mk('SellerA', '30b', sellerRole.id);
  sellerBId = await mk('SellerB', '30c', sellerRole.id);
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
  const d = await (db as any).deal.create({
    data: { dealNumber: `DEAL-${ts}${numSuffix}`, sourceType: 'LISTING_OFFER', sourceId: 'src-' + numSuffix,
      sellerId, status, currency: 'IRR', transactionType: 'SALE', agreedAmount: BigInt(10000) },
  });
  createdDealIds.push(d.id);
  return d;
}

// ════════════════════════════════════════════════════════════════════
// STEP 12.30 — 6 Mandatory Scenarios (directive Phase 1 table)
// ════════════════════════════════════════════════════════════════════

describe.skipIf(!RUN)('STEP 12.30 — Deals Tenant Isolation (6 mandatory scenarios)', () => {

  // ── Scenario 1: sellerA list → ONLY own deals ──────────────────────
  it('S1: sellerA list via Universal Route → sees ONLY own deals (NOT sellerB\'s)', async () => {
    const mine = await seedDeal(sellerAId, '01');
    const other = await seedDeal(sellerBId, '02');
    mockCurrentUser = { id: sellerAId, firstName: 'SellerA' };
    const res = await listGET(makeReq('GET', 'http://localhost/api/admin/resources/deals'), rp());
    expect(res.status).toBe(200);
    const body = await res.json();
    const nums = body.data.items.map((i: any) => i.dealNumber);
    expect(nums).toContain(mine.dealNumber);
    expect(nums).not.toContain(other.dealNumber); // sellerB's deal MUST NOT be visible
  });

  // ── Scenario 2: sellerA GET dealB → 404 (fail-closed) ──────────────
  it('S2: sellerA GET sellerB deal detail → 404 (fail-closed, no existence leak)', async () => {
    const dealB = await seedDeal(sellerBId, '11');
    mockCurrentUser = { id: sellerAId, firstName: 'SellerA' };
    const res = await itemGET(makeReq('GET', `http://localhost/api/admin/resources/deals/${dealB.id}`), rp(dealB.id));
    expect(res.status).toBe(404);
  });

  // ── Scenario 3: sellerA PATCH dealB → reject + NO mutation ─────────
  it('S3: sellerA PATCH sellerB deal → 404 + sellerB deal UNCHANGED', async () => {
    const dealB = await seedDeal(sellerBId, '12', 'DRAFT');
    const origStatus = dealB.status;
    mockCurrentUser = { id: sellerAId, firstName: 'SellerA' };
    const res = await universalPATCH(
      makeReq('PATCH', `http://localhost/api/admin/resources/deals/${dealB.id}`, {
        dealNumber: dealB.dealNumber, sourceType: 'LISTING_OFFER', sourceId: dealB.sourceId,
        status: 'COMPLETED', // attempt to change status
      }),
      rp(dealB.id),
    );
    expect([404, 403]).toContain(res.status); // reject (404 fail-closed or 403 perm)
    const row = await (db as any).deal.findUnique({ where: { id: dealB.id } });
    expect(row.status).toBe(origStatus); // UNCHANGED — no mutation
  });

  // ── Scenario 4: sellerA DELETE dealB → reject + deal remains ───────
  it('S4: sellerA DELETE sellerB deal → 404 + deal STILL EXISTS', async () => {
    const dealB = await seedDeal(sellerBId, '13');
    mockCurrentUser = { id: sellerAId, firstName: 'SellerA' };
    const res = await universalDELETE(makeReq('DELETE', `http://localhost/api/admin/resources/deals/${dealB.id}`), rp(dealB.id));
    expect([404, 403]).toContain(res.status); // reject
    const row = await (db as any).deal.findUnique({ where: { id: dealB.id } });
    expect(row).not.toBeNull(); // deal STILL EXISTS — no deletion
  });

  // ── Scenario 5: sellerA action on dealB → reject + NO status change ─
  it('S5: sellerA confirm action on sellerB deal → reject + NO status change + NO audit', async () => {
    const dealB = await seedDeal(sellerBId, '14', 'DRAFT');
    mockCurrentUser = { id: sellerAId, firstName: 'SellerA' };
    // Route may throw TypeError (circular JSON) if the bypass allows the action
    // (the result contains a Prisma model accessor). We catch the error and
    // check the DB state directly — if status changed to CONFIRMED, the bypass
    // is proven; if it stays DRAFT, the fix works.
    let resStatus: number | null = null;
    let bodyOk: boolean | null = null;
    try {
      const res = await actionPOST(
        makeReq('POST', `http://localhost/api/admin/resources/deals/${dealB.id}/action`, { action: 'confirm', reason: 'unauthorized attempt' }),
        rp(dealB.id),
      );
      resStatus = res.status;
      bodyOk = (await res.json().catch(() => ({}))).ok ?? null;
    } catch (e) {
      // TypeError: circular structure — means the action SUCCEEDED (bypass active)
      // but the route couldn't serialize the result. This IS the bypass proof.
      resStatus = 500; // proxy for "route threw"
    }
    const row = await (db as any).deal.findUnique({ where: { id: dealB.id } });
    // The KEY assertion: did the deal status change?
    if (row.status === 'CONFIRMED') {
      // BEFORE FIX: bypass allowed the action — deal status changed (THE BUG)
      // Mark as failed by asserting the expected (DRAFT) — this fails, proving the bypass.
      expect(row.status).toBe('DRAFT'); // fails — documents the bypass
    } else {
      // AFTER FIX: rejected — deal status UNCHANGED
      expect(row.status).toBe('DRAFT'); // passes — fix works
      const audit = await (db as any).auditLog.count({
        where: { actorId: sellerAId, action: 'deals.confirm', entityId: dealB.id },
      });
      expect(audit).toBe(0); // no audit for rejected action
    }
  });

  // ── Scenario 6: sellerA action on dealA (own) → success ────────────
  it('S6: sellerA confirm action on OWN deal → success + status CONFIRMED + audit', async () => {
    // NOTE: Uses executeAction directly (not the action route) because the action
    // route has a separate serialization bug (TypeError: circular structure when
    // serializing the result with Prisma model accessor). That bug is NOT
    // P0-DEAL-01 and is out of scope for STEP 12.30. The point of S6 is to prove
    // the positive path (owner can act on own deal) — executeAction is the
    // executable contract, the route is just an HTTP adapter.
    const dealA = await seedDeal(sellerAId, '15', 'DRAFT');
    const result = await executeAction('deals', dealA.id, 'confirm', {
      userId: sellerAId,
      tenantCtx: { userId: sellerAId, isAdmin: false, hasModeratePerm: false },
    });
    expect(result.success).toBe(true);
    const row = await (db as any).deal.findUnique({ where: { id: dealA.id } });
    expect(row.status).toBe('CONFIRMED');
    const audit = await (db as any).auditLog.count({
      where: { actorId: sellerAId, action: 'deals.confirm', entityId: dealA.id },
    });
    expect(audit).toBeGreaterThanOrEqual(1); // audit logged
  });
});

// ════════════════════════════════════════════════════════════════════
// Additional integrity: admin + moderator behavior (must NOT regress)
// ════════════════════════════════════════════════════════════════════

describe.skipIf(!RUN)('STEP 12.30 — Deals admin/moderator (no regression)', () => {
  it('S7: admin list → sees ALL deals (no tenant filter)', async () => {
    const a = await seedDeal(sellerAId, '21');
    const b = await seedDeal(sellerBId, '22');
    mockCurrentUser = { id: adminId, firstName: 'Admin' };
    const res = await listGET(makeReq('GET', 'http://localhost/api/admin/resources/deals'), rp());
    expect(res.status).toBe(200);
    const body = await res.json();
    const nums = body.data.items.map((i: any) => i.dealNumber);
    expect(nums).toContain(a.dealNumber);
    expect(nums).toContain(b.dealNumber); // admin sees both
  });

  it('S8: admin confirm sellerA deal → success + audit', async () => {
    // Uses executeAction directly (same rationale as S6 — route serialization bug
    // is out of scope).
    const dealA = await seedDeal(sellerAId, '23', 'DRAFT');
    const result = await executeAction('deals', dealA.id, 'confirm', { userId: adminId });
    expect(result.success).toBe(true);
    const row = await (db as any).deal.findUnique({ where: { id: dealA.id } });
    expect(row.status).toBe('CONFIRMED');
  });

  it('S9: sellerA GET own deal → 200 (positive ownership)', async () => {
    const dealA = await seedDeal(sellerAId, '24');
    mockCurrentUser = { id: sellerAId, firstName: 'SellerA' };
    const res = await itemGET(makeReq('GET', `http://localhost/api/admin/resources/deals/${dealA.id}`), rp(dealA.id));
    expect(res.status).toBe(200);
  });

  it('S10: no-mutation-on-reject — sellerA PATCH dealB leaves ALL fields unchanged', async () => {
    const dealB = await seedDeal(sellerBId, '25', 'DRAFT');
    const orig = await (db as any).deal.findUnique({ where: { id: dealB.id } });
    mockCurrentUser = { id: sellerAId, firstName: 'SellerA' };
    await universalPATCH(
      makeReq('PATCH', `http://localhost/api/admin/resources/deals/${dealB.id}`, {
        dealNumber: dealB.dealNumber, sourceType: 'LISTING_OFFER', sourceId: dealB.sourceId,
        status: 'COMPLETED', notes: 'HACKED', transactionType: 'RENT',
      }),
      rp(dealB.id),
    );
    const after = await (db as any).deal.findUnique({ where: { id: dealB.id } });
    expect(after.status).toBe(orig.status); // DRAFT
    expect(after.notes).toBe(orig.notes); // null — not hacked
    expect(after.transactionType).toBe(orig.transactionType); // SALE — not changed
  });
});
