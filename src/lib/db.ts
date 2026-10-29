import { PrismaClient } from "@/lib/generated/client/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Main HEAVIX Prisma Client (Prisma 7 + runtime=cloudflare).
 *
 * Prisma 7 generates a single TypeScript client with runtime="cloudflare"
 * that works in BOTH Node.js and Cloudflare Workers. The client uses
 * import('./query_compiler_fast_bg.wasm?module') — Cloudflare's official
 * WASM module import — instead of readFileSync, so it works in the Worker
 * runtime without filesystem access.
 *
 * The PrismaPg driver adapter handles query execution against PostgreSQL.
 * The adapter is the DEFAULT usage pattern in Prisma 7 (no /edge rejection).
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
  }) as unknown as PrismaClient;
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
