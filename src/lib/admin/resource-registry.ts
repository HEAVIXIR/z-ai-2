/**
 * HEAVIX — STEP 05: Admin Resource Registry
 *
 * Central registry for all admin resources. Each resource defines
 * its columns, filters, fields, actions, and permissions.
 * The <AdminResource> component uses this registry to render
 * tables, forms, and details automatically.
 *
 * Usage:
 *   import { registry, registerResource } from '@/lib/admin/resource-registry';
 *   import { listingConfig } from './resources/listing';
 *
 *   registerResource(listingConfig);
 *
 *   const config = registry.get('listings');
 */

import type { AdminResourceConfig, AdminResourceRegistry } from './types';

// ── Registry singleton ──────────────────────────────────────
const _registry: AdminResourceRegistry = {
  resources: new Map<string, AdminResourceConfig>(),

  register(config: AdminResourceConfig): void {
    _registry.resources.set(config.key, config);
    if (process.env.NODE_ENV === 'development') {
      console.log(`[registry] registered resource: ${config.key} (${config.titleFa})`);
    }
  },

  get(key: string): AdminResourceConfig | undefined {
    return _registry.resources.get(key);
  },

  list(): AdminResourceConfig[] {
    return Array.from(_registry.resources.values());
  },

  has(key: string): boolean {
    return _registry.resources.has(key);
  },
};

// ── Export ──────────────────────────────────────────────────
export const registry = _registry;

// ── Helper: register a resource ─────────────────────────────
export function registerResource(config: AdminResourceConfig): void {
  _registry.register(config);
}

// ── Helper: get resource or throw ───────────────────────────
export function getResource(key: string): AdminResourceConfig {
  const config = _registry.get(key);
  if (!config) {
    throw new Error(`Admin resource "${key}" not registered`);
  }
  return config;
}
