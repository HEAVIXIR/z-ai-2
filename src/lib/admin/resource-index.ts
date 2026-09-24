/**
 * HEAVIX — STEP 05: Admin Resource Registry Index
 *
 * Registers all admin resources. Import this file once
 * to make all resources available via the registry.
 */

import { registerResource } from './resource-registry';
import { listingConfig } from './resources/listing';
import { brandConfig } from './resources/brand';
import { userConfig } from './resources/user';
// STEP 12 — Store Control Plane resources
import {
  productConfig, partConfig, orderConfig, paymentConfig,
  companyConfig, machineConfig, reviewConfig,
} from './resources/store-resources';

// ── Marketplace Resources ──────────────────────────────────
registerResource(listingConfig);
registerResource(brandConfig);
registerResource(userConfig);

// ── Store Control Plane Resources (STEP 12) ────────────────
registerResource(productConfig);    // محصولات
registerResource(partConfig);       // قطعات یدکی
registerResource(orderConfig);      // سفارش‌ها
registerResource(paymentConfig);    // پرداخت‌ها
registerResource(companyConfig);   // شرکت‌ها
registerResource(machineConfig);   // ماشین‌آلات
registerResource(reviewConfig);     // نظرات

// Export for convenience
export { registry, getResource, registerResource } from './resource-registry';
export type { AdminResourceConfig, AdminColumn, AdminFilter, AdminField, AdminAction, AdminBulkAction } from './types';
export { listingConfig, brandConfig, userConfig } from './resources/listing';
export { productConfig, partConfig, orderConfig, paymentConfig, companyConfig, machineConfig, reviewConfig } from './resources/store-resources';
