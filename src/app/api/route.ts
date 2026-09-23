/**
 * HEAVIX - Root API endpoint (health check)
 * GET /api
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ok, serverError } from '@/lib/admin/response';

export const dynamic = 'force-dynamic';

export async function GET() {
  const startedAt = Date.now();
  let dbStatus: 'connected' | 'error' = 'connected';
  let dbLatencyMs: number | null = null;
  let dbError: string | null = null;

  try {
    const t0 = Date.now();
    await db.$queryRaw`SELECT 1`;
    dbLatencyMs = Date.now() - t0;
  } catch (err) {
    dbStatus = 'error';
    dbError = err instanceof Error ? err.message : String(err);
  }

  const data = {
    ok: true as const,
    service: 'HEAVIX Admin Control Plane',
    phase: 'Phase 12 - Foundation',
    version: '0.12.0',
    timestamp: new Date().toISOString(),
    uptime_s: Math.round(process.uptime()),
    health: {
      db: dbStatus,
      dbLatencyMs,
      dbError,
    },
    responseTimeMs: Date.now() - startedAt,
    endpoints: [
      'GET    /api/admin/overview',
      'GET    /api/admin/users',
      'POST   /api/admin/users',
      'GET    /api/admin/users/:id',
      'PATCH  /api/admin/users/:id',
      'DELETE /api/admin/users/:id',
      'GET    /api/admin/roles',
      'POST   /api/admin/roles',
      'GET    /api/admin/audit-logs',
      'GET    /api/admin/feature-flags',
      'POST   /api/admin/feature-flags',
      'GET    /api/admin/feature-flags/:id',
      'PATCH  /api/admin/feature-flags/:id',
      'DELETE /api/admin/feature-flags/:id',
      'GET    /api/admin/settings',
      'POST   /api/admin/settings',
    ],
  };

  if (dbStatus === 'error') {
    return serverError('Database unreachable', data);
  }
  return ok(data);
}
