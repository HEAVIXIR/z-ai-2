/**
 * HEAVIX — Marketplace Monitoring Registry
 *
 * P3 (Monitoring Remediation): Parallel to store-monitoring-registry.ts,
 * provides per-resource health monitoring for the 7 main-schema priority
 * resources that were missing from the monitoring layer.
 *
 * This is NOT a new monitoring system — it reuses the same pattern as the
 * store monitoring: count rows, measure latency, check DB reachability.
 * Consumed by /api/admin/store/health (or a parallel marketplace health
 * endpoint) to provide per-resource monitoring visibility.
 *
 * Usage:
 *   import { getMarketplaceMonitoringStatus } from '@/lib/admin/marketplace-monitoring-registry';
 *   const status = await getMarketplaceMonitoringStatus();
 *   // → [{ resource: 'listing', dbReachable: true, count: 30, ... }]
 */

import { db } from '@/lib/db';

// ─── Marketplace Resource Monitoring Map ────────────────────
export interface MarketplaceResourceMonitor {
  resourceKey: string;
  model: string;
  label: string;
  /** Whether this resource has logAudit in its mutation handlers */
  auditWired: boolean;
  /** Whether this resource has a dedicated service file (or commerce-service) */
  hasService: boolean;
  /** Whether this resource has contract tests */
  hasTests: boolean;
}

export const MARKETPLACE_MONITORING_MAP: MarketplaceResourceMonitor[] = [
  { resourceKey: 'listing',  model: 'listing',  label: 'Listings',     auditWired: true,  hasService: true,  hasTests: true },
  { resourceKey: 'product',  model: 'product',  label: 'Products',     auditWired: true,  hasService: true,  hasTests: true },
  { resourceKey: 'orders',   model: 'order',    label: 'Orders',       auditWired: true,  hasService: true,  hasTests: true },
  { resourceKey: 'payments', model: 'payment',  label: 'Payments',     auditWired: true,  hasService: true,  hasTests: true },
  { resourceKey: 'users',    model: 'user',     label: 'Users',        auditWired: true,  hasService: true,  hasTests: true },
  { resourceKey: 'companies',model: 'company',  label: 'Companies',    auditWired: true,  hasService: true,  hasTests: true },
  { resourceKey: 'parts',    model: 'part',     label: 'Parts',        auditWired: true,  hasService: true,  hasTests: true },
];

// ─── Per-Resource Health Check ──────────────────────────────
export interface MarketplaceResourceHealth {
  resourceKey: string;
  label: string;
  dbReachable: boolean;
  count: number | null;
  latencyMs: number | null;
  auditWired: boolean;
  hasService: boolean;
  hasTests: boolean;
  error?: string;
}

/**
 * Checks per-resource health by counting rows in each main-schema model.
 * Uses db (main schema.prisma Prisma client). Each count is wrapped
 * in try/catch — a single resource failure doesn't block others.
 */
export async function getMarketplaceMonitoringStatus(): Promise<MarketplaceResourceHealth[]> {
  const results: MarketplaceResourceHealth[] = [];

  for (const monitor of MARKETPLACE_MONITORING_MAP) {
    const t0 = Date.now();
    try {
      const modelKey = monitor.model.charAt(0).toLowerCase() + monitor.model.slice(1);
      const model = (db as any)[modelKey];
      if (!model?.count) {
        results.push({
          resourceKey: monitor.resourceKey,
          label: monitor.label,
          dbReachable: false,
          count: null,
          latencyMs: null,
          auditWired: monitor.auditWired,
          hasService: monitor.hasService,
          hasTests: monitor.hasTests,
          error: `Model "${modelKey}" not found in main schema`,
        });
        continue;
      }
      const count = await model.count();
      const latencyMs = Date.now() - t0;
      results.push({
        resourceKey: monitor.resourceKey,
        label: monitor.label,
        dbReachable: true,
        count,
        latencyMs,
        auditWired: monitor.auditWired,
        hasService: monitor.hasService,
        hasTests: monitor.hasTests,
      });
    } catch (err: any) {
      results.push({
        resourceKey: monitor.resourceKey,
        label: monitor.label,
        dbReachable: false,
        count: null,
        latencyMs: Date.now() - t0,
        auditWired: monitor.auditWired,
        hasService: monitor.hasService,
        hasTests: monitor.hasTests,
        error: err?.message ?? 'Unknown error',
      });
    }
  }

  return results;
}
