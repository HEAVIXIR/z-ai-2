import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
(async () => {
  console.log('has industry:', typeof (db as any).industry);
  console.log('has brandFamily:', typeof (db as any).brandFamily);
  console.log('has brandAlias:', typeof (db as any).brandAlias);
  console.log('has brandIndustry:', typeof (db as any).brandIndustry);
  if (typeof (db as any).industry === 'object') {
    const industries = await (db as any).industry.findMany({ take: 5 });
    console.log('industries count:', industries.length);
  }
  await db.$disconnect();
})();
