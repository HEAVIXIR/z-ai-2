/**
 * HEAVIX - Admin API response helpers
 *
 * Standardises JSON responses for /api/admin/* endpoints.
 */

import { NextResponse } from 'next/server';

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data }, init);
}

export function fail(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ ok: false, error: message, details }, { status });
}

export function notFound(message = 'Not found') {
  return NextResponse.json({ ok: false, error: message }, { status: 404 });
}

export function unauthorized(message = 'Unauthorized') {
  return NextResponse.json({ ok: false, error: message }, { status: 401 });
}

export function forbidden(message = 'Forbidden') {
  return NextResponse.json({ ok: false, error: message }, { status: 403 });
}

export function serverError(message = 'Internal server error', details?: unknown) {
  return NextResponse.json({ ok: false, error: message, details }, { status: 500 });
}

/**
 * Parse a JSON body safely. Returns `null` on parse failure (caller decides
 * whether that's a 400 or just an empty body).
 */
export async function parseJsonBody<T = unknown>(req: Request): Promise<T | null> {
  try {
    const text = await req.text();
    if (!text) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/**
 * Get the "current admin" context. For Phase 12 (Foundation), we don't yet
 * have real session-based auth; we attribute actions to the super-admin user
 * seeded in the database. This will be replaced with real session/JWT auth in
 * a later phase.
 */
export async function getAdminContext(): Promise<{ actorId: string; actorEmail: string }> {
  // For now, attribute to the seeded super-admin.
  // In a later phase, read from a signed session cookie.
  const { db } = await import('@/lib/db');
  const admin = await db.user.findFirst({
    where: { role: 'SUPER_ADMIN' },
    orderBy: { createdAt: 'asc' },
  });
  if (!admin) {
    throw new Error('No super-admin found. Run `bun run db:seed` first.');
  }
  return { actorId: admin.id, actorEmail: admin.email };
}
