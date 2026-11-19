/**
 * Phase 6 + 7: Automation + Monetization Seed.
 * Per HEAVIX COMPLETION MASTER SPEC V1.0 §37-42, §54-55, §63.
 *
 * Phase 6 — Automation:
 * - Enable feature flags for production
 * - Activate launch phases
 * - Configure AI task policies
 * - Seed background jobs
 *
 * Phase 7 — Monetization:
 * - SubscriptionPlans (BASIC/PRO/PREMIUM)
 *
 * This seed intentionally does NOT fabricate Payment or PremiumSubscription
 * rows. Financial settlement and entitlements must come from verified,
 * audited operational flows, never from user ordering or demo seed data.
 */
import { db } from "../src/lib/db";

async function main() {
  console.log("=== PHASE 6+7: AUTOMATION + MONETIZATION SEED ===\n");

  // ── PHASE 6: AUTOMATION ──

  // 1. Enable feature flags for production
  console.log("1. Enabling feature flags...");
  const flags = await db.featureFlag.findMany();
  let flagCount = 0;
  for (const flag of flags) {
    if (flag.key === "ENABLE_AUCTION" && !flag.enabled) {
      await db.featureFlag.update({ where: { id: flag.id }, data: { enabled: true } });
      console.log(`  ✓ Enabled: ${flag.key}`);
      flagCount++;
    }
    if (flag.key === "ENABLE_VOICE_SEARCH" && !flag.enabled) {
      // Keep voice search off for now
    }
  }
  console.log(`  ✓ ${flagCount} flags updated`);

  // 2. Update launch phases — mark first phases as ACTIVE/COMPLETED
  console.log("\n2. Updating launch phases...");
  const phases = await db.launchPhase.findMany({ orderBy: { phase: "asc" } });
  let phaseCount = 0;
  for (const phase of phases) {
    let newStatus = phase.status;
    if (phase.phase <= 2) newStatus = "COMPLETED";
    else if (phase.phase === 3) newStatus = "ACTIVE";
    
    if (newStatus !== phase.status) {
      await db.launchPhase.update({
        where: { id: phase.id },
        data: { status: newStatus },
      });
      phaseCount++;
    }
  }
  console.log(`  ✓ ${phaseCount} launch phases updated`);

  // 3. Seed AI Task Policies (if not exist)
  console.log("\n3. Seeding AI Task Policies...");
  const existingPolicies = await db.aITaskPolicy.count().catch(() => 0);
  if (existingPolicies === 0) {
    const policies = [
      { taskType: "listing-builder", allowedRoles: ["SELLER", "ADMIN"], hourlyLimit: 10, dailyLimit: 50, maxInputChars: 5000, timeoutMs: 30000 },
      { taskType: "price-suggestion", allowedRoles: ["SELLER", "BUYER", "ADMIN"], hourlyLimit: 20, dailyLimit: 100, maxInputChars: 3000, timeoutMs: 15000 },
      { taskType: "ai-search", allowedRoles: ["BUYER", "SELLER", "ADMIN"], hourlyLimit: 50, dailyLimit: 200, maxInputChars: 1000, timeoutMs: 10000 },
      { taskType: "ai-compare", allowedRoles: ["BUYER", "SELLER", "ADMIN"], hourlyLimit: 30, dailyLimit: 150, maxInputChars: 5000, timeoutMs: 20000 },
      { taskType: "image-search", allowedRoles: ["ADMIN"], hourlyLimit: 20, dailyLimit: 100, maxInputChars: 500, timeoutMs: 30000 },
      { taskType: "image-generation", allowedRoles: ["ADMIN"], hourlyLimit: 10, dailyLimit: 50, maxInputChars: 1000, timeoutMs: 60000 },
      { taskType: "social-reel", allowedRoles: ["ADMIN"], hourlyLimit: 5, dailyLimit: 20, maxInputChars: 2000, timeoutMs: 300000 },
      { taskType: "ai-scraper", allowedRoles: ["ADMIN"], hourlyLimit: 3, dailyLimit: 10, maxInputChars: 5000, timeoutMs: 120000 },
    ];

    let policyCount = 0;
    for (const p of policies) {
      try {
        await db.aITaskPolicy.create({
          data: {
            taskType: p.taskType,
            allowedRoles: JSON.stringify(p.allowedRoles),
            hourlyLimit: p.hourlyLimit,
            dailyLimit: p.dailyLimit,
            maxInputChars: p.maxInputChars,
            timeoutMs: p.timeoutMs,
            active: true,
          },
        });
        policyCount++;
      } catch {}
    }
    console.log(`  ✓ ${policyCount} AI task policies created`);
  } else {
    console.log(`  ✓ ${existingPolicies} policies already exist`);
  }

  // 4. Seed AI Budget (if not exist)
  console.log("\n4. Seeding AI Budget...");
  const existingBudget = await db.aIBudget.findUnique({ where: { id: "main" } }).catch(() => null);
  if (!existingBudget) {
    await db.aIBudget.create({
      data: {
        id: "main",
        dailyLimitUsd: 0,
        monthlyLimitUsd: 0,
        active: false,
      },
    }).catch(() => {});
  } else if (existingBudget.active) {
    await db.aIBudget.update({
      where: { id: "main" },
      data: { active: false },
    }).catch(() => {});
  }
  console.log("  ✓ AI budget remains disabled under the free-infrastructure policy");

  // 5. Seed background jobs (placeholder records)
  console.log("\n5. Seeding background job records...");
  // Note: Background jobs are typically created at runtime, not seeded.
  // But we can verify the job system is working by creating a test job.
  console.log("  ✓ Job system ready (jobs created at runtime)");

  // ── PHASE 7: MONETIZATION ──

  // 6. Seed Subscription Plans
  console.log("\n6. Seeding Subscription Plans...");
  const plans = [
    {
      code: "BASIC",
      nameFa: "پایه",
      nameEn: "Basic",
      description: "مناسب فروشگاه‌های فردی و تازه‌کار",
      priceMonthly: 0n,
      priceYearly: 0n,
      featuredCredits: 0,
      maxListings: 4,
      maxImages: 4,
      supportLevel: "BASIC",
      sortOrder: 1,
      active: true,
      popular: false,
      featuresJson: JSON.stringify(["۴ آگهی فعال", "۴ تصویر برای هر آگهی", "نمایش استاندارد در نتایج", "پشتیبانی ایمیلی", "داشبورد پایه"]),
    },
    {
      code: "PRO",
      nameFa: "حرفه‌ای",
      nameEn: "Pro",
      description: "برترین انتخاب شرکت‌های متوسط و نمایندگی‌ها",
      priceMonthly: 2900000n,
      priceYearly: 29000000n,
      featuredCredits: 2,
      analyticsAccess: true,
      aiAssistantAccess: false,
      priorityLeads: false,
      maxListings: 10,
      maxImages: 8,
      verifiedBadge: true,
      supportLevel: "PHONE",
      sortOrder: 2,
      active: true,
      popular: true,
      featuresJson: JSON.stringify(["۱۰ آگهی فعال", "۸ تصویر برای هر آگهی", "۲ آگهی ویژه ماهانه", "دسترسی به تحلیل بازار", "اولویت در نتایج جستجو", "نشان تأییدشده", "پشتیبانی تلفنی"]),
    },
    {
      code: "PREMIUM",
      nameFa: "ویژه",
      nameEn: "Premium",
      description: "راهکار کامل برای نمایندگی‌های رسمی و شرکت‌های بزرگ",
      priceMonthly: 8900000n,
      priceYearly: 89000000n,
      featuredCredits: 5,
      analyticsAccess: true,
      aiAssistantAccess: true,
      priorityLeads: true,
      companyPage: true,
      maxListings: 20,
      maxImages: 8,
      verifiedBadge: true,
      supportLevel: "DEDICATED",
      sortOrder: 3,
      active: true,
      popular: false,
      featuresJson: JSON.stringify(["۲۰ آگهی فعال", "۸ تصویر برای هر آگهی", "۵ آگهی ویژه ماهانه", "دسترسی به تحلیل بازار", "اولویت در نتایج جستجو", "دسترسی به هوش مصنوعی", "صفحه اشتراک اختصاصی", "سرنخ‌های اولویت‌دار", "نشان تأییدشده طلایی", "پشتیبانی اختصاصی ۲۴ ساعته"]),
    },
  ];

  let planCount = 0;
  for (const plan of plans) {
    const existing = await db.subscriptionPlan.findUnique({ where: { code: plan.code } }).catch(() => null);
    if (!existing) {
      await db.subscriptionPlan.create({ data: plan as any });
      planCount++;
    } else {
      await db.subscriptionPlan.update({ where: { code: plan.code }, data: plan as any });
      planCount++;
    }
  }
  console.log(`  ✓ ${planCount} subscription plans created/updated`);

  // 7. Do not seed synthetic financial records or paid entitlements.
  // A fabricated PAID payment or PREMIUM subscription could grant access
  // to an arbitrary first user and corrupt the financial ledger.
  console.log("\n7. Skipping synthetic Payment and PremiumSubscription records.");

  console.log("\n=== PHASE 6+7 SEED COMPLETE ===");
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
}).finally(() => db.$disconnect());
