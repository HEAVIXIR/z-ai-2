import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const outboxMocks = vi.hoisted(() => ({
  drainAuditOutbox: vi.fn(),
  getAuditOutboxStats: vi.fn(),
  requeueFailedAuditOutbox: vi.fn(),
}));

vi.mock('@/lib/store-audit-outbox', () => outboxMocks);

import { POST } from '@/app/api/internal/store-audit-outbox/route';

const originalCronSecret = process.env.CRON_SECRET;

function request(options?: {
  authorization?: string;
  contentType?: string;
  body?: string;
}): Request {
  const headers = new Headers();
  if (options?.authorization !== undefined) {
    headers.set('authorization', options.authorization);
  }
  if (options?.contentType !== undefined) {
    headers.set('content-type', options.contentType);
  }
  return new Request('http://localhost/api/internal/store-audit-outbox', {
    method: 'POST',
    headers,
    body: options?.body,
  });
}

describe('Store AuditOutbox worker route authentication and input validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = 'unit-test-cron-secret';
    outboxMocks.drainAuditOutbox.mockResolvedValue({
      delivered: 0,
      failed: 0,
      remaining: 0,
    });
    outboxMocks.getAuditOutboxStats.mockResolvedValue({
      pending: 0,
      processing: 0,
      delivered: 0,
      failed: 0,
      oldestPendingAt: null,
    });
    outboxMocks.requeueFailedAuditOutbox.mockResolvedValue(0);
  });

  afterEach(() => {
    if (originalCronSecret === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = originalCronSecret;
    }
  });

  it('fails closed with 503 when CRON_SECRET is not configured', async () => {
    delete process.env.CRON_SECRET;

    const response = await POST(request({ authorization: 'Bearer unit-test-cron-secret' }));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'audit outbox worker is not configured' });
    expect(outboxMocks.drainAuditOutbox).not.toHaveBeenCalled();
    expect(outboxMocks.getAuditOutboxStats).not.toHaveBeenCalled();
  });

  it.each([
    ['missing authorization', undefined],
    ['wrong scheme', 'Basic unit-test-cron-secret'],
    ['wrong token', 'Bearer wrong-cron-secret'],
    ['same-length wrong token', 'Bearer unit-test-cron-secreu'],
  ])('rejects %s with 401 and does not touch the outbox', async (_label, authorization) => {
    const response = await POST(request({ authorization }));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'unauthorized' });
    expect(outboxMocks.drainAuditOutbox).not.toHaveBeenCalled();
    expect(outboxMocks.requeueFailedAuditOutbox).not.toHaveBeenCalled();
    expect(outboxMocks.getAuditOutboxStats).not.toHaveBeenCalled();
  });

  it('drains and reports stats only after a valid bearer token', async () => {
    const response = await POST(request({ authorization: 'Bearer unit-test-cron-secret' }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      requeued: 0,
      drain: { delivered: 0, failed: 0, remaining: 0 },
      stats: {
        pending: 0,
        processing: 0,
        delivered: 0,
        failed: 0,
        oldestPendingAt: null,
      },
    });
    expect(outboxMocks.drainAuditOutbox).toHaveBeenCalledWith({
      batchSize: 50,
      maxAttempts: 5,
    });
    expect(outboxMocks.getAuditOutboxStats).toHaveBeenCalledOnce();
  });

  it('rejects malformed JSON before invoking any outbox operation', async () => {
    const response = await POST(request({
      authorization: 'Bearer unit-test-cron-secret',
      contentType: 'application/json',
      body: '{',
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid JSON body' });
    expect(outboxMocks.drainAuditOutbox).not.toHaveBeenCalled();
    expect(outboxMocks.requeueFailedAuditOutbox).not.toHaveBeenCalled();
  });

  it.each([
    ['empty list', []],
    ['too many IDs', Array.from({ length: 101 }, (_, index) => `id-${index}`)],
    ['non-string ID', [42]],
    ['empty ID', ['']],
    ['overlong ID', ['x'.repeat(129)]],
  ])('rejects retryFailedIds with %s', async (_label, retryFailedIds) => {
    const response = await POST(request({
      authorization: 'Bearer unit-test-cron-secret',
      contentType: 'application/json',
      body: JSON.stringify({ retryFailedIds }),
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'retryFailedIds must be an array of 1-100 non-empty IDs',
    });
    expect(outboxMocks.drainAuditOutbox).not.toHaveBeenCalled();
    expect(outboxMocks.requeueFailedAuditOutbox).not.toHaveBeenCalled();
    expect(outboxMocks.getAuditOutboxStats).not.toHaveBeenCalled();
  });

  it('limits an authenticated manual retry to the explicitly requested IDs', async () => {
    outboxMocks.requeueFailedAuditOutbox.mockResolvedValue(2);
    outboxMocks.drainAuditOutbox.mockResolvedValue({
      delivered: 2,
      failed: 0,
      remaining: 0,
    });

    const response = await POST(request({
      authorization: 'Bearer unit-test-cron-secret',
      contentType: 'application/json',
      body: JSON.stringify({ retryFailedIds: ['outbox-a', 'outbox-b'] }),
    }));

    expect(response.status).toBe(200);
    expect(outboxMocks.requeueFailedAuditOutbox).toHaveBeenCalledWith(['outbox-a', 'outbox-b']);
    expect(outboxMocks.drainAuditOutbox).toHaveBeenCalledWith({
      batchSize: 50,
      maxAttempts: 5,
      onlyIds: ['outbox-a', 'outbox-b'],
    });
    expect(outboxMocks.getAuditOutboxStats).toHaveBeenCalledOnce();
  });
});
