/**
 * HEAVIX — F-04 Integration Test: Payments API error leak prevention
 *
 * This test calls the REAL payments route handler with a simulated
 * database failure and inspects the actual HTTP 500 response body
 * to verify it does NOT contain internal error details.
 */

import { describe, it, expect, vi } from 'vitest';

// Mock next/headers (required by the route for auth)
vi.mock('next/headers', () => ({
  headers: vi.fn(() => new Headers()),
  cookies: vi.fn(() => ({
    get: vi.fn(() => undefined),
  })),
}));

// Mock the store database to throw an error with internal details
vi.mock('@/lib/store-db', () => ({
  storeDb: {
    payment: {
      findMany: vi.fn().mockRejectedValue(
        new Error('ECONNREFUSED 127.0.0.1:5432 — password=secret123 db=heavix_test')
      ),
    },
  },
}));

// Mock the auth module to skip auth (we're testing error handling, not auth)
vi.mock('@/lib/auth', () => ({
  getCurrentUserId: vi.fn().mockResolvedValue('test-user-id'),
}));

describe('F-04 Integration: Payments API never leaks internal errors in HTTP 500', () => {
  it('returns generic "Server error" in 500 response body (no internal details)', async () => {
    const { GET } = await import('@/app/api/payments/route');

    const request = new Request('http://localhost:3000/api/payments', {
      method: 'GET',
    });

    const response = await GET(request);
    const body = await response.json();

    // Status must be 500
    expect(response.status).toBe(500);

    // Body must contain only the generic message
    expect(body.error).toBe('Server error');

    // Body must NOT contain any internal error details
    const bodyStr = JSON.stringify(body);
    expect(bodyStr).not.toContain('ECONNREFUSED');
    expect(bodyStr).not.toContain('password');
    expect(bodyStr).not.toContain('secret123');
    expect(bodyStr).not.toContain('heavix_test');
    expect(bodyStr).not.toContain('127.0.0.1');
    expect(bodyStr).not.toContain('5432');
    expect(bodyStr).not.toContain('stack');
    expect(bodyStr).not.toContain('Error:');
  });
});
