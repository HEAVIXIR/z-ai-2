/**
 * HEAVIX — Prometheus Metrics Endpoint
 * GET /api/metrics — returns Prometheus text format metrics.
 * T5-W2: Observability.
 * Public (no auth) — for monitoring tools (Prometheus scraper).
 */

import { db } from '@/lib/db';
import { storeDb } from '@/lib/store-db';
import { getUptimeSeconds } from '@/lib/metrics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const metrics: Record<string, number> = {
    'heavix_uptime_seconds': getUptimeSeconds(),
  };

  // Main DB (PostgreSQL) metrics — best effort
  try {
    const [listings, products, brands, categories] = await Promise.all([
      db.listing.count(),
      db.product.count(),
      db.brand.count(),
      db.category.count(),
    ]);
    metrics['heavix_marketplace_listings_total'] = listings;
    metrics['heavix_marketplace_products_total'] = products;
    metrics['heavix_marketplace_brands_total'] = brands;
    metrics['heavix_marketplace_categories_total'] = categories;
    metrics['heavix_db_connected'] = 1;
  } catch {
    metrics['heavix_db_connected'] = 0;
  }

  // Store DB (SQLite) metrics — best effort
  try {
    const [parts, orders, suppliers] = await Promise.all([
      storeDb.part.count(),
      storeDb.order.count(),
      storeDb.supplier.count(),
    ]);
    metrics['heavix_store_parts_total'] = parts;
    metrics['heavix_store_orders_total'] = orders;
    metrics['heavix_store_suppliers_total'] = suppliers;
    metrics['heavix_store_db_connected'] = 1;
  } catch {
    metrics['heavix_store_db_connected'] = 0;
  }

  // Test count (known baseline)
  metrics['heavix_test_count'] = 299;

  // Build Prometheus text format
  let output = '';
  for (const [key, value] of Object.entries(metrics)) {
    output += `# TYPE ${key} gauge\n`;
    output += `${key} ${value}\n`;
  }

  return new Response(output, {
    headers: {
      'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
}
