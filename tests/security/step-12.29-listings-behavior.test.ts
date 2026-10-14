/**
 * STEP 12.29 — listings Resource Behavioral Verification
 * ======================================================
 *
 * Resource: listings (listing.ts config)
 * Profile:  TENANT-SCOPED (ownership: { ownerField: 'sellerId',
 *           moderatePermission: 'listing.moderate' }).
 *           CRUD perms: listing.read/create/update/delete/publish/export.
 *           Actions: publish (listing.publish), feature, verify, delete.
 *
 * Harness:  Pattern B+ — REAL route handlers (Universal Resource API) +
 *           REAL executeAction (action-engine) + REAL RBAC + REAL DB +
 *           REAL audit. Only @/lib/auth.getCurrentUser + next/cache +
 *           next/headers are mocked (infrastructure, not the contract).
 *
 * Actors:   admin (ADMIN → all perms), sellerA + sellerB (SELLER →
 *           listing.read/create/update/publish, deal.read/manage),
 *           moderator (MODERATOR → listing.read/moderate/publish).
 *
 * Critical invariants under test:
 *   - Tenant scope: seller sees ONLY own listings (buildTenantWhere).
 *   - Fail-closed: non-owner gets 404 (not 403 — no existence leak).
 *   - No mutation on rejected PATCH/DELETE (DB state unchanged).
 *   - Mass-assignment of sellerId is rejected (assertCreateOwner).
 *   - Moderator bypasses tenant filter (sees all).
 *   - publish action: ownership checked inside executeAction.
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
import { GET as listGET, POST as universalPOST } from '@/app/api/admin/resources/[resource]/route';
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
const rp = (id?: string) => ({ params: Promise.resolve(id ? { resource: 'listings', id } : { resource: 'listings' }) });

let adminId = '', sellerAId = '', sellerBId = '', modId = '';
let adminRole: any, sellerRole: any, modRole: any;
const createdListingIds: string[] = [];
const ts = Date.now();

beforeAll(async () => {
  if (!RUN) return;
  adminRole = await (db as any).role.findUnique({ where: { key: 'ADMIN' } });
  sellerRole = await (db as any).role.findUnique({ where: { key: 'SELLER' } });
  modRole = await (db as any).role.findUnique({ where: { key: 'MODERATOR' } });
  if (!adminRole || !sellerRole || !modRole) throw new Error('roles not seeded');

  const mk = async (first: string, suffix: string, roleId: string) => {
    const u = await (db as any).user.create({
      data: { firstName: first, lastName: 'T29L', email: `t29l-${suffix}-${ts}@test.local`,
        mobile: `0912${ts}${suffix}`, passwordHash: 'x', status: 'ACTIVE', userType: 'BUSINESS' },
    });
    await (db as any).userRole.create({ data: { userId: u.id, roleId } });
    return u.id;
  };
  adminId = await mk('Admin', 'a1', adminRole.id);
  sellerAId = await mk('SellerA', 'a2', sellerRole.id);
  sellerBId = await mk('SellerB', 'a3', sellerRole.id);
  modId = await mk('Mod', 'a4', modRole.id);
}, 60000);

afterAll(async () => {
  if (!RUN) return;
  for (const id of createdListingIds) await (db as any).listing.deleteMany({ where: { id } }).catch(() => {});
  await (db as any).auditLog.deleteMany({ where: { actorId: { in: [adminId, sellerAId, sellerBId, modId] } } }).catch(() => {});
  await (db as any).userRole.deleteMany({ where: { userId: { in: [adminId, sellerAId, sellerBId, modId] } } }).catch(() => {});
  await (db as any).user.deleteMany({ where: { id: { in: [adminId, sellerAId, sellerBId, modId] } } }).catch(() => {});
}, 60000);

beforeEach(() => { mockCurrentUser = null; });

async function seedListing(sellerId: string, slugSuffix: string, status = 'DRAFT') {
  const l = await (db as any).listing.create({
    data: { title: `Listing ${slugSuffix}`, slug: `t29l-${slugSuffix}-${ts}`, sellerId, status,
      listingType: 'SALE', priceType: 'NEGOTIABLE' },
  });
  createdListingIds.push(l.id);
  return l;
}

// ── Happy path ───────────────────────────────────────────────────────
describe.skipIf(!RUN)('STEP 12.29 — listings: happy path (tenant-scoped CRUD)', () => {
  it('H-L1: sellerA create listing → 201 + sellerId=A + audit', async () => {
    mockCurrentUser = { id: sellerAId, firstName: 'SellerA' };
    const slug = `t29l-h1-${ts}`;
    const res = await universalPOST(
      makeReq('POST', 'http://localhost/api/admin/resources/listings', {
        title: 'آگهی تست H-L1', slug, listingType: 'SALE', priceType: 'NEGOTIABLE', status: 'DRAFT',
        city: 'Tehran', sellerName: 'SellerA', sellerPhone: '09120000000',
      }),
      rp(),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    createdListingIds.push(body.data.id);
    const row = await (db as any).listing.findUnique({ where: { id: body.data.id } });
    expect(row.sellerId).toBe(sellerAId); // owner injected server-side
    const audit = await (db as any).auditLog.count({ where: { actorId: sellerAId, entityType: 'Listing' } });
    expect(audit).toBeGreaterThanOrEqual(1);
  });

  it('H-L2: sellerA list → sees ONLY own listings (tenant scope)', async () => {
    const mine = await seedListing(sellerAId, 'h2a');
    const other = await seedListing(sellerBId, 'h2b');
    mockCurrentUser = { id: sellerAId, firstName: 'SellerA' };
    const res = await listGET(
      makeReq('GET', 'http://localhost/api/admin/resources/listings'),
      rp(),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    // NOTE: filterReadableFieldsAsync strips `id` (not in config.fields), so we
    // identify items by `title` (a declared field) instead.
    const titles = body.data.items.map((i: any) => i.title);
    expect(titles).toContain(mine.title);
    expect(titles).not.toContain(other.title); // sellerB's listing NOT visible
  });

  it('H-L3: moderator list → sees ALL listings (hasModeratePerm bypass)', async () => {
    const a = await seedListing(sellerAId, 'h3a');
    const b = await seedListing(sellerBId, 'h3b');
    mockCurrentUser = { id: modId, firstName: 'Mod' };
    const res = await listGET(
      makeReq('GET', 'http://localhost/api/admin/resources/listings'),
      rp(),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    const titles = body.data.items.map((i: any) => i.title);
    expect(titles).toContain(a.title);
    expect(titles).toContain(b.title); // moderator sees sellerB's too
  });
});

// ── Negative path (cross-tenant + invalid) ───────────────────────────
describe.skipIf(!RUN)('STEP 12.29 — listings: negative path (cross-tenant fail-closed)', () => {
  it('N-L1: sellerA GET sellerB listing → 404 (fail-closed, no leak)', async () => {
    const b = await seedListing(sellerBId, 'n1');
    mockCurrentUser = { id: sellerAId, firstName: 'SellerA' };
    const res = await itemGET(
      makeReq('GET', `http://localhost/api/admin/resources/listings/${b.id}`),
      rp(b.id),
    );
    expect(res.status).toBe(404);
  });

  it('N-L2: sellerA PATCH sellerB listing → 404 + sellerB row UNCHANGED', async () => {
    const b = await seedListing(sellerBId, 'n2', 'DRAFT');
    const origTitle = b.title;
    mockCurrentUser = { id: sellerAId, firstName: 'SellerA' };
    const res = await universalPATCH(
      makeReq('PATCH', `http://localhost/api/admin/resources/listings/${b.id}`, {
        title: 'هک شده', listingType: 'SALE', priceType: 'NEGOTIABLE', status: 'DRAFT',
      }),
      rp(b.id),
    );
    expect(res.status).toBe(404);
    const row = await (db as any).listing.findUnique({ where: { id: b.id } });
    expect(row.title).toBe(origTitle); // unchanged — no mutation
    expect(row.status).toBe('DRAFT');
  });

  it('N-L3: sellerA DELETE sellerB listing → 403 (sellerA lacks listing.delete) + row STILL EXISTS', async () => {
    // NOTE: SELLER role (permissions.ts:248) has listing.read/create/update/publish
    // but NOT listing.delete. So requireAdmin('listing.delete') returns 403 BEFORE
    // the tenant-scope check. The tenant-scope 404-on-DELETE path is only
    // reachable by a role that HAS listing.delete but isn't admin/moderator —
    // no such role exists in the RBAC seed. This is a documented design
    // observation: DELETE tenant-scope is effectively admin-gated.
    const b = await seedListing(sellerBId, 'n3');
    mockCurrentUser = { id: sellerAId, firstName: 'SellerA' };
    const res = await universalDELETE(
      makeReq('DELETE', `http://localhost/api/admin/resources/listings/${b.id}`),
      rp(b.id),
    );
    expect(res.status).toBe(403); // permission denied (no listing.delete)
    const row = await (db as any).listing.findUnique({ where: { id: b.id } });
    expect(row).not.toBeNull(); // still exists — no mutation
  });

  it('N-L4: sellerA create with sellerId=B in payload (mass-assignment of owner) → rejected', async () => {
    mockCurrentUser = { id: sellerAId, firstName: 'SellerA' };
    const slug = `t29l-n4-${ts}`;
    const res = await universalPOST(
      makeReq('POST', 'http://localhost/api/admin/resources/listings', {
        title: 'تلاش جعل مالکیت', slug, listingType: 'SALE', priceType: 'NEGOTIABLE', status: 'DRAFT',
        sellerId: sellerBId, // mass-assignment attempt — claims sellerB as owner
      }),
      rp(),
    );
    // assertCreateOwner rejects: sellerId in payload ≠ authenticated user
    expect([403, 404, 400]).toContain(res.status);
    // No row created with sellerId=B under this slug
    const row = await (db as any).listing.findUnique({ where: { slug } });
    if (row) {
      // If a row WAS created, it must NOT be owned by sellerB
      expect(row.sellerId).not.toBe(sellerBId);
      createdListingIds.push(row.id);
    }
  });

  it('N-L5: invalid input (title too short, minLength 5) → EXPECTED 422 [VALIDATOR BUG — currently returns 201]', async () => {
    // EXPECTED: listing.ts declares title minLength: 5, so 'AB' (2 chars) MUST be 422.
    // ACTUAL: validator chaining bug (P1-VAL-01) drops minLength when maxLength present.
    mockCurrentUser = { id: sellerAId, firstName: 'SellerA' };
    const slug = `t29l-n5-${ts}`;
    const res = await universalPOST(
      makeReq('POST', 'http://localhost/api/admin/resources/listings', {
        title: 'AB', // minLength: 5 → SHOULD fail
        slug, listingType: 'SALE', priceType: 'NEGOTIABLE', status: 'DRAFT',
      }),
      rp(),
    );
    expect(res.status).toBe(422);
  });
});

// ── Integrity (publish action via executeAction) ─────────────────────
describe.skipIf(!RUN)('STEP 12.29 — listings: integrity (publish action + ownership)', () => {
  it('I-L1: admin publish sellerA listing via executeAction → status PUBLISHED + audit', async () => {
    const a = await seedListing(sellerAId, 'i1', 'DRAFT');
    const result = await executeAction('listings', a.id, 'publish', { userId: adminId });
    expect(result.success).toBe(true);
    const row = await (db as any).listing.findUnique({ where: { id: a.id } });
    expect(row.status).toBe('PUBLISHED');
    const audit = await (db as any).auditLog.count({
      where: { actorId: adminId, action: 'listings.publish', entityId: a.id },
    });
    expect(audit).toBeGreaterThanOrEqual(1);
  });

  it('I-L2: sellerB publish sellerA listing → ownership denied (not found) + NO mutation', async () => {
    const a = await seedListing(sellerAId, 'i2', 'DRAFT');
    const result = await executeAction('listings', a.id, 'publish', {
      userId: sellerBId,
      tenantCtx: { userId: sellerBId, isAdmin: false, hasModeratePerm: false },
    });
    // executeAction returns "Entity not found" for non-owners (fail-closed)
    expect(result.success).toBe(false);
    const row = await (db as any).listing.findUnique({ where: { id: a.id } });
    expect(row.status).toBe('DRAFT'); // unchanged — no mutation
    const audit = await (db as any).auditLog.count({
      where: { actorId: sellerBId, action: 'listings.publish', entityId: a.id },
    });
    expect(audit).toBe(0); // no audit for rejected action
  });
});
