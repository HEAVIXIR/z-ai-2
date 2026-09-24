/**
 * HEAVIX — STEP 05: Admin Resource Registry Index
 *
 * Registers all admin resources. Import this file once
 * (e.g., in the admin layout or a server component) to
 * make all resources available via the registry.
 *
 * Usage:
 *   import '@/lib/admin/resource-index'; // registers all resources
 *   import { registry } from '@/lib/admin/resource-registry';
 *   const listingConfig = registry.get('listings');
 */

import { registerResource } from './resource-registry';
import { listingConfig } from './resources/listing';
import { brandConfig } from './resources/brand';
import { userConfig } from './resources/user';

// Register all resources
registerResource(listingConfig);
registerResource(brandConfig);
registerResource(userConfig);

// Export for convenience
export { registry, getResource, registerResource } from './resource-registry';
export type { AdminResourceConfig, AdminColumn, AdminFilter, AdminField, AdminAction, AdminBulkAction } from './types';

// Re-export resource configs
export { listingConfig, brandConfig, userConfig };
