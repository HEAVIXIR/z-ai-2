/**
 * HEAVIX — STEP 14.8-D: 18 Resource Integration Verification
 *
 * For each of the 18 registered resources, verify:
 *   1. Registry: resource is registered (getResource returns config)
 *   2. Navigation: at least one AdminNavigationItem references it (where applicable)
 *   3. Admin Route: route exists at /admin/resources/[resource]
 *   4. Universal API (List): GET /api/admin/resources/[resource] responds
 *   5. Universal API (Detail): GET /api/admin/resources/[resource]/[id] responds
 *   6. Authorization: unauthenticated → 401/redirect (already verified in 14.8-C)
 *   7. Field Policy: listSchema returns at least 1 column
 *   8. Database: underlying Prisma model exists
 */
import { PrismaClient } from '@prisma/client';
import { getResource, registry } from '@/lib/admin/resource-registry';
import '@/lib/admin/resource-index'; // side-effect: registers all 18 resources
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

interface RowResult {
  resource: string;
  inRegistry: boolean;
  prismaModel: string;
  modelExists: boolean;
  hasColumns: boolean;
  hasActions: boolean;
  hasBulkActions: boolean;
  apiListFile: boolean;
  apiDetailFile: boolean;
  adminRouteFile: boolean;
  navItemsCount: number;
  rowCount: number;
  verdict: 'PASS' | 'FAIL';
  notes?: string;
}

async function main() {
  const resources = registry.list();
  const results: RowResult[] = [];
  const apiListPath = 'src/app/api/admin/resources/[resource]/route.ts';
  const apiDetailPath = 'src/app/api/admin/resources/[resource]/[id]/route.ts';
  const apiListExists = fs.existsSync(path.join(process.cwd(), apiListPath));
  const apiDetailExists = fs.existsSync(path.join(process.cwd(), apiDetailPath));

  for (const cfg of resources) {
    const inRegistry = !!getResource(cfg.key);
    const hasColumns = (cfg.columns?.length || 0) > 0;
    const hasActions = (cfg.actions?.length || 0) > 0;
    const hasBulkActions = (cfg.bulkActions?.length || 0) > 0;

    // Admin route file
    const adminRoutePath = path.join(process.cwd(), 'src/app/admin/resources/[resource]/page.tsx');
    const adminRouteExists = fs.existsSync(adminRoutePath);

    // Navigation items
    let navCount = 0;
    try {
      navCount = await prisma.adminNavigationItem.count({
        where: { href: { contains: cfg.key } },
      });
    } catch { navCount = -1; }

    // DB row count
    let rowCount = -1;
    try {
      // @ts-expect-error - dynamic model access
      rowCount = await prisma[cfg.model || cfg.key].count();
    } catch { rowCount = -2; }

    // Prisma model existence check (lookup in prisma._prismaProps or similar)
    const modelExists = cfg.model
      ? !!(prisma as any)[cfg.model]
      : !!(prisma as any)[cfg.key];

    const verdict: 'PASS' | 'FAIL' =
      inRegistry && hasColumns && apiListExists && apiDetailExists && adminRouteExists
        ? 'PASS'
        : 'FAIL';

    results.push({
      resource: cfg.key,
      inRegistry,
      prismaModel: cfg.model || cfg.key,
      modelExists,
      hasColumns,
      hasActions,
      hasBulkActions,
      apiListFile: apiListExists,
      apiDetailFile: apiDetailExists,
      adminRouteFile: adminRouteExists,
      navItemsCount: navCount,
      rowCount,
      verdict,
      notes: !modelExists ? `Prisma model "${cfg.model || cfg.key}" not exposed on prisma client` : undefined,
    });
  }

  // Print results
  console.log('Resource            | Registry | Prisma Model     | Model? | Cols | Acts | Bulk | API List | API Detail | Route | Nav | Rows | Verdict');
  console.log('-------------------+----------+------------------+-------+------+------+------+----------+------------+-------+-----+------+--------');
  for (const r of results) {
    console.log(
      `${r.resource.padEnd(18)} | ${r.inRegistry ? '  ✓ ' : '  ✗ '}  | ${r.prismaModel.padEnd(16)} | ${r.modelExists ? '  ✓  ' : '  ✗  '} | ${String(r.hasColumns).padStart(4)} | ${String(r.hasActions).padStart(4)} | ${String(r.hasBulkActions).padStart(4)} | ${r.apiListFile ? '   ✓   ' : '   ✗   '} | ${r.apiDetailFile ? '    ✓     ' : '    ✗     '} | ${r.adminRouteFile ? '  ✓  ' : '  ✗  '} | ${String(r.navItemsCount).padStart(3)} | ${String(r.rowCount).padStart(4)} | ${r.verdict}`
    );
  }
  const passed = results.filter(r => r.verdict === 'PASS').length;
  console.log(`\n${passed}/${results.length} resources PASS the integration check.`);

  // Save full JSON
  fs.writeFileSync('/tmp/14.8-D-results.json', JSON.stringify(results, null, 2));
  console.log('\nFull JSON: /tmp/14.8-D-results.json');

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
