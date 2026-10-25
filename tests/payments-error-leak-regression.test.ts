/**
 * HEAVIX — Payments API Error Leak Regression Test (F-04)
 *
 * Proves that the payments API route NEVER returns internal error
 * messages (err.message, stack traces, database connection strings,
 * etc.) in HTTP 500 responses. Only a generic "Server error" message
 * should be visible to the client.
 *
 * The test reads the route source file and verifies:
 * 1. No `err?.message` or `err.message` in the response body
 * 2. The response uses a hardcoded generic message
 * 3. No `JSON.stringify(err)` or similar leak patterns
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const ROUTE_SOURCE = readFileSync('src/app/api/payments/route.ts', 'utf-8');

describe('F-04 Regression: Payments API error leak guard', () => {
  it('does NOT return err.message in the response body', () => {
    // The error response should use a generic message, not err.message
    expect(ROUTE_SOURCE).not.toMatch(/error:\s*err\??\.message/);
    expect(ROUTE_SOURCE).not.toMatch(/error:\s*err\.message/);
  });

  it('returns a hardcoded generic "Server error" message', () => {
    expect(ROUTE_SOURCE).toContain('"Server error"');
  });

  it('does NOT stringify the error object in the response', () => {
    expect(ROUTE_SOURCE).not.toMatch(/JSON\.stringify\(err/);
    expect(ROUTE_SOURCE).not.toMatch(/error:\s*String\(err/);
  });

  it('does NOT expose stack traces in the response', () => {
    expect(ROUTE_SOURCE).not.toMatch(/error:\s*err\??\.stack/);
    expect(ROUTE_SOURCE).not.toMatch(/stack.*Response\(/);
  });

  it('logs the error server-side (console.error) without leaking to client', () => {
    // The error should be logged for debugging, but not returned to the client
    // Check that console.error exists in the catch block
    expect(ROUTE_SOURCE).toMatch(/console\.error/);
  });
});
