import { PrismaClient as NodePrismaClient } from "@prisma/client";
import { PrismaClient as WorkerPrismaClient } from "@/lib/generated/client/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Main HEAVIX Prisma client.
 * Node.js processes use the Node-generated client; Cloudflare Preview uses
 * the separately generated Cloudflare runtime client.
 */
const SCHEMA_VERSION = "p2-auction-company-rental";

type MainPrismaClient = NodePrismaClient | WorkerPrismaClient;
type PrismaGlobal = typeof globalThis & {
  prisma?: MainPrismaClient;
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

function createPrismaClient(): MainPrismaClient {
  const adapter = new PrismaPg({
    connectionString: requiredEnv("DATABASE_URL"),
  });
  const options = { adapter, log: ["error", "warn"] };

  return process.env.HEAVIX_ENV === "preview"
    ? new WorkerPrismaClient(options)
    : new NodePrismaClient(options);
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
