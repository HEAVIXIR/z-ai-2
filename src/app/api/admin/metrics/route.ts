/**
 * HEAVIX Admin - System metrics explorer
 * GET /api/admin/metrics?metric=<name>&range=<1h|6h|24h|7d>
 *
 * Returns a single metric's time series + summary stats (min/max/avg/current).
 * Used by the Metrics section for the big chart.
 */

import { db } from '@/lib/db';
import { ok, fail, serverError } from '@/lib/admin/response';
import { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const RANGES: Record<string, number> = {
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
};

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const metric = url.searchParams.get('metric') || 'requests.per_min';
    const range = url.searchParams.get('range') || '24h';
    const rangeMs = RANGES[range] ?? RANGES['24h'];
    const since = new Date(Date.now() - rangeMs);

    // Fetch all points for this metric in the range
    const points = await db.systemMetric.findMany({
      where: { metric, createdAt: { gte: since } },
      orderBy: { createdAt: 'asc' },
      take: 5000, // safety cap
    });

    if (points.length === 0) {
      return ok({
        metric,
        range,
        points: [],
        stats: { min: null, max: null, avg: null, current: null, count: 0 },
        unit: null,
      });
    }

    const values = points.map((p) => p.value);
    const sum = values.reduce((a, b) => a + b, 0);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const avg = sum / values.length;
    const current = points[points.length - 1].value;
    const first = points[0].value;
    const change = current - first;
    const changePct = first !== 0 ? (change / Math.abs(first)) * 100 : 0;

    return ok({
      metric,
      range,
      points: points.map((p) => ({ t: p.createdAt.toISOString(), v: p.value })),
      stats: {
        min: Math.round(min * 100) / 100,
        max: Math.round(max * 100) / 100,
        avg: Math.round(avg * 100) / 100,
        current: Math.round(current * 100) / 100,
        first: Math.round(first * 100) / 100,
        change: Math.round(change * 100) / 100,
        changePct: Math.round(changePct * 10) / 10,
        count: points.length,
      },
      unit: points[0].unit,
    });
  } catch (err) {
    console.error('[api/admin/metrics] error:', err);
    return serverError('Failed to load metrics', String(err));
  }
}
