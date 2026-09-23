import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// NOTE: query logging disabled for production stability (was causing stdout flooding
// and process crashes when bundled through `| tee dev.log`).
// Re-enable locally by adding 'query' back to the log array if you need to debug SQL.
export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['error', 'warn'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
