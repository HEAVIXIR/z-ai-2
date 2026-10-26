import { describe, expect, it } from 'vitest';
import { evaluateOutboxResponse } from '../../scripts/check-store-audit-outbox-response.mjs';

const NOW = Date.parse('2026-10-26T12:00:00.000Z');

function response(overrides?: {
  drain?: Record<string, unknown>;
  stats?: Record<string, unknown>;
}) {
  return {
    ok: true,
    drain: { delivered: 2, failed: 0, remaining: 1, ...overrides?.drain },
    stats: {
      pending: 1,
      processing: 0,
      delivered: 8,
      failed: 0,
      oldestPendingAt: '2026-10-26T11:55:00.000Z',
      ...overrides?.stats,
    },
  };
}

describe('Store AuditOutbox response monitoring gate', () => {
  it('passes when the backlog is within the configured age SLO and no deliveries failed', () => {
    const result = evaluateOutboxResponse(response(), 900, NOW);

    expect(result.ok).toBe(true);
    expect(result.problems).toEqual([]);
    expect(result.summary?.oldestPendingAgeSeconds).toBe(300);
  });

  it('fails when a delivery fails during the current drain', () => {
    const result = evaluateOutboxResponse(response({ drain: { failed: 1 } }), 900, NOW);

    expect(result.ok).toBe(false);
    expect(result.problems).toContain('one or more deliveries failed during this run');
  });

  it('fails while any exhausted FAILED outbox row remains', () => {
    const result = evaluateOutboxResponse(response({ stats: { failed: 1 } }), 900, NOW);

    expect(result.ok).toBe(false);
    expect(result.problems).toContain('FAILED outbox rows require investigation');
  });

  it('fails when the oldest outstanding event exceeds the configured age SLO', () => {
    const result = evaluateOutboxResponse(
      response({ stats: { oldestPendingAt: '2026-10-26T11:40:00.000Z' } }),
      900,
      NOW,
    );

    expect(result.ok).toBe(false);
    expect(result.problems).toContain('oldest outstanding outbox event exceeds the configured age SLO');
  });

  it('fails closed when outstanding work has no oldest-event timestamp', () => {
    const result = evaluateOutboxResponse(response({ stats: { oldestPendingAt: null } }), 900, NOW);

    expect(result.ok).toBe(false);
    expect(result.problems).toContain('outstanding events exist but oldestPendingAt is missing');
  });

  it('passes with no backlog and no oldest-event timestamp', () => {
    const result = evaluateOutboxResponse(
      response({ stats: { pending: 0, processing: 0, oldestPendingAt: null } }),
      900,
      NOW,
    );

    expect(result.ok).toBe(true);
  });

  it('fails closed for malformed counters, malformed timestamps, or invalid SLO configuration', () => {
    expect(evaluateOutboxResponse(response({ stats: { pending: -1 } }), 900, NOW).ok).toBe(false);
    expect(evaluateOutboxResponse(response({ stats: { oldestPendingAt: 'not-a-date' } }), 900, NOW).ok).toBe(false);
    expect(evaluateOutboxResponse(response(), 0, NOW).ok).toBe(false);
  });

  it('fails closed when the worker response omits its required contract', () => {
    expect(evaluateOutboxResponse({ ok: true }, 900, NOW).ok).toBe(false);
  });
});
