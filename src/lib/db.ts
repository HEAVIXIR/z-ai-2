import { PrismaClient } from "@prisma/client";

/**
 * Node.js Prisma client for local development and the Docker/standalone build.
 * Cloudflare builds replace this module with db.worker.ts through next.config.ts.
 */
const SCHEMA_VERSION = "p2-auction-company-rental-node-pg";
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaSchemaVersion?: string;
};

if (globalForPrisma.prismaSchemaVersion !== SCHEMA_VERSION) {
  globalForPrisma.prisma = undefined;
  globalForPrisma.prismaSchemaVersion = SCHEMA_VERSION;
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ["error", "warn"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
  globalForPrisma.prismaSchemaVersion = SCHEMA_VERSION;
}
