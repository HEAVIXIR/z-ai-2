/**
 * HEAVIX — Caddy Configuration Safety Test (F-02 regression guard)
 *
 * Validates that:
 * 1. Production Caddyfile has NO XTransformPort routing (SSRF prevention)
 * 2. Production Caddyfile has NO :81 sandbox listener
 * 3. Production Caddyfile has :80 redirect + :443 HTTPS
 * 4. Sandbox Caddyfile has XTransformPort + :81 (for local dev)
 * 5. Production and sandbox are separate files
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';

const PROD_CADDY = readFileSync('Caddyfile', 'utf-8');
const SANDBOX_EXISTS = existsSync('Caddyfile.sandbox');
const SANDBOX_CADDY = SANDBOX_EXISTS ? readFileSync('Caddyfile.sandbox', 'utf-8') : '';

describe('Caddy Configuration Safety (F-02 regression guard)', () => {
  describe('Production Caddyfile', () => {
    it('has :80 listener for HTTP→HTTPS redirect', () => {
      expect(PROD_CADDY).toMatch(/:80\s*\{/);
      expect(PROD_CADDY).toContain('redir https://{host}{uri} permanent');
    });

    it('has :443 listener for production HTTPS', () => {
      expect(PROD_CADDY).toMatch(/:443/);
    });

    it('has domain placeholder for configurable TLS hostname', () => {
      expect(PROD_CADDY).toContain('{$HEAVIX_DOMAIN:localhost}');
    });

    it('does NOT have :81 sandbox listener', () => {
      expect(PROD_CADDY).not.toMatch(/:81\s*\{/);
    });

    it('does NOT have XTransformPort routing (SSRF prevention)', () => {
      expect(PROD_CADDY).not.toContain('XTransformPort');
      expect(PROD_CADDY).not.toContain('transform_port_query');
    });
  });

  describe.skipIf(!SANDBOX_EXISTS)('Sandbox Caddyfile (separate file)', () => {
    it('has :81 sandbox listener', () => {
      expect(SANDBOX_CADDY).toMatch(/:81\s*\{/);
    });

    it('has XTransformPort routing (for local dev only)', () => {
      expect(SANDBOX_CADDY).toContain('XTransformPort');
      expect(SANDBOX_CADDY).toContain('transform_port_query');
    });

    it('does NOT have :80 or :443 (sandbox is separate from production)', () => {
      expect(SANDBOX_CADDY).not.toMatch(/:80\s*\{/);
      expect(SANDBOX_CADDY).not.toMatch(/:443/);
    });
  });
});
