import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { drainAuditOutbox, getAuditOutboxStats } from '@/lib/store-audit-outbox';

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
    const drain = await drainAuditOutbox({ batchSize: 50, maxAttempts: 5 });
    const stats = await getAuditOutboxStats();
    return NextResponse.json({ ok: true, drain, stats });
  } catch (error) {
    console.error('[store-audit-outbox] drain failed', error);
    return NextResponse.json({ error: 'audit outbox drain failed' }, { status: 500 });
  }
}
