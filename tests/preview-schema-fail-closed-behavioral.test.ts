/**
 * HEAVIX — F-03 Behavioral Test: Preview schema fail-closed
 *
 * Proves that .zscripts/database-runtime-build.sh:
 * 1. Exits with non-zero code if prisma/preview-schema.prisma is missing
 * 2. Does NOT run db:push (main PostgreSQL schema) with file: URL
 *
 * This is a real behavioral test — it executes the script and checks
 * the exit code, not just reading the source.
 */

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('F-03 Behavioral: Preview schema fail-closed', () => {
  it('runtime-build.sh exits with non-zero code when preview-schema.prisma is missing', () => {
    // Create a temp directory that does NOT have prisma/preview-schema.prisma
    const tempDir = mkdtempSync(join(tmpdir(), 'heavix-fail-closed-'));
    const buildDir = mkdtempSync(join(tmpdir(), 'heavix-build-'));

    try {
      // Run the script with PROJECT_DIR pointing to temp dir (no preview schema)
      const result = spawnSync('bash', ['.zscripts/database-runtime-build.sh'], {
        env: {
          ...process.env,
          PROJECT_DIR: tempDir,
          BUILD_DIR: buildDir,
        },
        encoding: 'utf8',
        timeout: 10_000,
      });

      // Must fail (non-zero exit)
      expect(result.status).not.toBe(0);

      // Must mention FATAL and preview-schema.prisma
      const combined = `${result.stdout}\n${result.stderr}`;
      expect(combined).toContain('FATAL');
      expect(combined).toContain('preview-schema.prisma');

      // Must NOT mention db:push (the unsafe fallback)
      expect(combined).not.toMatch(/bun run db:push\b/);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
      rmSync(buildDir, { recursive: true, force: true });
    }
  });

  it('runtime-build.sh does NOT create a SQLite file when preview schema is missing', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'heavix-no-sqlite-'));
    const buildDir = mkdtempSync(join(tmpdir(), 'heavix-build-no-sqlite-'));

    try {
      spawnSync('bash', ['.zscripts/database-runtime-build.sh'], {
        env: {
          ...process.env,
          PROJECT_DIR: tempDir,
          BUILD_DIR: buildDir,
        },
        encoding: 'utf8',
        timeout: 10_000,
      });

      // The build dir should NOT contain custom.db (script failed before that)
      expect(existsSync(join(buildDir, 'db', 'custom.db'))).toBe(false);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
      rmSync(buildDir, { recursive: true, force: true });
    }
  });
});
