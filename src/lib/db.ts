import { PrismaClient } from "@/lib/generated/client/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Main HEAVIX Prisma Client (Prisma 7 + runtime=cloudflare).
 *
 * Prisma 7 generates a TypeScript client using the Cloudflare-compatible WASM
 * module import. PrismaPg handles query execution against PostgreSQL.
 */
const SCHEMA_VERSION = "p2-auction-company-rental";

type PrismaGlobal = typeof globalThis & {
  prisma?: PrismaClient;
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

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: requiredEnv("DATABASE_URL"),
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
