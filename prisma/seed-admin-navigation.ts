/**
 * HEAVIX Phase 12 — Admin Navigation Seed
 *
 * Populates AdminNavigationGroup + AdminNavigationItem from the
 * hard-coded MENU in AdminSidebarNav.tsx. This is the first step
 * in making the admin sidebar DB-driven + permission-aware.
 *
 * Idempotent: uses upsert by key. Safe to re-run.
 *
 * Usage: bunx tsx prisma/seed-admin-navigation.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

import { ADMIN_NAVIGATION_GROUPS as GROUPS, ADMIN_NAVIGATION_STANDALONES as STANDALONES } from '../src/lib/admin/navigation-defaults';

async function main() {
  const apply = process.argv.includes("--apply");
  if (!apply) {
    console.log("DRY RUN: no database writes. Re-run with --apply and HEAVIX_ENV=preview to seed.");
    console.log(`Would ensure ${GROUPS.length} groups and ${STANDALONES.length} standalone items exist.`);
    return;
  }
  if (process.env.HEAVIX_ENV !== "preview") {
    throw new Error("Admin navigation seed writes are restricted to HEAVIX_ENV=preview.");
  }

  console.log('→ Seeding AdminNavigationGroup + AdminNavigationItem …');

  // 1. Upsert groups
  for (const g of GROUPS) {
    const group = await prisma.adminNavigationGroup.upsert({
      where: { key: g.key },
      create: { key: g.key, titleFa: g.titleFa, titleEn: g.key, icon: g.icon, sortOrder: g.sortOrder },
      update: {},
    });

    // 2. Upsert items within this group
    for (let i = 0; i < g.items.length; i++) {
      const item = g.items[i];
      const key = `${g.key}_${item.href.replace(/[^a-z0-9]/gi, '_')}`;
      await prisma.adminNavigationItem.upsert({
        where: { key },
        create: {
          key,
          titleFa: item.titleFa,
          titleEn: item.href,
          href: item.href,
          sortOrder: i,
          permissionKey: item.permissionKey,
          groupId: group.id,
        },
        update: {},
      });
    }
  }

  // 3. Upsert standalone items (no group)
  for (const s of STANDALONES) {
    await prisma.adminNavigationItem.upsert({
      where: { key: s.key },
      create: {
        key: s.key,
        titleFa: s.titleFa,
        titleEn: s.key,
        href: s.href,
        icon: s.icon,
        sortOrder: s.sortOrder,
        permissionKey: s.permissionKey,
        groupId: null,
      },
      update: {},
    });
  }

  // 4. Stats
  const groupCount = await prisma.adminNavigationGroup.count();
  const itemCount = await prisma.adminNavigationItem.count();
  console.log(`  ✓ ${groupCount} groups, ${itemCount} items`);
  console.log('✓ Admin navigation seed complete.');
}

main()
  .catch((err) => { console.error('[seed] FATAL:', err); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
