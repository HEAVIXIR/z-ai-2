import { PrismaClient } from "../src/lib/generated/node-client/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Node.js Prisma client factory for seed scripts and CLI tools.
 * The Cloudflare Worker uses its separately generated runtime client.
 */
function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: requiredEnv("DATABASE_URL"),
  });
  return new PrismaClient({
    adapter,
    log: ["error", "warn"],
  });
}
