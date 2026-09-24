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

export { registry, getResource, registerResource } from './resource-registry';
export type { AdminResourceConfig } from './types';
