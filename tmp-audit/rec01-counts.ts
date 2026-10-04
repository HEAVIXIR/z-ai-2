import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
async function main() {
  const out: Record<string, any> = {};
  for (const [k, m] of Object.entries({
    Role: db.role, Permission: db.permission, RolePermission: db.rolePermission,
    AdminNavigationGroup: db.adminNavigationGroup, AdminNavigationItem: db.adminNavigationItem,
    SiteSettings: db.siteSettings, SiteStat: db.siteStat, AITaskPolicy: db.aITaskPolicy, AIBudget: db.aIBudget,
    Country: db.country, Province: db.province, City: db.city, Category: db.category,
    TransactionType: db.transactionType, ServiceType: db.serviceType,
    ApplicationIndustry: db.applicationIndustry, CategoryApplicationIndustry: db.categoryApplicationIndustry,
    User: db.user, UserRole: db.userRole,
  })) {
    try { out[k] = await (m as any).count(); } catch { out[k] = 'ERR'; }
  }
  const fk = await db.$queryRawUnsafe("PRAGMA foreign_key_check");
  console.log(JSON.stringify({ rowCounts: out, fkViolations: (fk as any[]).length }, null, 2));
  await db.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
