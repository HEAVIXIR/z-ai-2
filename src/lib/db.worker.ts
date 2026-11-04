import { PrismaClient } from "@/lib/generated/worker-client/client";
import { PrismaPostgresAdapter } from "@prisma/adapter-ppg";

const SCHEMA_VERSION = "heavix-main-workerd-ppg-v1";

type PrismaGlobal = typeof globalThis & {
  prismaWorker?: PrismaClient;
  prismaWorkerSchemaVersion?: string;
};

const globalForPrisma = globalThis as PrismaGlobal;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required Worker secret: ${name}`);
  return value;
}

function createWorkerPrismaClient(): PrismaClient {
  const adapter = new PrismaPostgresAdapter({
    connectionString: requiredEnv("DATABASE_URL"),
  });
  return new PrismaClient({ adapter });
}

if (globalForPrisma.prismaWorkerSchemaVersion !== SCHEMA_VERSION) {
  globalForPrisma.prismaWorker = undefined;
  globalForPrisma.prismaWorkerSchemaVersion = SCHEMA_VERSION;
}

globalForPrisma.prismaWorker ??= createWorkerPrismaClient();

export const db: PrismaClient = globalForPrisma.prismaWorker;
