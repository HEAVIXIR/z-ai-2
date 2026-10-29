import { PrismaClient } from "../src/lib/generated/client/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Shared PrismaClient factory for seed scripts and CLI tools.
 * 
 * Prisma 7 requires a driver adapter in the PrismaClient constructor.
 * This helper creates a PrismaClient with PrismaPg adapter, using the
 * DATABASE_URL environment variable.
 */
export function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL as string,
  });
  return new PrismaClient({
    adapter,
    log: ["error", "warn"],
  }) as unknown as PrismaClient;
}
