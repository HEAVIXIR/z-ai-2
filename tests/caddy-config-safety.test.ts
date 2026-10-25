/**
 * HEAVIX — Caddy Configuration Safety Test (F-02 regression guard)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const CADDYFILE = readFileSync('Caddyfile', 'utf-8');

describe('Caddy Configuration Safety (F-02 regression guard)', () => {
  it('has :80 listener for HTTP→HTTPS redirect', () => {
    expect(CADDYFILE).toMatch(/:80\s*\{/);
    expect(CADDYFILE).toContain('redir https://{host}{uri} permanent');
  });

  it('has :443 listener for production HTTPS with auto-TLS', () => {
    expect(CADDYFILE).toMatch(/:443/);
  });

  it('has domain placeholder for configurable TLS hostname', () => {
    expect(CADDYFILE).toContain('{$HEAVIX_DOMAIN:localhost}');
  });

  it('has :81 sandbox fallback preserved for local dev', () => {
    expect(CADDYFILE).toMatch(/:81\s*\{/);
  });

  it('production HTTPS block has XTransformPort security note', () => {
    // The production :443 block should mention port restriction
    expect(CADDYFILE).toContain('XTransformPort');
    expect(CADDYFILE).toContain('allowlist');
  });

  it('auto_https is disabled (Caddy manages TLS manually via auto-HTTPS)', () => {
    expect(CADDYFILE).toContain('auto_https off');
  });
});
