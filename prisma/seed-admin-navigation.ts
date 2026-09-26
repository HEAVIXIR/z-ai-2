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

type Item = { titleFa: string; href: string; permissionKey?: string; icon?: string };
type Group = { key: string; titleFa: string; icon: string; sortOrder: number; items: Item[] };
type Standalone = { key: string; titleFa: string; href: string; icon: string; sortOrder: number; permissionKey?: string };

// ── Groups (with children) ──────────────────────────────────
const GROUPS: Group[] = [
  {
    key: 'home', titleFa: 'صفحه اصلی', icon: 'MonitorSmartphone', sortOrder: 1,
    items: [
      { titleFa: 'بخش‌های صفحه', href: '/admin/home', permissionKey: 'admin.home.manage' },
      { titleFa: 'چیدمان صفحه اصلی', href: '/admin/homepage-layout', permissionKey: 'admin.home.manage' },
      { titleFa: 'هیرو', href: '/admin/home/hero', permissionKey: 'admin.home.manage' },
      { titleFa: 'دسته‌بندی صفحه اصلی', href: '/admin/home/categories', permissionKey: 'admin.home.manage' },
      { titleFa: 'ماشین‌آلات تأییدشده', href: '/admin/home/verified-machines', permissionKey: 'admin.home.manage' },
      { titleFa: 'برندهای مورد اعتماد', href: '/admin/home/trusted-brands', permissionKey: 'admin.home.manage' },
      { titleFa: 'خدمات', href: '/admin/services', permissionKey: 'service.read' },
      { titleFa: 'هدر', href: '/admin/home/header', permissionKey: 'admin.home.manage' },
      { titleFa: 'فوتر', href: '/admin/home/footer', permissionKey: 'admin.home.manage' },
      { titleFa: 'آمار سایت', href: '/admin/site-stats', permissionKey: 'admin.settings.read' },
      { titleFa: 'منو', href: '/admin/menu', permissionKey: 'admin.menu.manage' },
      { titleFa: 'کتابخانه رسانه', href: '/admin/media', permissionKey: 'media.read' },
    ],
  },
  {
    key: 'taxonomy', titleFa: 'تاکسونومی', icon: 'FolderTree', sortOrder: 4,
    items: [
      { titleFa: 'هاب تاکسونومی', href: '/admin/taxonomy', permissionKey: 'taxonomy.read' },
      { titleFa: 'دسته‌ها', href: '/admin/categories', permissionKey: 'taxonomy.read' },
      { titleFa: 'محصولات', href: '/admin/products', permissionKey: 'product.read' },
      { titleFa: 'گراف سازگاری', href: '/admin/compatibility', permissionKey: 'taxonomy.read' },
      { titleFa: 'گراف دانش', href: '/admin/knowledge-graph', permissionKey: 'knowledge.read' },
      { titleFa: 'ویژگی‌ها', href: '/admin/taxonomy/attributes', permissionKey: 'taxonomy.read' },
      { titleFa: 'برندها', href: '/admin/taxonomy/brands', permissionKey: 'brand.read' },
      { titleFa: 'خانواده برندها', href: '/admin/brand-families', permissionKey: 'brand.read' },
      { titleFa: 'انواع معامله', href: '/admin/taxonomy/transactions', permissionKey: 'taxonomy.read' },
      { titleFa: 'انواع خدمت', href: '/admin/taxonomy/services', permissionKey: 'taxonomy.read' },
      { titleFa: 'صنایع کاربرد', href: '/admin/taxonomy/industries', permissionKey: 'taxonomy.read' },
      { titleFa: 'مکان‌ها', href: '/admin/taxonomy/locations', permissionKey: 'taxonomy.read' },
      { titleFa: 'برندها (قدیمی)', href: '/admin/brands', permissionKey: 'brand.read' },
    ],
  },
  {
    key: 'market', titleFa: 'بازار و تحلیل', icon: 'Activity', sortOrder: 5,
    items: [
      { titleFa: 'تحلیل و آمار', href: '/admin/analytics', permissionKey: 'analytics.read' },
      { titleFa: 'هوش بازار', href: '/admin/market-intelligence', permissionKey: 'analytics.read' },
      { titleFa: 'نقشه حرارتی بازار', href: '/admin/market-heatmap', permissionKey: 'analytics.read' },
      { titleFa: 'هوش قیمتی', href: '/admin/price-intelligence', permissionKey: 'pricing.read' },
      { titleFa: 'موتور قیمت‌گذاری', href: '/admin/pricing', permissionKey: 'pricing.read' },
      { titleFa: 'موتور تقاضا', href: '/admin/demand-engine', permissionKey: 'analytics.read' },
      { titleFa: 'رادار فرصت‌ها', href: '/admin/opportunity-radar', permissionKey: 'analytics.read' },
      { titleFa: 'موتور فرصت‌ها', href: '/admin/opportunities', permissionKey: 'analytics.read' },
      { titleFa: 'تحلیل‌گر هوش مصنوعی', href: '/admin/ai-analyst', permissionKey: 'ai.execute' },
      { titleFa: 'سیگنال‌های تقاضا (AI)', href: '/admin/demand-signals', permissionKey: 'analytics.read' },
      { titleFa: 'موتور مقایسه', href: '/admin/compare', permissionKey: 'analytics.read' },
      { titleFa: 'سلامت کاتالوگ', href: '/admin/catalog-health', permissionKey: 'taxonomy.read' },
    ],
  },
  {
    key: 'transactions', titleFa: 'معاملات', icon: 'Wallet', sortOrder: 6,
    items: [
      { titleFa: 'اتاق‌های معامله', href: '/admin/deal-rooms', permissionKey: 'deal.read' },
      { titleFa: 'کارشناسی', href: '/admin/inspections', permissionKey: 'inspection.read' },
      { titleFa: 'حمل‌ونقل', href: '/admin/transport', permissionKey: 'transport.read' },
      { titleFa: 'پیشنهادها', href: '/admin/offers', permissionKey: 'offer.read' },
      { titleFa: 'درخواست‌های خرید', href: '/admin/requests', permissionKey: 'request.read' },
      { titleFa: 'RFQ (B2B)', href: '/admin/rfq', permissionKey: 'rfq.read' },
      { titleFa: 'مزایده ماشین‌آلات', href: '/admin/auctions', permissionKey: 'auction.read' },
      { titleFa: 'فروش در ۷ روز', href: '/admin/sell-in-7-days', permissionKey: 'listing.read' },
      { titleFa: 'ردیابی آگهی', href: '/admin/rejections', permissionKey: 'listing.read' },
    ],
  },
  {
    key: 'content', titleFa: 'محتوا', icon: 'BookOpen', sortOrder: 7,
    items: [
      { titleFa: 'هویکس دانش', href: '/admin/articles', permissionKey: 'article.read' },
      { titleFa: 'پایه دانش', href: '/admin/knowledge', permissionKey: 'knowledge.read' },
      { titleFa: 'دیکشنری صنعتی', href: '/admin/dictionary', permissionKey: 'taxonomy.read' },
      { titleFa: 'جستجوهای داغ', href: '/admin/hot-searches', permissionKey: 'content.read' },
      { titleFa: 'سئو', href: '/admin/seo', permissionKey: 'seo.read' },
      { titleFa: 'ریلز شبکه‌های اجتماعی', href: '/admin/reels', permissionKey: 'media.read' },
    ],
  },
  {
    key: 'moderation', titleFa: 'نظرات و نظارت', icon: 'ShieldAlert', sortOrder: 8,
    items: [
      { titleFa: 'مدیریت محتوا', href: '/admin/moderation', permissionKey: 'moderation.read' },
    ],
  },
  {
    key: 'system', titleFa: 'سیستم و هوش مصنوعی', icon: 'Brain', sortOrder: 11,
    items: [
      { titleFa: 'پرچم‌های ویژگی', href: '/admin/feature-flags', permissionKey: 'system.manage' },
      { titleFa: 'دروازه هوش مصنوعی', href: '/admin/ai-gateway', permissionKey: 'ai.manage' },
      { titleFa: 'بودجه AI', href: '/admin/ai-budget', permissionKey: 'ai.manage' },
      { titleFa: 'ایجنت‌های هوش مصنوعی', href: '/admin/ai-agents', permissionKey: 'ai.manage' },
      { titleFa: 'موتور رشد', href: '/admin/growth-engine', permissionKey: 'system.manage' },
      { titleFa: 'فازهای راه‌اندازی', href: '/admin/launch-phases', permissionKey: 'system.manage' },
      { titleFa: 'اسکرپر هوش مصنوعی', href: '/admin/ai-scraper', permissionKey: 'ai.execute' },
      { titleFa: 'کارهای پس‌زمینه', href: '/admin/jobs', permissionKey: 'system.manage' },
    ],
  },
];

