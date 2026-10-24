import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { drainAuditOutbox, getAuditOutboxStats, requeueFailedAuditOutbox } from '@/lib/store-audit-outbox';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isAuthorized(request: Request, secret: string): boolean {
  const match = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') ?? '');
  if (!match?.[1]) return false;
  const supplied = Buffer.from(match[1]);
  const expected = Buffer.from(secret);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'audit outbox worker is not configured' }, { status: 503 });
  }
  if (!isAuthorized(request, secret)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    let retryFailedIds: string[] | undefined;
    if ((request.headers.get('content-type') ?? '').includes('application/json')) {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
      }
      const candidate = (body as { retryFailedIds?: unknown } | null)?.retryFailedIds;
      if (candidate !== undefined) {
        if (!Array.isArray(candidate) || candidate.length < 1 || candidate.length > 100 ||
            !candidate.every((id) => typeof id === 'string' && id.length > 0 && id.length <= 128)) {
          return NextResponse.json({ error: 'retryFailedIds must be an array of 1-100 non-empty IDs' }, { status: 400 });
        }
        retryFailedIds = candidate;
      }
    }

    const requeued = retryFailedIds ? await requeueFailedAuditOutbox(retryFailedIds) : 0;
    const drain = await drainAuditOutbox({
      batchSize: 50,
      maxAttempts: 5,
      ...(retryFailedIds ? { onlyIds: retryFailedIds } : {}),
    });
    const stats = await getAuditOutboxStats();
    return NextResponse.json({ ok: true, requeued, drain, stats });
  } catch (error) {
    console.error('[store-audit-outbox] drain failed', error);
    return NextResponse.json({ error: 'audit outbox drain failed' }, { status: 500 });
  }
}
