/**
 * HEAVIX — Store Warehouses Admin Page
 * /admin/store/warehouses — warehouse directory list + form.
 *
 * STEP 3B: Completes the warehouses admin UI gap using Universal
 * Table + Universal Form abstractions (reusing existing components,
 * no custom CRUD page — follows the same pattern as
 * /admin/resources/[resource]/page.tsx).
 *
 * The warehouseConfig is registered in store-domain-resources.ts
 * with database: 'store' (P1 store-awareness) and permissions
 * reuse inventory.read/manage (warehouse is an inventory sub-domain).
 *
 * Permission: inventory.read (same as the API route).
 */

import '@/lib/admin/resource-index';
import { registry } from '@/lib/admin/resource-registry';
import { UniversalTable } from '@/components/admin/universal-table';
import { redirect } from 'next/navigation';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default function StoreWarehousesPage() {
  const config = registry.get('warehouses');
  if (!config) {
    redirect('/admin/store');
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold">{config.titleFa}</h1>
          <p className="text-xs text-muted-foreground">{config.titleEn}</p>
        </div>
        <Link
          href={`/admin/resources/warehouses/new`}
          className="rounded-md bg-[#F58220] px-4 py-2 text-xs font-medium text-white hover:bg-[#F58220]/90"
        >
          + افزودن انبار
        </Link>
      </div>
      <UniversalTable config={config} />
    </div>
  );
}
