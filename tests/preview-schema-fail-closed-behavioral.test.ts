/**
 * HEAVIX — F-03 Behavioral Test: Preview schema fail-closed + positive path
 *
 * Tests:
 * 1. runtime-build.sh exits non-zero when preview-schema.prisma is missing
 * 2. No SQLite file created when script fails
 * 3. REAL db:push:preview runs on disposable SQLite and creates the file
 * 4. Full runtime-build.sh creates custom.db artifact using the real project
 */

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, copyFileSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const SCRIPT_PATH = '.zscripts/database-runtime-build.sh';

describe('F-03 Behavioral: Preview schema fail-closed', () => {
  it('runtime-build.sh exits non-zero when preview-schema.prisma is missing', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'heavix-fail-'));
    const buildDir = mkdtempSync(join(tmpdir(), 'heavix-build-fail-'));

    try {
      const result = spawnSync('bash', [SCRIPT_PATH], {
        env: { ...process.env, PROJECT_DIR: tempDir, BUILD_DIR: buildDir },
        encoding: 'utf8',
        timeout: 10_000,
      });

      expect(result.status).not.toBe(0);
      const combined = `${result.stdout}\n${result.stderr}`;
      expect(combined).toContain('FATAL');
      expect(combined).toContain('preview-schema.prisma');
      expect(combined).not.toMatch(/bun run db:push\b/);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
      rmSync(buildDir, { recursive: true, force: true });
    }
  });

  it('does NOT create SQLite file when preview schema is missing', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'heavix-no-sqlite-'));
    const buildDir = mkdtempSync(join(tmpdir(), 'heavix-build-no-sqlite-'));

    try {
      spawnSync('bash', [SCRIPT_PATH], {
        env: { ...process.env, PROJECT_DIR: tempDir, BUILD_DIR: buildDir },
        encoding: 'utf8',
        timeout: 10_000,
      });
      expect(existsSync(join(buildDir, 'db', 'custom.db'))).toBe(false);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
      rmSync(buildDir, { recursive: true, force: true });
    }
  });
});

describe('F-03 Behavioral: REAL db:push:preview on disposable SQLite', () => {
  it('prisma db:push:preview creates a valid SQLite file from preview-schema.prisma', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'heavix-real-sqlite-'));
    const dbPath = join(tempDir, 'preview.db');

    try {
      const result = spawnSync('bunx', [
        'prisma', 'db', 'push',
        '--accept-data-loss',
        '--skip-generate',
        '--schema=prisma/preview-schema.prisma',
      ], {
        env: {
          ...process.env,
          PREVIEW_DATABASE_URL: `file:${dbPath}`,
        },
        encoding: 'utf8',
        timeout: 60_000,
      });

      expect(result.status).toBe(0);
      expect(existsSync(dbPath)).toBe(true);
      expect(statSync(dbPath).size).toBeGreaterThan(1000);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }, 60_000);
});

describe('F-03 Behavioral: Full runtime-build.sh with real project', () => {
  it('script creates custom.db artifact using real project directory', () => {
    // Use the REAL project directory (where node_modules + prisma exist)
    const buildDir = mkdtempSync(join(tmpdir(), 'heavix-real-build-'));

    try {
      const result = spawnSync('bash', [SCRIPT_PATH], {
        env: {
          ...process.env,
          PROJECT_DIR: process.cwd(),  // Use the real project
          BUILD_DIR: buildDir,
        },
        encoding: 'utf8',
        timeout: 60_000,
      });

      const combined = `${result.stdout}\n${result.stderr}`;

      // Script should not fail at FATAL check
      expect(combined).not.toContain('FATAL');

      // Script should succeed
      expect(result.status).toBe(0);

      // Artifact should exist
      expect(existsSync(join(buildDir, 'db', 'custom.db'))).toBe(true);

      // Artifact should be non-trivial
      const dbPath = join(buildDir, 'db', 'custom.db');
      expect(statSync(dbPath).size).toBeGreaterThan(1000);
    } finally {
      rmSync(buildDir, { recursive: true, force: true });
    }
  }, 60_000);
});
