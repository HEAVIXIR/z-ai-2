/**
 * HEAVIX — Caddy Configuration Safety Test (F-02 regression guard)
 *
 * Validates that:
 * 1. Production Caddyfile uses {$HEAVIX_DOMAIN} as site address (real domain, auto-TLS)
 * 2. No auto_https off (TLS auto-provisioning enabled by default)
 * 3. No localhost anywhere in production Caddyfile
 * 4. No :81 sandbox listener
 * 5. No XTransformPort or dynamic port routing
 * 6. Sandbox Caddyfile is separate
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';

const PROD_CADDY = readFileSync('Caddyfile', 'utf-8');
const SANDBOX_EXISTS = existsSync('Caddyfile.sandbox');
const SANDBOX_CADDY = SANDBOX_EXISTS ? readFileSync('Caddyfile.sandbox', 'utf-8') : '';

describe('Caddy Configuration Safety (F-02 regression guard)', () => {
  describe('Production Caddyfile', () => {
    it('uses {$HEAVIX_DOMAIN} as site address (real domain for auto-TLS)', () => {
      expect(PROD_CADDY).toContain('{$HEAVIX_DOMAIN} {');
    });

    it('does NOT use :443 as site address (would skip domain-based TLS)', () => {
      expect(PROD_CADDY).not.toMatch(/^:443\s*\{/m);
    });

    it('does NOT use :80 as site address (Caddy auto-redirects with domain)', () => {
      expect(PROD_CADDY).not.toMatch(/^:80\s*\{/m);
    });

    it('does NOT disable auto_https (TLS auto-provisioning must be enabled)', () => {
      expect(PROD_CADDY).not.toContain('auto_https off');
      expect(PROD_CADDY).not.toContain('auto_https disable_certs');
    });

    it('does NOT contain localhost anywhere', () => {
      expect(PROD_CADDY).not.toContain('localhost');
    });

    it('does NOT have :81 sandbox listener', () => {
      expect(PROD_CADDY).not.toMatch(/:81\s*\{/);
    });

    it('does NOT have XTransformPort or dynamic port routing', () => {
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

    it('does NOT have production domain listener', () => {
      expect(SANDBOX_CADDY).not.toContain('HEAVIX_DOMAIN');
    });
  });
});
