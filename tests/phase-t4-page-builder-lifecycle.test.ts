/**
 * HEAVIX — T4: Page Builder Lifecycle Contract Tests
 *
 * Verifies the Page Builder API route structure, scheduler wiring,
 * and layout validation lifecycle with file-content assertions
 * (same pattern as Phase C1 navigation contract tests).
 *
 * Scope:
 *   1. Page Builder routes exist (GET/POST/PATCH/DELETE, publish,
 *      rollback, versions, check-scheduled)
 *   2. Each route exports the expected HTTP method handlers
 *   3. Each route has runtime='nodejs' + dynamic='force-dynamic'
 *   4. Publish + rollback routes have an admin auth gate (getCurrentUser + isAdmin)
 *   5. Publish + rollback routes logAudit with the canonical action keys
 *      ('page.publish', 'page.rollback')
 *   6. Rollback route creates a NEW version (immutable, never overwrites)
 *   7. Scheduler route exists and handles BOTH scheduled publish +
 *      scheduled unpublish (with logAudit for both)
 *   8. validateLayout rejects invalid layouts (unknown widget, SQL/JS,
 *      <script>, INSERT, missing required props)
 *   9. CSRF defense posture: every mutation route has EITHER checkCsrf
 *      OR an admin-cookie auth gate
 *  10. No @ts-nocheck in any route file
 *
 * No DB dependency — these are pure structural/contract assertions.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  validateLayout,
  type PageLayout,
} from '@/lib/admin/page-builder/widget-registry';

// ── Route paths ────────────────────────────────────────────
const PAGES_LIST_ROUTE   = 'src/app/api/admin/pages/route.ts';
const PAGES_DETAIL_ROUTE = 'src/app/api/admin/pages/[id]/route.ts';
const PAGES_VERSIONS_ROUTE = 'src/app/api/admin/pages/[id]/versions/route.ts';
const PAGES_PUBLISH_ROUTE  = 'src/app/api/admin/pages/[id]/publish/route.ts';
const PAGES_ROLLBACK_ROUTE = 'src/app/api/admin/pages/[id]/rollback/route.ts';
const PAGES_SCHEDULER_ROUTE = 'src/app/api/admin/pages/check-scheduled/route.ts';

const ALL_PAGE_ROUTES = [
  PAGES_LIST_ROUTE,
  PAGES_DETAIL_ROUTE,
  PAGES_VERSIONS_ROUTE,
  PAGES_PUBLISH_ROUTE,
  PAGES_ROLLBACK_ROUTE,
  PAGES_SCHEDULER_ROUTE,
];

function read(p: string): string {
  return fs.readFileSync(p, 'utf8');
}

function assertFileExists(p: string) {
  if (!fs.existsSync(p)) {
    throw new Error(`Expected file not found: ${p}`);
  }
}

// ══════════════════════════════════════════════════════════════
// 1. ROUTE EXISTENCE
// ══════════════════════════════════════════════════════════════
describe('T4 Page Builder Lifecycle — Route Existence', () => {
  it('pages list route exists (GET/POST)', () => {
    assertFileExists(PAGES_LIST_ROUTE);
    const c = read(PAGES_LIST_ROUTE);
    expect(c).toMatch(/export async function GET/);
    expect(c).toMatch(/export async function POST/);
  });

  it('pages detail route exists (GET/PATCH/DELETE)', () => {
    assertFileExists(PAGES_DETAIL_ROUTE);
    const c = read(PAGES_DETAIL_ROUTE);
    expect(c).toMatch(/export async function GET/);
    expect(c).toMatch(/export async function PATCH/);
    expect(c).toMatch(/export async function DELETE/);
  });

  it('pages versions route exists (POST new draft version)', () => {
    assertFileExists(PAGES_VERSIONS_ROUTE);
    const c = read(PAGES_VERSIONS_ROUTE);
    expect(c).toMatch(/export async function POST/);
  });

  it('pages publish route exists (POST)', () => {
    assertFileExists(PAGES_PUBLISH_ROUTE);
    const c = read(PAGES_PUBLISH_ROUTE);
    expect(c).toMatch(/export async function POST/);
  });

  it('pages rollback route exists (POST)', () => {
    assertFileExists(PAGES_ROLLBACK_ROUTE);
    const c = read(PAGES_ROLLBACK_ROUTE);
    expect(c).toMatch(/export async function POST/);
  });

  it('pages scheduler route exists (GET + POST)', () => {
    assertFileExists(PAGES_SCHEDULER_ROUTE);
    const c = read(PAGES_SCHEDULER_ROUTE);
    // Cron tickers (Vercel Cron, GitHub Actions) often only do GET.
    // Admin UI "Run scheduler now" button does POST.
    expect(c).toMatch(/export async function GET/);
    expect(c).toMatch(/export async function POST/);
  });
});

// ══════════════════════════════════════════════════════════════
// 2. ROUTE STRUCTURAL CONTRACTS — runtime + dynamic
// ══════════════════════════════════════════════════════════════
describe('T4 Page Builder Lifecycle — Route Structural Contracts', () => {
  it('every page route that declares runtime uses nodejs', () => {
    // Next.js defaults to 'nodejs' for API routes, so it's OK for a route
    // to omit the explicit declaration. When present, it MUST be 'nodejs'
    // (never 'edge' — page routes use Prisma + next/headers which are
    // node-only).
    for (const f of ALL_PAGE_ROUTES) {
      const c = read(f);
      if (/export const runtime\s*=/.test(c)) {
        expect(c, `expected ${f} to use runtime='nodejs'`).toMatch(/export const runtime\s*=\s*['"]nodejs['"]/);
      }
    }
  });

  it('every page route declares dynamic = force-dynamic', () => {
    // Accept either single or double quotes (codebase mixes both styles).
    for (const f of ALL_PAGE_ROUTES) {
      const c = read(f);
      expect(c, `expected ${f} to declare dynamic='force-dynamic'`).toMatch(/export const dynamic\s*=\s*['"]force-dynamic['"]/);
    }
  });

  it('no page route file has @ts-nocheck on line 1', () => {
    for (const f of ALL_PAGE_ROUTES) {
      const c = read(f);
      const firstLine = c.split('\n')[0];
      expect(firstLine, `expected ${f} not to start with @ts-nocheck`).not.toMatch(/^\/\/\s*@ts-nocheck/);
    }
  });
});

// ══════════════════════════════════════════════════════════════
// 3. AUTH GATES — admin-cookie boundary
// ══════════════════════════════════════════════════════════════
describe('T4 Page Builder Lifecycle — Auth Gates', () => {
  it('publish route has admin auth gate (getCurrentUser + isAdmin)', () => {
    const c = read(PAGES_PUBLISH_ROUTE);
    expect(c).toMatch(/getCurrentUser/);
    expect(c).toMatch(/isAdmin/);
  });

  it('rollback route has admin auth gate (getCurrentUser + isAdmin)', () => {
    const c = read(PAGES_ROLLBACK_ROUTE);
    expect(c).toMatch(/getCurrentUser/);
    expect(c).toMatch(/isAdmin/);
  });

  it('versions route has admin auth gate (getCurrentUser + isAdmin)', () => {
    const c = read(PAGES_VERSIONS_ROUTE);
    expect(c).toMatch(/getCurrentUser/);
    expect(c).toMatch(/isAdmin/);
  });

  it('scheduler route supports EITHER admin-cookie auth OR x-cron-key', () => {
    // Cron tickers don't have a cookie; admin UI does. The route must
    // accept BOTH forms.
    const c = read(PAGES_SCHEDULER_ROUTE);
    expect(c).toMatch(/getCurrentUser|isAdmin/);          // admin path
    expect(c).toMatch(/x-cron-key|CRON_SECRET/i);         // cron path
  });

  it('every mutation route has CSRF defense OR admin-cookie auth gate', () => {
    // "if applicable": if checkCsrf is wired, great; otherwise the
    // admin-cookie boundary (getCurrentUser + isAdmin) is the primary gate.
    // This test passes as long as at least one of the two is present.
    const mutationRoutes = [
      PAGES_PUBLISH_ROUTE,
      PAGES_ROLLBACK_ROUTE,
      PAGES_VERSIONS_ROUTE,
    ];
    for (const f of mutationRoutes) {
      const c = read(f);
      const hasCheckCsrf = c.includes('checkCsrf');
      const hasAdminGate = c.includes('getCurrentUser') && c.includes('isAdmin');
      expect(
        hasCheckCsrf || hasAdminGate,
        `expected ${f} to have either checkCsrf or admin-cookie auth gate`,
      ).toBe(true);
    }
  });
});

// ══════════════════════════════════════════════════════════════
// 4. AUDIT TRAIL — publish + rollback action keys
// ══════════════════════════════════════════════════════════════
describe('T4 Page Builder Lifecycle — Audit Trail', () => {
  it('publish route logs audit with action page.publish', () => {
    const c = read(PAGES_PUBLISH_ROUTE);
    expect(c).toMatch(/import.*logAudit.*from ['"]@\/lib\/audit['"]/);
    expect(c).toMatch(/action:\s*['"]page\.publish['"]/);
  });

  it('rollback route logs audit with action page.rollback', () => {
    const c = read(PAGES_ROLLBACK_ROUTE);
    expect(c).toMatch(/import.*logAudit.*from ['"]@\/lib\/audit['"]/);
    expect(c).toMatch(/action:\s*['"]page\.rollback['"]/);
  });

  it('scheduler route logs audit for scheduled.publish + scheduled.unpublish', () => {
    const c = read(PAGES_SCHEDULER_ROUTE);
    expect(c).toMatch(/import.*logAudit.*from ['"]@\/lib\/audit['"]/);
    expect(c).toMatch(/action:\s*['"]page\.scheduled\.publish['"]/);
    expect(c).toMatch(/action:\s*['"]page\.scheduled\.unpublish['"]/);
  });

  it('publish route archives previous published version + publishes new one', () => {
    // File-content assertion: the publish route updates BOTH the old
    // version (→ ARCHIVED) AND the new version (→ PUBLISHED).
    const c = read(PAGES_PUBLISH_ROUTE);
    expect(c).toMatch(/status:\s*['"]ARCHIVED['"]/);
    expect(c).toMatch(/status:\s*['"]PUBLISHED['"]/);
    expect(c).toMatch(/publishedVersionId/);
  });
});

// ══════════════════════════════════════════════════════════════
// 5. ROLLBACK IMMUTABILITY — creates a NEW version, never overwrites
// ══════════════════════════════════════════════════════════════
describe('T4 Page Builder Lifecycle — Rollback Immutability', () => {
  it('rollback route CREATES a new version (adminPageVersion.create)', () => {
    const c = read(PAGES_ROLLBACK_ROUTE);
    expect(c).toMatch(/adminPageVersion\.create/);
  });

  it('rollback route does NOT delete or overwrite the target version', () => {
    // The target version (the one we're rolling back TO) must NOT be
    // modified by rollback. The route may update OTHER versions
    // (archive the previously-published one), but the target's layout
    // is read-only.
    const c = read(PAGES_ROLLBACK_ROUTE);
    // Reject patterns that would mutate the target version's layout.
    expect(c).not.toMatch(/targetVersion.*layout\s*=\s*[^=]/);
  });

  it('rollback route archives the previously-published version', () => {
    const c = read(PAGES_ROLLBACK_ROUTE);
    expect(c).toMatch(/status:\s*['"]ARCHIVED['"]/);
  });
});

// ══════════════════════════════════════════════════════════════
// 6. SCHEDULER LIFECYCLE — both publish + unpublish paths
// ══════════════════════════════════════════════════════════════
describe('T4 Page Builder Lifecycle — Scheduler Lifecycle', () => {
  it('scheduler queries scheduledPublishAt <= now AND status != PUBLISHED', () => {
    const c = read(PAGES_SCHEDULER_ROUTE);
    expect(c).toMatch(/scheduledPublishAt/);
    expect(c).toMatch(/lte/);
    expect(c).toMatch(/status:\s*\{\s*not:\s*['"]PUBLISHED['"]/);
  });

  it('scheduler queries scheduledUnpublishAt <= now AND status = PUBLISHED', () => {
    const c = read(PAGES_SCHEDULER_ROUTE);
    expect(c).toMatch(/scheduledUnpublishAt/);
    expect(c).toMatch(/lte/);
    expect(c).toMatch(/status:\s*['"]PUBLISHED['"]/);
  });

  it('scheduler clears scheduledPublishAt + scheduledUnpublishAt after processing (idempotency)', () => {
    const c = read(PAGES_SCHEDULER_ROUTE);
    // Idempotency: clearing the schedule on every processed page
    // guarantees a second scheduler tick within the same minute won't
    // double-publish / double-unpublish.
    expect(c).toMatch(/scheduledPublishAt:\s*null/);
    expect(c).toMatch(/scheduledUnpublishAt:\s*null/);
  });

  it('scheduler invalidates cache (revalidatePath) for processed pages', () => {
    const c = read(PAGES_SCHEDULER_ROUTE);
    expect(c).toMatch(/revalidatePath/);
  });

  it('scheduler archives current published version before publishing the scheduled version', () => {
    const c = read(PAGES_SCHEDULER_ROUTE);
    expect(c).toMatch(/status:\s*['"]ARCHIVED['"]/);
    expect(c).toMatch(/status:\s*['"]PUBLISHED['"]/);
  });
});

// ══════════════════════════════════════════════════════════════
// 7. LAYOUT VALIDATION — rejects invalid layouts
// ══════════════════════════════════════════════════════════════
describe('T4 Page Builder Lifecycle — validateLayout Rejects Invalid Layouts', () => {
  it('rejects layout that is not an object', () => {
    const result = validateLayout(null as any);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('rejects layout without sections[]', () => {
    const result = validateLayout({ foo: 'bar' });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('sections'))).toBe(true);
  });

  it('rejects unknown widget key', () => {
    const badLayout: PageLayout = {
      sections: [{ rows: [{ widgets: [{ key: 'nonexistent-widget', props: {} }] }] }],
    };
    const result = validateLayout(badLayout);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('unknown widget'))).toBe(true);
  });

  it('rejects SQL injection in widget props', () => {
    const badLayout: PageLayout = {
      sections: [{ rows: [{ widgets: [{ key: 'hero', props: { title: 'SELECT * FROM users' } }] }] }],
    };
    const result = validateLayout(badLayout);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => /SQL|arbitrary/i.test(e))).toBe(true);
  });

  it('rejects JS injection (eval) in widget props', () => {
    const badLayout: PageLayout = {
      sections: [{ rows: [{ widgets: [{ key: 'hero', props: { title: 'eval(malicious)' } }] }] }],
    };
    const result = validateLayout(badLayout);
    expect(result.valid).toBe(false);
  });

  it('rejects <script> tag in widget props', () => {
    const badLayout: PageLayout = {
      sections: [{ rows: [{ widgets: [{ key: 'hero', props: { title: '<script>alert(1)</script>' } }] }] }],
    };
    const result = validateLayout(badLayout);
    expect(result.valid).toBe(false);
  });

  it('rejects INSERT statement in widget props', () => {
    const badLayout: PageLayout = {
      sections: [{ rows: [{ widgets: [{ key: 'hero', props: { title: 'INSERT INTO users' } }] }] }],
    };
    const result = validateLayout(badLayout);
    expect(result.valid).toBe(false);
  });

  it('rejects missing required widget props', () => {
    // cta widget requires title + buttonText + buttonLink
    const badLayout: PageLayout = {
      sections: [{ rows: [{ widgets: [{ key: 'cta', props: { title: 'X' } }] }] }],
    };
    const result = validateLayout(badLayout);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('missing'))).toBe(true);
  });

  it('accepts a valid layout (hero + listing-grid with dataSource)', () => {
    const validLayout: PageLayout = {
      sections: [
        {
          title: 'Hero',
          rows: [
            {
              widgets: [
                {
                  key: 'hero',
                  props: { title: 'Welcome', subtitle: 'Sub' },
                  responsive: { desktop: { w: 12, h: 3 }, tablet: { w: 12, h: 3 }, mobile: { w: 12, h: 4 } },
                },
              ],
            },
          ],
        },
        {
          rows: [
            {
              widgets: [
                {
                  key: 'listing-grid',
                  props: { title: 'Latest', columns: '4', limit: 8 },
                  dataSource: 'listing.latest',
                },
              ],
            },
          ],
        },
      ],
    };
    const result = validateLayout(validLayout);
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it('accepts an empty sections layout (renders nothing)', () => {
    const result = validateLayout({ sections: [] });
    expect(result.valid).toBe(true);
  });
});
