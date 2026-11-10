import { PrismaClient as NodeStorePrismaClient } from "@/lib/generated/store-node-client";
import { PrismaClient as WorkerStorePrismaClient } from "@/lib/generated/store-client/client";
import { PrismaPg } from "@prisma/adapter-pg";

type StorePrismaGlobal = typeof globalThis & {
  storeDbNode?: NodeStorePrismaClient;
  storeDbWorker?: WorkerStorePrismaClient;
};

const globalForStore = globalThis as StorePrismaGlobal;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function createNodeStorePrismaClient(): NodeStorePrismaClient {
  const adapter = new PrismaPg({ connectionString: requiredEnv("STORE_DATABASE_URL") });
  return new NodeStorePrismaClient({ adapter });
}

function createWorkerStorePrismaClient(): WorkerStorePrismaClient {
  const adapter = new PrismaPg({ connectionString: requiredEnv("STORE_DATABASE_URL") });
  return new WorkerStorePrismaClient({ adapter });
}

function getStorePrismaClient(): NodeStorePrismaClient | WorkerStorePrismaClient {
  if (process.env.HEAVIX_ENV === "preview") {
    globalForStore.storeDbWorker ??= createWorkerStorePrismaClient();
    return globalForStore.storeDbWorker;
  }
  globalForStore.storeDbNode ??= createNodeStorePrismaClient();
  return globalForStore.storeDbNode;
}

export const storeDb = getStorePrismaClient();
