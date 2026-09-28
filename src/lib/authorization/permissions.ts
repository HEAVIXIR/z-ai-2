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
  'admin.settings.manage',
  'service.manage',
  'admin.homepage.manage',
  'compare.manage',
  'compatibility.read',
  'compatibility.manage',

  // Users
  'user.read',
  'user.create',
  'user.update',
  'user.delete',
  'user.suspend',
  'user.role.manage',

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

  // Returns (T-A: fine-grained store domain permissions)
  'returns.read',
  'returns.manage',

  // Procurement (T-A: fine-grained store domain permissions)
  'procurement.read',
  'procurement.manage',

  // Shipping (T-A: fine-grained store domain permissions)
  'shipping.read',
  'shipping.manage',

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
  'backup.manage',
  'subscription.manage',

  // System
  'system.read',
  'system.manage',

  // AI
  'ai.read',
  'ai.manage',
  'ai.execute',
  'ai.policy.manage',
  'ai.scraper.execute',

  // Audit
  'audit.read',

  // Media
  'media.upload',
  'media.manage',

  // Taxonomy
  'taxonomy.read',
  'taxonomy.write',

  // Auction
  'auction.read',
  'auction.update',
  'auction.manage',

  // Settings
  'settings.manage',

  // ── STEP 16-C FIX (Class A.2 — Dim 3 missing permission constants) ──
  // 8 of 18 admin resources referenced permission constants that did NOT
  // exist in this array NOR in the DB Permission table. At runtime, can()
  // returned false → universal API GET returned 403 Forbidden for ALL
  // users including ADMIN. The constants below complete the permission
  // matrix so every resource has a canonical read permission.
  // Affected resources: parts, machines, reviews, offers, auctions,
  // inspections, transports, disputes, buy-requests.
  'part.read',
  'part.update',
  'part.create',
  'part.delete',
  'machine.read',
  'machine.update',
  'machine.create',
  'review.publish',
  'offer.read',
  'offer.update',
  'inspection.read',
  'inspection.manage',
  'transport.read',
  'transport.manage',
  'request.read',
  'request.manage',
  'dispute.read',
  'dispute.manage',

  // Price Intelligence (STEP 6D.4)
  'price.read',
  'price.override',

  // ── TRACK B: Marketplace CP missing permission keys ──
  // These domains existed in code but had no enforceable permission keys.
  // Admins get them automatically (ADMIN role = all permissions).
  'conversation.read',    // conversations admin oversight
  'moderation.read',      // moderation queue view
  'moderation.moderate',  // approve/reject moderated content
  'matching.read',        // matching engine admin view

  // ── PR-6E Catalog Expansion — domain-specific resource permissions ──
  // These complete the permission matrix for admin routes that previously
  // had no matching permission key (Pattern A "gap" files).
  // Role assignments follow the existing pattern: MODERATOR gets .read,
  // ADMIN gets .manage (same as content.* / analytics.*).
  'dictionary.read',     'dictionary.manage',
  'hot-search.read',     'hot-search.manage',
  'knowledge.read',      'knowledge.manage',
  'reel.read',           'reel.manage',
  'social-reel.read',    'social-reel.manage',
  'subscription.read',
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
    'part.read',                    // 16-C: parts sub-resource
    'machine.read',                 // 16-C: machines sub-resource
    'company.read', 'company.update',
    'order.read',
    'deal.read', 'deal.manage',
    'review.read',
    'rfq.read', 'rfq.manage',
    'offer.read', 'offer.update',   // 16-C: offers on listings
    'auction.read',                 // 16-C: bidding access
    'request.read',                 // 16-C: receive buy-requests
    'dispute.read',                 // 16-C: involved in disputes
    'inspection.read',              // 16-C: request inspections
    'transport.read',               // 16-C: ship items
    'media.upload',
    'analytics.read',
    'price.read',                     // 6D.4: view price estimates
  ],

  BUYER: [
    'admin.dashboard.read',
    'listing.read',
    'brand.read',
    'category.read',
    'product.read',
    'part.read',                    // 16-C: parts catalog browse
    'machine.read',                 // 16-C: machines catalog browse
    'company.read',
    'order.read',
    'deal.read',
    'review.read',
    'rfq.read',
    'offer.read',                   // 16-C: make offers
    'auction.read',                 // 16-C: bid in auctions
    'request.read', 'request.manage', // 16-C: post buy-requests
    'dispute.read',                 // 16-C: file disputes
    'inspection.read',              // 16-C: view inspection reports
    'transport.read',               // 16-C: track shipments
  ],

  MODERATOR: [
    'admin.dashboard.read',
    'listing.read', 'listing.moderate', 'listing.publish',
    'brand.read', 'brand.update',
    'category.read',
    'review.read', 'review.moderate', 'review.publish',  // 16-C: publish reviews
    'user.read', 'user.suspend',
    'audit.read',
    'media.upload', 'media.manage',
    'taxonomy.read',
    'content.read',
    // PR-6E: domain-specific content read permissions (same pattern as content.read)
    'dictionary.read',
    'knowledge.read',
    'reel.read',
    'social-reel.read',
    'analytics.read',
    // 16-C: marketplace CP moderation
    'part.read', 'part.update',
    'machine.read', 'machine.update',
    'offer.read', 'offer.update',
    'auction.read', 'auction.update', 'auction.manage',
    'inspection.read', 'inspection.manage',
    'transport.read', 'transport.manage',
    'request.read', 'request.manage',
    'dispute.read', 'dispute.manage',
    'price.read',                     // 6D.4: moderate price estimates
    'price.override',                 // 6D.4: override estimates
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
    // 16-C: support can view all marketplace CP resources
    'part.read', 'machine.read', 'offer.read', 'auction.read',
    'inspection.read', 'transport.read', 'request.read', 'dispute.read',
    'price.read',                     // 6D.4: view price estimates
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
