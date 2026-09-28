/**
 * HEAVIX — Store Monitoring Registry (Batch C)
 *
 * Wires existing monitoring infrastructure (performance-monitor, metrics,
 * error-tracking, storeDb health checks) to per-resource monitoring
 * for all 13 Store Control Plane resources.
 *
 * This is NOT a new monitoring system — it reuses the existing
 * infrastructure and provides a per-resource view via the Store
 * health endpoint.
 *
 * Usage:
 *   import { getStoreMonitoringStatus } from '@/lib/admin/store-monitoring-registry';
 *   const status = await getStoreMonitoringStatus();
 *   // → [{ resource: 'inventory', dbReachable: true, count: 42, ... }]
 */

import { storeDb } from '@/lib/store-db';

// ─── Store Resource Monitoring Map ─────────────────────────
export interface StoreResourceMonitor {
  resourceKey: string;
  model: string;
  label: string;
  /** Whether this resource has logAudit in its mutation handlers */
  auditWired: boolean;
  /** Whether this resource has a dedicated service file */
  hasService: boolean;
  /** Whether this resource has contract tests */
  hasTests: boolean;
}

export const STORE_MONITORING_MAP: StoreResourceMonitor[] = [
  { resourceKey: 'inventory',        model: 'stockMovement',       label: 'Inventory (Stock Movements)',    auditWired: true,  hasService: true,  hasTests: true },
  { resourceKey: 'warehouses',       model: 'warehouse',            label: 'Warehouses',                     auditWired: true,  hasService: true,  hasTests: true },
  { resourceKey: 'returns',          model: 'return',              label: 'Returns',                        auditWired: true,  hasService: true,  hasTests: true },
  { resourceKey: 'procurement',      model: 'procurementRequest',   label: 'Procurement',                    auditWired: true,  hasService: true,  hasTests: true },
  { resourceKey: 'customers',        model: 'customer',             label: 'Customers',                      auditWired: false, hasService: true,  hasTests: true },
  { resourceKey: 'mechanics',        model: 'mechanic',             label: 'Mechanics',                      auditWired: true,  hasService: true,  hasTests: true },
  { resourceKey: 'suppliers',        model: 'supplier',             label: 'Suppliers',                      auditWired: true,  hasService: true,  hasTests: true },
  { resourceKey: 'car-models',       model: 'carModel',             label: 'Car Models',                     auditWired: true,  hasService: true,  hasTests: true },
  { resourceKey: 'currency',         model: 'currencyRate',         label: 'Currency Rates',                 auditWired: true,  hasService: true,  hasTests: true },
  { resourceKey: 'services',         model: 'serviceProvider',      label: 'Service Providers',              auditWired: true,  hasService: true,  hasTests: true },
  { resourceKey: 'store-categories', model: 'category',             label: 'Store Categories',                auditWired: true,  hasService: true,  hasTests: true },
  { resourceKey: 'store-brands',     model: 'brand',                label: 'Store Brands',                   auditWired: true,  hasService: true,  hasTests: true },
  { resourceKey: 'shipments',        model: 'shipment',             label: 'Shipments',                      auditWired: true,  hasService: true,  hasTests: true },
];

// ─── Per-Resource Health Check ──────────────────────────────
export interface StoreResourceHealth {
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
 * Checks per-resource health by counting rows in each Store model.
 * Uses storeDb (store-schema Prisma client). Each count is wrapped
 * in try/catch — a single resource failure doesn't block others.
 *
 * This is consumed by /api/admin/store/health to provide per-resource
 * monitoring visibility (upgrading from domain-level to resource-level).
 */
export async function getStoreMonitoringStatus(): Promise<StoreResourceHealth[]> {
  const results: StoreResourceHealth[] = [];

  for (const monitor of STORE_MONITORING_MAP) {
    const t0 = Date.now();
    try {
      const modelKey = monitor.model.charAt(0).toLowerCase() + monitor.model.slice(1);
      const model = (storeDb as any)[modelKey];
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
          error: `Model "${modelKey}" not found on storeDb`,
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
    } catch (err) {
      results.push({
        resourceKey: monitor.resourceKey,
        label: monitor.label,
        dbReachable: false,
        count: null,
        latencyMs: Date.now() - t0,
        auditWired: monitor.auditWired,
        hasService: monitor.hasService,
        hasTests: monitor.hasTests,
        error: (err as Error).message,
      });
    }
  }

  return results;
}
