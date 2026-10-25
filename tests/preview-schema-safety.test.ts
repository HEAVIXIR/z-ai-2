/**
 * HEAVIX — Preview Schema Safety Test
 *
 * Proves that the main PostgreSQL schema (prisma/schema.prisma) declares
 * provider = "postgresql" and therefore CANNOT be used with a file: URL
 * to create a SQLite database. This is a regression guard against
 * accidentally running db:push with the main schema against SQLite.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const MAIN_SCHEMA = readFileSync('prisma/schema.prisma', 'utf-8');
const PREVIEW_SCHEMA_EXISTS = (() => {
  try { readFileSync('prisma/preview-schema.prisma', 'utf-8'); return true; } catch { return false; }
})();
const PREVIEW_SCHEMA = PREVIEW_SCHEMA_EXISTS
  ? readFileSync('prisma/preview-schema.prisma', 'utf-8')
  : '';

describe('Preview Schema Safety (F-03 regression guard)', () => {
  it('main schema declares provider = "postgresql" (NOT sqlite)', () => {
    expect(MAIN_SCHEMA).toContain('provider = "postgresql"');
    expect(MAIN_SCHEMA).not.toContain('provider = "sqlite"');
  });

  it('main schema does NOT use file: URL (would produce invalid SQLite)', () => {
    // The main schema should use env("DATABASE_URL"), not a hardcoded file: URL
    expect(MAIN_SCHEMA).toContain('url      = env("DATABASE_URL")');
    expect(MAIN_SCHEMA).not.toMatch(/url\s*=\s*"file:/);
  });

  it.skipIf(!PREVIEW_SCHEMA_EXISTS)(
    'preview schema declares provider = "sqlite" (for local/preview dev only)',
    () => {
      expect(PREVIEW_SCHEMA).toContain('provider = "sqlite"');
      expect(PREVIEW_SCHEMA).not.toContain('provider = "postgresql"');
    },
  );

  it.skipIf(!PREVIEW_SCHEMA_EXISTS)(
    'preview schema uses env("PREVIEW_DATABASE_URL"), not env("DATABASE_URL")',
    () => {
      expect(PREVIEW_SCHEMA).toContain('env("PREVIEW_DATABASE_URL")');
      expect(PREVIEW_SCHEMA).not.toContain('env("DATABASE_URL")');
    },
  );
});
