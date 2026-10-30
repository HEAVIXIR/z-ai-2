import { PrismaClient } from "@/lib/generated/store-node-client/client";
import { PrismaPg } from "@prisma/adapter-pg";

type StorePrismaGlobal = typeof globalThis & {
  storeDbNode?: PrismaClient;
};

const globalForStore = globalThis as StorePrismaGlobal;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function createNodeStorePrismaClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: requiredEnv("STORE_DATABASE_URL") });
  return new PrismaClient({ adapter });
}

export const storeDb =
  globalForStore.storeDbNode ?? (globalForStore.storeDbNode = createNodeStorePrismaClient());
