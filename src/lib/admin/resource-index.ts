/**
 * HEAVIX — STEP 05: Admin Resource Registry Index
 * Registers all admin resources.
 */
import { registerResource } from './resource-registry';
import { listingConfig } from './resources/listing';
import { brandConfig } from './resources/brand';
import { userConfig } from './resources/user';
import {
  productConfig, partConfig, orderConfig, paymentConfig,
  companyConfig, machineConfig, reviewConfig,
} from './resources/store-resources';
import {
  dealConfig, rfqConfig, offerConfig, auctionConfig,
  inspectionConfig, transportConfig, disputeConfig, buyRequestConfig,
} from './resources/marketplace-resources';
// Phase S1-A — Store Domain resources (Store-schema models)
import {
  inventoryConfig, warehouseConfig, returnsConfig, procurementConfig,
  // Phase S1-B-PATCH-1 — additional Store domain resources
  customersConfig, mechanicsConfig, suppliersConfig,
  // Phase S1-B-PATCH-2 — additional Store domain resources
  carModelsConfig, currencyConfig, servicesConfig,
  // Phase S1-B-PATCH-3 — collision-safe + shipments (shipping.* perms)
  storeCategoriesConfig, storeBrandsConfig, shipmentsConfig,
  // Phase 3 Batch 1 — Store Domain registration (Settings + Analytics + SEO)
  settingsConfig, analyticsConfig, seoConfig,
  // Phase 3 Batch 3 — Promotions (Coupon)
  promotionsConfig,
  // Wave B (M3) — Gap resource: Rentals
  // P2 (Contract Drift Remediation): Orders, Payments, Parts duplicate
  // configs were REMOVED from store-domain-resources.ts — the canonical
  // versions in store-resources.ts (registered above) are the single
  // source of truth and now carry the store database flag. Only Rentals
  // remains here (no canonical duplicate exists in store-resources.ts).
  rentalsConfig,
} from './resources/store-domain-resources';

// Marketplace
registerResource(listingConfig);
registerResource(brandConfig);
registerResource(userConfig);
// Store
registerResource(productConfig); registerResource(partConfig); registerResource(orderConfig);
registerResource(paymentConfig); registerResource(companyConfig); registerResource(machineConfig);
registerResource(reviewConfig);
// Marketplace CP
registerResource(dealConfig); registerResource(rfqConfig); registerResource(offerConfig);
registerResource(auctionConfig); registerResource(inspectionConfig); registerResource(transportConfig);
registerResource(disputeConfig); registerResource(buyRequestConfig);
// Phase S1-A — Store Domain (Store-schema models, routed via /api/admin/store/*)
registerResource(inventoryConfig);
registerResource(warehouseConfig);
registerResource(returnsConfig);
registerResource(procurementConfig);
// Phase S1-B-PATCH-1 — additional Store domain resources (reuse store.read/manage)
registerResource(customersConfig);
registerResource(mechanicsConfig);
registerResource(suppliersConfig);
// Phase S1-B-PATCH-2 — additional Store domain resources (reuse store.read/manage)
registerResource(carModelsConfig);
registerResource(currencyConfig);
registerResource(servicesConfig);
// Phase S1-B-PATCH-3 — collision-safe (store-* keys) + shipments
registerResource(storeCategoriesConfig);
registerResource(storeBrandsConfig);
registerResource(shipmentsConfig);
// Phase 3 Batch 1 — Store Domain registration (Settings + Analytics + SEO)
registerResource(settingsConfig);
registerResource(analyticsConfig);
registerResource(seoConfig);
// Phase 3 Batch 3 — Promotions (Coupon)
registerResource(promotionsConfig);
// Wave B (M3) — Gap resource: Rentals
registerResource(rentalsConfig);

export { registry, getResource, registerResource } from './resource-registry';
export type { AdminResourceConfig } from './types';
