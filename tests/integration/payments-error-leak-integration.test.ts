/**
 * HEAVIX — F-04 Integration Test: Payments API error leak prevention
 *
 * This test calls the REAL payments route handler with a simulated
 * database failure on the ACTUAL dependency (@/lib/db, not @/lib/store-db)
 * and inspects the actual HTTP 500 response body.
 *
 * The test also ASSERTS that the mock was actually called, proving
 * the 500 response came from the injected DB error — not an earlier
 * failure in the request pipeline.
 */

import { describe, it, expect, vi } from 'vitest';

// Mock next/headers (required by the route for auth)
vi.mock('next/headers', () => ({
  headers: vi.fn(() => new Headers()),
  cookies: vi.fn(() => ({
    get: vi.fn(() => undefined),
  })),
}));

// Create a mock that we can assert on later
const mockFindMany = vi.fn().mockRejectedValue(
  new Error('ECONNREFUSED 127.0.0.1:5432 — password=secret123 db=heavix_test')
);
const mockCount = vi.fn().mockRejectedValue(
  new Error('ECONNREFUSED 127.0.0.1:5432 — password=secret123 db=heavix_test')
);

// Mock the ACTUAL dependency: @/lib/db
vi.mock('@/lib/db', () => ({
  db: {
    payment: {
      findMany: mockFindMany,
      count: mockCount,
    },
  },
}));

// Mock the auth module
vi.mock('@/lib/auth', () => ({
  getCurrentUserId: vi.fn().mockResolvedValue('test-user-id'),
}));

describe('F-04 Integration: Payments API never leaks internal errors in HTTP 500', () => {
  it('returns generic "Server error" when db.payment.findMany throws (no internal details leaked)', async () => {
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

  it('proves the 500 came from the injected DB error (mock was actually called)', async () => {
    // Reset mock call history
    mockFindMany.mockClear();
    mockCount.mockClear();

    const { GET } = await import('@/app/api/payments/route');

    const request = new Request('http://localhost:3000/api/payments', {
      method: 'GET',
    });

    const response = await GET(request);

    // The 500 response must be the result of the mock being called
    expect(response.status).toBe(500);

    // Assert the mock was actually called — proving the error path
    // went through db.payment.findMany (not an earlier failure)
    expect(mockFindMany).toHaveBeenCalled();

    // The mock should have been called with a where clause containing userId
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'test-user-id',
        }),
      }),
    );
  });
});
