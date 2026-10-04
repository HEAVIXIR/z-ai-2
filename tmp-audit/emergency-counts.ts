import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
async function main() {
  const out: Record<string, any> = {};
  for (const [k, m] of Object.entries({ Role: db.role, Permission: db.permission, RolePermission: db.rolePermission, AdminNavigationItem: db.adminNavigationItem, SiteSettings: db.siteSettings, SiteStat: db.siteStat, AITaskPolicy: db.aITaskPolicy, AIBudget: db.aIBudget, Country: db.country, Category: db.category, City: db.city, Province: db.province, ServiceType: db.serviceType, TransactionType: db.transactionType, ApplicationIndustry: db.applicationIndustry })) {
    try { out[k] = await (m as any).count(); } catch (e: any) { out[k] = `ERR`; }
  }
  console.log(JSON.stringify(out, null, 2));
}
main().catch(e => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
