import { PrismaClient as NodePrismaClient } from "@prisma/client";
import { PrismaClient as WorkerPrismaClient } from "@/lib/generated/client/client";
import { PrismaPg } from "@prisma/adapter-pg";

const SCHEMA_VERSION = "p2-auction-company-rental";

type PrismaGlobal = typeof globalThis & {
  prismaNode?: NodePrismaClient;
  prismaWorker?: WorkerPrismaClient;
  prismaSchemaVersion?: string;
};

const globalForPrisma = globalThis as PrismaGlobal;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function createNodePrismaClient(): NodePrismaClient {
  const adapter = new PrismaPg({ connectionString: requiredEnv("DATABASE_URL") });
  return new NodePrismaClient({ adapter });
}

function createWorkerPrismaClient(): WorkerPrismaClient {
  const adapter = new PrismaPg({ connectionString: requiredEnv("DATABASE_URL") });
  return new WorkerPrismaClient({ adapter });
}

if (globalForPrisma.prismaSchemaVersion !== SCHEMA_VERSION) {
  globalForPrisma.prismaNode = undefined;
  globalForPrisma.prismaWorker = undefined;
  globalForPrisma.prismaSchemaVersion = SCHEMA_VERSION;
}

const isWorkerRuntime = process.env.HEAVIX_ENV === "preview";

function getPrismaClient(): NodePrismaClient | WorkerPrismaClient {
  if (isWorkerRuntime) {
    globalForPrisma.prismaWorker ??= createWorkerPrismaClient();
    return globalForPrisma.prismaWorker;
  }
  globalForPrisma.prismaNode ??= createNodePrismaClient();
  return globalForPrisma.prismaNode;
}

export const db = getPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prismaSchemaVersion = SCHEMA_VERSION;
}
