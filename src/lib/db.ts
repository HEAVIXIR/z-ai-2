import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Main HEAVIX Prisma Client singleton.
 *
 * Use Prisma's engine-less client and the PostgreSQL driver adapter so the
 * client does not require a Rust query-engine binary in Cloudflare Workers.
 * Cache the client in development to avoid exhausting connections during
 * Next.js hot reloads.
 */
const SCHEMA_VERSION = "p2-auction-company-rental";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaSchemaVersion?: string;
};

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL as string,
  });

  return new PrismaClient({
    adapter,
    log: ["error", "warn"],
  });
}

if (globalForPrisma.prismaSchemaVersion !== SCHEMA_VERSION) {
  globalForPrisma.prisma = undefined;
  globalForPrisma.prismaSchemaVersion = SCHEMA_VERSION;
}

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
  globalForPrisma.prismaSchemaVersion = SCHEMA_VERSION;
}