// ── Standalone items (no group) ─────────────────────────────
const STANDALONES: Standalone[] = [
  { key: 'dashboard', titleFa: 'داشبورد', href: '/admin/dashboard', icon: 'LayoutDashboard', sortOrder: 0 },
  { key: 'listings', titleFa: 'آگهی‌ها', href: '/admin/listings', icon: 'Megaphone', sortOrder: 2, permissionKey: 'listing.read' },
  { key: 'companies', titleFa: 'شرکت‌ها', href: '/admin/companies', icon: 'Building2', sortOrder: 3, permissionKey: 'company.read' },
  { key: 'subscriptions', titleFa: 'اشتراک‌ها', href: '/admin/subscriptions', icon: 'Crown', sortOrder: 9, permissionKey: 'subscription.read' },
  { key: 'users', titleFa: 'کاربران', href: '/admin/users', icon: 'Users', sortOrder: 10, permissionKey: 'user.read' },
  { key: 'sellers', titleFa: 'فروشندگان', href: '/admin/sellers', icon: 'Store', sortOrder: 10.25, permissionKey: 'user.read' },
  { key: 'disputes', titleFa: 'اختلافات', href: '/admin/resources/disputes', icon: 'Gavel', sortOrder: 10.5, permissionKey: 'dispute.read' },
  { key: 'conversations', titleFa: 'مکالمات', href: '/admin/conversations', icon: 'MessagesSquare', sortOrder: 10.3, permissionKey: 'conversation.read' },
  // ── T-B: Marketplace Partials Completion — verification trust-center ──
  // Standalone page that lists ALL CompanyVerification rows (not embedded
  // in /admin/companies/[id]). Uses the canonical `company.verify` gate.
  { key: 'verifications', titleFa: 'تأییدها', href: '/admin/verifications', icon: 'BadgeCheck', sortOrder: 10.35, permissionKey: 'company.verify' },
  { key: 'matching', titleFa: 'تطابق', href: '/admin/matching', icon: 'Sparkles', sortOrder: 10.4, permissionKey: 'matching.read' },
  { key: 'audit-log', titleFa: 'لاگ ممیزی', href: '/admin/audit-log', icon: 'ShieldCheck', sortOrder: 12, permissionKey: 'audit.read' },
  { key: 'settings', titleFa: 'تنظیمات', href: '/admin/settings', icon: 'Settings', sortOrder: 13, permissionKey: 'system.manage' },

  // ── T-A: Store Domain Completion — store admin sub-pages ──
  // Fine-grained permission keys (inventory.read / returns.read / shipping.read)
  // were added to src/lib/authorization/permissions.ts. ADMIN gets them all
  // via the [...PERMISSIONS] spread.
  { key: 'store-inventory', titleFa: 'موجودی', href: '/admin/store/inventory', icon: 'Boxes', sortOrder: 14.1, permissionKey: 'inventory.read' },
  { key: 'store-returns', titleFa: 'مرتجعات', href: '/admin/store/returns', icon: 'Undo2', sortOrder: 14.2, permissionKey: 'returns.read' },
  { key: 'store-shipments', titleFa: 'محموله‌ها', href: '/admin/store/shipments', icon: 'Truck', sortOrder: 14.3, permissionKey: 'shipping.read' },
];

async function main() {
  console.log('→ Seeding AdminNavigationGroup + AdminNavigationItem …');

  // 1. Upsert groups
  for (const g of GROUPS) {
    const group = await prisma.adminNavigationGroup.upsert({
      where: { key: g.key },
      create: { key: g.key, titleFa: g.titleFa, titleEn: g.key, icon: g.icon, sortOrder: g.sortOrder },
      update: { titleFa: g.titleFa, icon: g.icon, sortOrder: g.sortOrder },
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
        update: {
          titleFa: item.titleFa,
          href: item.href,
          sortOrder: i,
          permissionKey: item.permissionKey,
          groupId: group.id,
        },
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
      update: {
        titleFa: s.titleFa,
        href: s.href,
        icon: s.icon,
        sortOrder: s.sortOrder,
        permissionKey: s.permissionKey,
      },
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
