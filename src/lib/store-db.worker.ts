import { PrismaClient } from "@/lib/generated/store-client/client";
import { PrismaPg } from "@prisma/adapter-pg";

type StorePrismaGlobal = typeof globalThis & {
  storeDbWorker?: PrismaClient;
};

const globalForStore = globalThis as StorePrismaGlobal;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function createWorkerStorePrismaClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: requiredEnv("STORE_DATABASE_URL") });
  return new PrismaClient({ adapter });
}

export const storeDb =
  globalForStore.storeDbWorker ?? (globalForStore.storeDbWorker = createWorkerStorePrismaClient());
