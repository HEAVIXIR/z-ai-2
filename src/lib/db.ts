import { PrismaClient } from "@prisma/client";
import { PrismaClient as WorkerPrismaClient } from "@/lib/generated/main-worker-client/wasm";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Main HEAVIX Prisma Client.
 *
 * Keep the standard generated client for Node.js tasks and tests. The
 * Cloudflare Preview Worker uses a separate engine-less client plus pg
 * adapter, avoiding a Rust query-engine binary in workerd.
 */
const SCHEMA_VERSION = "p2-auction-company-rental";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaSchemaVersion?: string;
};

function createPrismaClient(): PrismaClient {
  if (process.env.HEAVIX_ENV === "preview") {
    const adapter = new PrismaPg({
      connectionString: process.env.DATABASE_URL as string,
    });

    return new WorkerPrismaClient({
      adapter,
      log: ["error", "warn"],
    }) as unknown as PrismaClient;
  }

  return new PrismaClient({ log: ["error", "warn"] });
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
