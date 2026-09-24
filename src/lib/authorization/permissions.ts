/**
 * HEAVIX — STEP 02: Permission Matrix
 *
 * Complete resource/action-oriented permission definitions.
 * Permissions are NOT role-oriented (ADMIN/SELLER/BUYER are roles, not permissions).
 * Each permission follows the pattern: resource.action
 *
 * Categories:
 *   admin.*    — Admin panel access + self-management
 *   user.*     — User management
 *   company.*  — Company management
 *   listing.*  — Marketplace listings
 *   product.*  — Catalog products
 *   brand.*    — Brand registry
 *   category.* — Taxonomy categories
 *   order.*    — Orders
 *   payment.*  — Payments + refunds
 *   deal.*     — Deals + deal rooms
 *   review.*   — Reviews + reputation
 *   rfq.*      — RFQ (B2B procurement)
 *   store.*    — Store management
 *   inventory.*— Stock management
 *   seo.*      — SEO management
 *   content.*  — Content (articles, pages, media)
 *   analytics.*— Analytics + reporting
 *   security.* — Security + RBAC management
 *   system.*   — System config + feature flags
 *   ai.*       — AI gateway + agents
 *   audit.*    — Audit log access
 *   media.*    — Media uploads
 *   taxonomy.* — Taxonomy (transaction types, service types, etc.)
 */

export const PERMISSIONS = [
  // Admin panel
  'admin.dashboard.read',
  'admin.navigation.read',
  'admin.navigation.manage',
  'admin.preferences.read',
  'admin.preferences.manage',

  // Users
  'user.read',
  'user.create',
  'user.update',
  'user.delete',
  'user.suspend',

  // Companies
  'company.read',
  'company.create',
  'company.update',
  'company.delete',
  'company.verify',

  // Listings
  'listing.read',
  'listing.create',
  'listing.update',
  'listing.delete',
  'listing.publish',
  'listing.moderate',
  'listing.export',

  // Products (catalog)
  'product.read',
  'product.create',
  'product.update',
  'product.delete',

  // Brands
  'brand.read',
  'brand.create',
  'brand.update',
  'brand.delete',
  'brand.publish',

  // Categories
  'category.read',
  'category.create',
  'category.update',
  'category.delete',

  // Orders
  'order.read',
  'order.update',
  'order.manage',

  // Payments
  'payment.read',
  'payment.manage',
  'payment.refund',

  // Deals
  'deal.read',
  'deal.manage',

  // Reviews
  'review.read',
  'review.moderate',

  // RFQ
  'rfq.read',
  'rfq.manage',

  // Store
  'store.read',
  'store.manage',

  // Inventory
  'inventory.read',
  'inventory.manage',

  // SEO
  'seo.read',
  'seo.manage',

  // Content
  'content.read',
  'content.manage',

  // Analytics
  'analytics.read',
  'analytics.manage',

  // Security
  'security.read',
  'security.manage',

  // System
  'system.read',
  'system.manage',

  // AI
  'ai.read',
  'ai.manage',
  'ai.execute',

  // Audit
  'audit.read',

  // Media
  'media.upload',
  'media.manage',

  // Taxonomy
  'taxonomy.read',
  'taxonomy.write',

  // Auction
  'auction.manage',

  // Settings
  'settings.manage',
] as const;

export type PermissionKey = typeof PERMISSIONS[number];

// ── Role definitions (which permissions each role gets) ────
export const ROLE_PERMISSIONS: Record<string, string[]> = {
  ADMIN: [...PERMISSIONS], // ADMIN gets ALL permissions

  SELLER: [
    'admin.dashboard.read',
    'admin.preferences.read',
    'listing.read', 'listing.create', 'listing.update', 'listing.publish',
    'brand.read',
    'category.read',
    'product.read',
    'company.read', 'company.update',
    'order.read',
    'deal.read', 'deal.manage',
    'review.read',
    'rfq.read', 'rfq.manage',
    'media.upload',
    'analytics.read',
  ],

  BUYER: [
    'admin.dashboard.read',
    'listing.read',
    'brand.read',
    'category.read',
    'product.read',
    'company.read',
    'order.read',
    'deal.read',
    'review.read',
    'rfq.read',
  ],

  MODERATOR: [
    'admin.dashboard.read',
    'listing.read', 'listing.moderate', 'listing.publish',
    'brand.read', 'brand.update',
    'category.read',
    'review.read', 'review.moderate',
    'user.read', 'user.suspend',
    'audit.read',
    'media.upload', 'media.manage',
    'taxonomy.read',
    'content.read',
    'analytics.read',
  ],

  SUPPORT: [
    'admin.dashboard.read',
    'listing.read',
    'user.read', 'user.suspend',
    'audit.read',
    'company.read',
    'order.read',
    'deal.read',
    'review.read',
  ],
};

// ── Legacy permissions that should be migrated ────────────
// These existed in the old seed but don't match the new matrix.
// They'll be kept for backward compat but the new ones are canonical.
export const LEGACY_PERMISSION_MAP: Record<string, string> = {
  'taxonomy.write': 'category.create', // legacy → new
  'settings.manage': 'system.manage',  // legacy → new
  'media.upload': 'media.upload',       // unchanged
  'ai.execute': 'ai.execute',           // unchanged
};
