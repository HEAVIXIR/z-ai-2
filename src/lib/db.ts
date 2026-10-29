import { PrismaClient as NodePrismaClient } from "@/lib/generated/node-runtime-client/client";
import { PrismaClient as WorkerPrismaClient } from "@/lib/generated/client/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Main HEAVIX Prisma client.
 * Node.js processes use the Node-generated client; Cloudflare Preview uses
 * the separately generated Cloudflare runtime client. Both are generated from
 * the same schema; expose the Node client contract to keep overloaded
 * transaction APIs callable across the application.
 */
const SCHEMA_VERSION = "p2-auction-company-rental";

type PrismaGlobal = typeof globalThis & {
  prisma?: NodePrismaClient;
  prismaSchemaVersion?: string;
};

const globalForPrisma = globalThis as PrismaGlobal;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function createPrismaClient(): NodePrismaClient {
  const adapter = new PrismaPg({
    connectionString: requiredEnv("DATABASE_URL"),
  });

  if (process.env.HEAVIX_ENV === "preview") {
    return new WorkerPrismaClient({ adapter });
  }

  return new NodePrismaClient({ adapter });
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
