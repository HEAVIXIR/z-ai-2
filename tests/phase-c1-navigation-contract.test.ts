/**
 * HEAVIX — WAVE C1: Navigation Contract Tests
 * Verifies the admin navigation route structure + permission filtering.
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
      const firstLine = content.split('\n')[0];
      expect(firstLine).not.toMatch(/^\/\/\s*@ts-nocheck/);
    });
  });

  describe('Permission filtering', () => {
    it('uses getUserPermissions for RBAC filtering', () => {
      const content = read(NAV_ROUTE);
      expect(content).toMatch(/getUserPermissions|permissionKey|can\(/);
    });

    it('references admin cookie or getCurrentUser', () => {
      const content = read(NAV_ROUTE);
      // Navigation uses either the admin cookie path or getCurrentUser
      expect(content).toMatch(/isAuthenticated|getCurrentUser|heavix-admin/);
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
