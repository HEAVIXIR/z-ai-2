/**
 * HEAVIX — Phase 11 (11A + 11B + 11C): Growth Analytics / BI /
 * Funnels Contract Tests.
 *
 * Pure file-content assertions (same pattern as
 * phase-t9-analytics-observability.test.ts + phase-c1-navigation-
 * contract.test.ts). NO DB dependency — these are structural /
 * contract assertions verifying:
 *
 *   • Event taxonomy file exists with the canonical 25 event types.
 *   • Funnel definitions file exists with the 5 named funnels.
 *   • bi-service.ts exists with the 6 BI metric functions + types.
 *   • analytics.ts has the new session + funnel query helpers.
 *   • /api/analytics/events GET route exists + gates on
 *     analytics.read.
 *   • /api/admin/analytics/funnel GET route exists + gates on
 *     analytics.read.
 *   • /admin/growth page exists + gates on analytics.read + uses
 *     bi-service functions.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';

// ── File paths ──────────────────────────────────────────────
const EVENT_TAXONOMY = 'src/lib/event-taxonomy.ts';
const FUNNEL_DEFINITIONS = 'src/lib/funnel-definitions.ts';
const BI_SERVICE = 'src/lib/bi-service.ts';
const ANALYTICS = 'src/lib/analytics.ts';
const EVENTS_ROUTE = 'src/app/api/analytics/events/route.ts';
const FUNNEL_ROUTE = 'src/app/api/admin/analytics/funnel/route.ts';
const GROWTH_PAGE = 'src/app/admin/growth/page.tsx';

function read(p: string): string {
  return fs.readFileSync(p, 'utf8');
}

function assertFileExists(p: string) {
  if (!fs.existsSync(p)) {
    throw new Error(`Expected file not found: ${p}`);
  }
}

// ══════════════════════════════════════════════════════════════
// 1. EVENT TAXONOMY — src/lib/event-taxonomy.ts
// ══════════════════════════════════════════════════════════════
describe('Phase 11A — Event Taxonomy', () => {
  it('event-taxonomy.ts file exists', () => {
    assertFileExists(EVENT_TAXONOMY);
  });

  it('exports EVENT_TYPES const array with the canonical 25 event types', () => {
    const c = read(EVENT_TAXONOMY);
    expect(c).toMatch(/export const EVENT_TYPES/);

    // Verify each canonical event type is present.
    const canonicalTypes = [
      'page_view', 'search', 'search_zero_result', 'listing_view', 'listing_compare',
      'saved_search', 'wanted_created', 'rfq_created', 'quote_received',
      'conversation_started', 'offer_created', 'deal_created',
      'order_created', 'payment_completed', 'rental_booked', 'service_requested',
      'review_created', 'signup', 'login', 'profile_updated', 'seller_verified',
      'category_browse', 'brand_browse', 'article_view', 'cta_click',
    ];
    for (const t of canonicalTypes) {
      expect(c).toContain(`'${t}'`);
    }
  });

  it('exports EventType type derived from EVENT_TYPES', () => {
    const c = read(EVENT_TAXONOMY);
    expect(c).toMatch(/export type EventType\s*=\s*\(typeof EVENT_TYPES\)\[number\]/);
  });

  it('exports isCanonicalEventType helper function', () => {
    const c = read(EVENT_TAXONOMY);
    expect(c).toMatch(/export function isCanonicalEventType/);
  });
});

// ══════════════════════════════════════════════════════════════
// 2. FUNNEL DEFINITIONS — src/lib/funnel-definitions.ts
// ══════════════════════════════════════════════════════════════
describe('Phase 11A — Funnel Definitions', () => {
  it('funnel-definitions.ts file exists', () => {
    assertFileExists(FUNNEL_DEFINITIONS);
  });

  it('exports FUNNELS const with the 5 canonical funnels', () => {
    const c = read(FUNNEL_DEFINITIONS);
    expect(c).toMatch(/export const FUNNELS\s*=/);

    const funnels = [
      'SEARCH_TO_DEAL',
      'WANTED_TO_DEAL',
      'ORDER_TO_REVIEW',
      'VISITOR_TO_BUYER',
      'SELLER_ACTIVATION',
    ];
    for (const f of funnels) {
      expect(c).toContain(`${f}:`);
    }
  });

  it('SEARCH_TO_DEAL funnel has 5 stages in the correct order', () => {
    const c = read(FUNNEL_DEFINITIONS);
    // Verify the stage list — we look for the array literal.
    expect(c).toMatch(/SEARCH_TO_DEAL:\s*\[?\s*'search'[\s\S]*?'listing_view'[\s\S]*?'conversation_started'[\s\S]*?'offer_created'[\s\S]*?'deal_created'/);
  });

  it('exports FunnelName type and isFunnelName helper', () => {
    const c = read(FUNNEL_DEFINITIONS);
    expect(c).toMatch(/export type FunnelName\s*=\s*keyof typeof FUNNELS/);
    expect(c).toMatch(/export function isFunnelName/);
  });
});

// ══════════════════════════════════════════════════════════════
// 3. ANALYTICS UPDATE — src/lib/analytics.ts
// ══════════════════════════════════════════════════════════════
describe('Phase 11A — Analytics update (session + funnel helpers)', () => {
  it('analytics.ts file exists', () => {
    assertFileExists(ANALYTICS);
  });

  it('imports FUNNELS from funnel-definitions', () => {
    const c = read(ANALYTICS);
    expect(c).toMatch(/import\s+\{[^}]*FUNNELS[^}]*\}\s*from\s*['"]@\/lib\/funnel-definitions['"]/);
  });

  it('exports trackEventWithSession function with the documented signature', () => {
    const c = read(ANALYTICS);
    expect(c).toMatch(/export function trackEventWithSession\s*\(/);
    expect(c).toMatch(/TrackEventWithSessionParams/);
  });

  it('exports getOrCreateSession function returning SessionInfo', () => {
    const c = read(ANALYTICS);
    expect(c).toMatch(/export async function getOrCreateSession\s*\(/);
    expect(c).toMatch(/interface SessionInfo/);
  });

  it('exports getEventsByFunnel function with funnel name + dateRange', () => {
    const c = read(ANALYTICS);
    expect(c).toMatch(/export async function getEventsByFunnel\s*\(/);
  });
});

// ══════════════════════════════════════════════════════════════
// 4. BI SERVICE — src/lib/bi-service.ts
// ══════════════════════════════════════════════════════════════
describe('Phase 11B — BI Service', () => {
  it('bi-service.ts file exists', () => {
    assertFileExists(BI_SERVICE);
  });

  it('exports all 6 BI metric functions', () => {
    const c = read(BI_SERVICE);
    const fn = [
      'getFunnelMetrics',
      'getAcquisitionMetrics',
      'getMarketplaceLiquidity',
      'getRevenueMetrics',
      'getSearchMetrics',
      'getRetentionMetrics',
    ];
    for (const f of fn) {
      expect(c).toMatch(new RegExp(`export async function ${f}\\s*\\(`));
    }
  });

  it('exports FunnelMetrics + FunnelStageMetric types', () => {
    const c = read(BI_SERVICE);
    expect(c).toMatch(/export interface FunnelMetrics/);
    expect(c).toMatch(/export interface FunnelStageMetric/);
  });

  it('imports FUNNELS + isFunnelName from funnel-definitions', () => {
    const c = read(BI_SERVICE);
    expect(c).toMatch(/import\s+\{[^}]*FUNNELS[^}]*\}\s*from\s*['"]@\/lib\/funnel-definitions['"]/);
  });
});

// ══════════════════════════════════════════════════════════════
// 5. EVENTS API ROUTE — /api/analytics/events
// ══════════════════════════════════════════════════════════════
describe('Phase 11A — Events API route', () => {
  it('events route file exists at src/app/api/analytics/events/route.ts', () => {
    assertFileExists(EVENTS_ROUTE);
  });

  it('declares runtime = nodejs + force-dynamic', () => {
    const c = read(EVENTS_ROUTE);
    expect(c).toMatch(/export const runtime\s*=\s*['"]nodejs['"]/);
    expect(c).toMatch(/export const dynamic\s*=\s*['"]force-dynamic['"]/);
  });

  it('exports GET handler', () => {
    const c = read(EVENTS_ROUTE);
    expect(c).toMatch(/export async function GET\s*\(/);
  });

  it('gates on getCurrentUser + requirePermission(analytics.read)', () => {
    const c = read(EVENTS_ROUTE);
    expect(c).toMatch(/import.*getCurrentUser.*from\s*['"]@\/lib\/auth['"]/);
    expect(c).toMatch(/import.*requirePermission.*from\s*['"]@\/lib\/authorization['"]/);
    expect(c).toMatch(/requirePermission\([^,]*,\s*['"]analytics\.read['"]/);
  });

  it('accepts eventType + userId + from + to + limit query filters', () => {
    const c = read(EVENTS_ROUTE);
    expect(c).toMatch(/sp\.get\(['"]eventType['"]\)/);
    expect(c).toMatch(/sp\.get\(['"]userId['"]\)/);
    expect(c).toMatch(/sp\.get\(['"]from['"]\)/);
    expect(c).toMatch(/sp\.get\(['"]to['"]\)/);
    expect(c).toMatch(/sp\.get\(['"]limit['"]\)/);
  });
});

// ══════════════════════════════════════════════════════════════
// 6. FUNNEL API ROUTE — /api/admin/analytics/funnel
// ══════════════════════════════════════════════════════════════
describe('Phase 11B — Funnel API route', () => {
  it('funnel route file exists at src/app/api/admin/analytics/funnel/route.ts', () => {
    assertFileExists(FUNNEL_ROUTE);
  });

  it('declares runtime = nodejs + force-dynamic', () => {
    const c = read(FUNNEL_ROUTE);
    expect(c).toMatch(/export const runtime\s*=\s*['"]nodejs['"]/);
    expect(c).toMatch(/export const dynamic\s*=\s*['"]force-dynamic['"]/);
  });

  it('exports GET handler', () => {
    const c = read(FUNNEL_ROUTE);
    expect(c).toMatch(/export async function GET\s*\(/);
  });

  it('gates on getCurrentUser + requirePermission(analytics.read)', () => {
    const c = read(FUNNEL_ROUTE);
    expect(c).toMatch(/import.*getCurrentUser.*from\s*['"]@\/lib\/auth['"]/);
    expect(c).toMatch(/import.*requirePermission.*from\s*['"]@\/lib\/authorization['"]/);
    expect(c).toMatch(/requirePermission\([^,]*,\s*['"]analytics\.read['"]/);
  });

  it('reads funnel + from + to query params', () => {
    const c = read(FUNNEL_ROUTE);
    expect(c).toMatch(/sp\.get\(['"]funnel['"]\)/);
    expect(c).toMatch(/sp\.get\(['"]from['"]\)/);
    expect(c).toMatch(/sp\.get\(['"]to['"]\)/);
  });

  it('rejects unknown funnel names with 400', () => {
    const c = read(FUNNEL_ROUTE);
    expect(c).toMatch(/isFunnelName/);
    expect(c).toMatch(/status:\s*400/);
  });
});

// ══════════════════════════════════════════════════════════════
// 7. GROWTH DASHBOARD — /admin/growth
// ══════════════════════════════════════════════════════════════
describe('Phase 11B — Growth dashboard page', () => {
  it('growth dashboard file exists at src/app/admin/growth/page.tsx', () => {
    assertFileExists(GROWTH_PAGE);
  });

  it('is a server component (no "use client") + force-dynamic', () => {
    const c = read(GROWTH_PAGE);
    const firstLine = c.split('\n')[0];
    expect(firstLine).not.toMatch(/^['"]use client['"]/);
    expect(c).toMatch(/export const dynamic\s*=\s*['"]force-dynamic['"]/);
  });

  it('gates on getCurrentUser + requirePermission(analytics.read)', () => {
    const c = read(GROWTH_PAGE);
    expect(c).toMatch(/import.*getCurrentUser.*from\s*['"]@\/lib\/auth['"]/);
    expect(c).toMatch(/import.*requirePermission.*from\s*['"]@\/lib\/authorization['"]/);
    expect(c).toMatch(/requirePermission\([^,]*,\s*['"]analytics\.read['"]/);
  });

  it('imports all 6 BI service functions', () => {
    const c = read(GROWTH_PAGE);
    expect(c).toMatch(/getFunnelMetrics/);
    expect(c).toMatch(/getAcquisitionMetrics/);
    expect(c).toMatch(/getMarketplaceLiquidity/);
    expect(c).toMatch(/getRevenueMetrics/);
    expect(c).toMatch(/getSearchMetrics/);
    expect(c).toMatch(/getRetentionMetrics/);
  });

  it('logs growth.list_view audit entry', () => {
    const c = read(GROWTH_PAGE);
    expect(c).toMatch(/import.*logAudit.*from\s*['"]@\/lib\/audit['"]/);
    expect(c).toMatch(/action:\s*['"]growth\.list_view['"]/);
    expect(c).toMatch(/entityType:\s*['"]Growth['"]/);
  });
});
