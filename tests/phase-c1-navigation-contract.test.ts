/**
 * HEAVIX — WAVE C1: Navigation Contract Tests
 * Verifies the admin navigation route structure and fail-closed RBAC.
 * No DB dependency — file-content assertions only.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';

const NAV_ROUTE = 'src/app/api/admin/navigation/route.ts';
const NAV_SEED = 'prisma/seed-admin-navigation.ts';

function read(p: string): string {
  return fs.readFileSync(p, 'utf8');
}

describe('Wave C1 — Navigation Contract', () => {
  describe('Route structure', () => {
    it('navigation route file exists', () => {
      expect(fs.existsSync(NAV_ROUTE)).toBe(true);
    });

    it('exports GET handler', () => {
      const content = read(NAV_ROUTE);
      expect(content).toMatch(/export async function GET/);
    });

    it('has dynamic or force-dynamic export', () => {
      const content = read(NAV_ROUTE);
      expect(content).toMatch(/export const dynamic/);
    });

    it('does NOT have @ts-nocheck', () => {
      const content = read(NAV_ROUTE);
      const firstLine = content.split('\\n')[0];
      expect(firstLine).not.toMatch(/^\\/\\/\\s*@ts-nocheck/);
    });
  });

  describe('Fail-closed authorization', () => {
    it('requires a canonical authenticated user', () => {
      const content = read(NAV_ROUTE);
      expect(content).toMatch(/const user = await getCurrentUser\\(\\)/);
      expect(content).toMatch(/if \\(!user\\)[\\s\\S]*?status: 401/);
    });

    it('requires the explicit navigation-read permission', () => {
      const content = read(NAV_ROUTE);
      expect(content).toContain("requirePermission(user.id, 'admin.navigation.read')");
    });

    it('returns 403 when the required permission is denied', () => {
      const content = read(NAV_ROUTE);
      expect(content).toMatch(/catch \\{[\\s\\S]*?status: 403/);
      expect(content).toMatch(/userPermissions\\.has\\('admin\\.navigation\\.read'\\)/);
    });

    it('does not grant legacy access to every authenticated user', () => {
      const content = read(NAV_ROUTE);
      expect(content).not.toMatch(/adminAuthed|mode: ['"]legacy['"]|legacy admin-cookie/i);
      expect(content).toContain("mode: 'rbac'");
    });

    it('filters each navigation item by its permission key', () => {
      const content = read(NAV_ROUTE);
      expect(content).toMatch(/item\\.permissionKey === null/);
      expect(content).toMatch(/userPermissions\\.has\\(item\\.permissionKey\\)/);
    });
  });

  describe('Navigation seed', () => {
    it('seed file exists', () => {
      expect(fs.existsSync(NAV_SEED)).toBe(true);
    });

    it('seed creates navigation groups', () => {
      const content = read(NAV_SEED);
      expect(content).toMatch(/AdminNavigationGroup|adminNavigationGroup|navigation.*group/i);
    });

    it('seed creates navigation items', () => {
      const content = read(NAV_SEED);
      expect(content).toMatch(/AdminNavigationItem|adminNavigationItem|navigation.*item/i);
    });
  });
});
