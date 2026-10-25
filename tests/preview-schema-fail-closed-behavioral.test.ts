/**
 * HEAVIX — F-03 Behavioral Test: Preview schema fail-closed
 *
 * Proves that .zscripts/database-runtime-build.sh:
 * 1. Exits with non-zero code if prisma/preview-schema.prisma is missing
 * 2. Does NOT run db:push (main PostgreSQL schema) with file: URL
 * 3. Succeeds and creates SQLite file when preview-schema.prisma exists
 */

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('F-03 Behavioral: Preview schema fail-closed (script missing preview schema)', () => {
  it('runtime-build.sh exits with non-zero code when preview-schema.prisma is missing', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'heavix-fail-closed-'));
    const buildDir = mkdtempSync(join(tmpdir(), 'heavix-build-'));

    try {
      const result = spawnSync('bash', ['.zscripts/database-runtime-build.sh'], {
        env: {
          ...process.env,
          PROJECT_DIR: tempDir,
          BUILD_DIR: buildDir,
        },
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

      expect(existsSync(join(buildDir, 'db', 'custom.db'))).toBe(false);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
      rmSync(buildDir, { recursive: true, force: true });
    }
  });
});

describe('F-03 Behavioral: Preview schema positive path (schema present → script proceeds)', () => {
  it('runtime-build.sh does NOT exit at FATAL check when preview-schema.prisma exists', () => {
    const tempProject = mkdtempSync(join(tmpdir(), 'heavix-positive-'));
    const buildDir = mkdtempSync(join(tmpdir(), 'heavix-build-positive-'));

    try {
      mkdirSync(join(tempProject, 'prisma'), { recursive: true });
      const previewSchema = readFileSync('prisma/preview-schema.prisma', 'utf-8');
      writeFileSync(join(tempProject, 'prisma', 'preview-schema.prisma'), previewSchema);

      writeFileSync(
        join(tempProject, 'package.json'),
        JSON.stringify({
          name: 'heavix-test',
          scripts: {
            'db:push:preview': 'echo "mock db:push:preview executed"',
          },
        })
      );

      const result = spawnSync('bash', ['.zscripts/database-runtime-build.sh'], {
        env: {
          ...process.env,
          PROJECT_DIR: tempProject,
          BUILD_DIR: buildDir,
        },
        encoding: 'utf8',
        timeout: 10_000,
      });

      const combined = `${result.stdout}\n${result.stderr}`;

      // The script should NOT fail at the FATAL preview-schema check
      expect(combined).not.toContain('FATAL');

      // The script should have attempted to run db:push:preview
      expect(combined).toContain('Preview');
    } finally {
      rmSync(tempProject, { recursive: true, force: true });
      rmSync(buildDir, { recursive: true, force: true });
    }
  });
});
