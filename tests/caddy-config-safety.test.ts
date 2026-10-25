/**
 * HEAVIX — Caddy Configuration Safety Test (F-02 regression guard)
 *
 * Proves that:
 * 1. Production :443 block does NOT have XTransformPort routing (SSRF prevention)
 * 2. Sandbox :81 block has XTransformPort routing (for local dev only)
 * 3. :80 redirect exists
 * 4. :443 HTTPS listener exists
 * 5. Domain placeholder exists
 * 6. auto_https is configured
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const CADDYFILE = readFileSync('Caddyfile', 'utf-8');

describe('Caddy Configuration Safety (F-02 regression guard)', () => {
  it('has :80 listener for HTTP→HTTPS redirect', () => {
    expect(CADDYFILE).toMatch(/:80\s*\{/);
    expect(CADDYFILE).toContain('redir https://{host}{uri} permanent');
  });

  it('has :443 listener for production HTTPS', () => {
    expect(CADDYFILE).toMatch(/:443/);
  });

  it('has domain placeholder for configurable TLS hostname', () => {
    expect(CADDYFILE).toContain('{$HEAVIX_DOMAIN:localhost}');
  });

  it('has :81 sandbox fallback preserved for local dev', () => {
    expect(CADDYFILE).toMatch(/:81\s*\{/);
  });

  it('production :443 block does NOT have XTransformPort routing (SSRF prevention)', () => {
    // Extract the block between :443 and :81
    const match = CADDYFILE.match(/:443\s*\{([\s\S]*?)\n\}/);
    const httpsBlock = match ? match[1] : '';
    expect(httpsBlock).not.toContain('XTransformPort');
    expect(httpsBlock).not.toContain('transform_port_query');
  });

  it('sandbox :81 block HAS XTransformPort routing (for local dev)', () => {
    const match = CADDYFILE.match(/:81\s*\{([\s\S]*?)$/);
    const sandboxBlock = match ? match[1] : '';
    expect(sandboxBlock).toContain('XTransformPort');
    expect(sandboxBlock).toContain('transform_port_query');
  });

  it('auto_https is configured (disable_certs for manual TLS management)', () => {
    expect(CADDYFILE).toContain('auto_https disable_certs');
  });
});
