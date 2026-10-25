/**
 * HEAVIX — F-02 Caddy Domain Fail-Closed Test
 *
 * Proves that the Caddyfile requires HEAVIX_DOMAIN to be set.
 * If the env var is not set, Caddy's site address resolves to an empty
 * string, which Caddy refuses to serve (fail-closed — no domain, no TLS).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const CADDYFILE = readFileSync('Caddyfile', 'utf-8');

describe('F-02 Caddy domain fail-closed', () => {
  it('Caddyfile uses {$HEAVIX_DOMAIN} as site address (not :443 or localhost)', () => {
    // The site address must be {$HEAVIX_DOMAIN} — a real domain name
    // that Caddy will use for TLS certificate provisioning.
    expect(CADDYFILE).toContain('{$HEAVIX_DOMAIN} {');
    // Must NOT use :443 as site address (that would skip domain-based TLS)
    expect(CADDYFILE).not.toMatch(/^:443\s*\{/m);
    // Must NOT use localhost
    expect(CADDYFILE).not.toContain('localhost');
  });

  it('Caddyfile does NOT have auto_https off (TLS auto-provisioning enabled)', () => {
    expect(CADDYFILE).not.toContain('auto_https off');
    expect(CADDYFILE).not.toContain('auto_https disable_certs');
  });

  it('caddy validate fails when HEAVIX_DOMAIN is not set (fail-closed)', () => {
    // Run caddy validate without HEAVIX_DOMAIN set
    // This should fail because the site address resolves to empty
    const result = spawnSync('docker', [
      'run', '--rm',
      '-v', `${process.cwd()}/Caddyfile:/etc/caddy/Caddyfile`,
      '-e', 'HEAVIX_DOMAIN=',
      'caddy:2-alpine',
      'caddy', 'validate', '--config', '/etc/caddy/Caddyfile',
    ], {
      encoding: 'utf8',
      timeout: 30_000,
    });

    // If docker is not available, skip this test
    if (result.error) {
      console.warn('Docker not available — skipping caddy validate test');
      return;
    }

    // With empty HEAVIX_DOMAIN, caddy validate should fail or warn
    const combined = `${result.stdout}\n${result.stderr}`;
    // Either non-zero exit or a warning about the domain
    expect(result.status).not.toBe(0);
  });

  it('caddy validate succeeds when HEAVIX_DOMAIN is set to a test domain', () => {
    const result = spawnSync('docker', [
      'run', '--rm',
      '-v', `${process.cwd()}/Caddyfile:/etc/caddy/Caddyfile`,
      '-e', 'HEAVIX_DOMAIN=test.heavix.example.com',
      'caddy:2-alpine',
      'caddy', 'validate', '--config', '/etc/caddy/Caddyfile',
    ], {
      encoding: 'utf8',
      timeout: 30_000,
    });

    if (result.error) {
      console.warn('Docker not available — skipping caddy validate test');
      return;
    }

    expect(result.status).toBe(0);
  });
});
