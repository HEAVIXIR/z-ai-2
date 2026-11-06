import { PrismaClient } from "@/lib/generated/client/client";
import { PrismaPg } from "@prisma/adapter-pg";

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

  return new PrismaClient({ adapter });
}

// Use one generated Prisma 7 Cloudflare-compatible client in every server
// runtime. A Node/Worker union makes every model delegate uncallable to
// TypeScript because the generated delegate signatures are not identical.
if (globalForPrisma.prismaSchemaVersion !== SCHEMA_VERSION) {
  globalForPrisma.prisma = undefined;
  globalForPrisma.prismaSchemaVersion = SCHEMA_VERSION;
}

globalForPrisma.prisma ??= createPrismaClient();

export const db: PrismaClient = globalForPrisma.prisma;

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prismaSchemaVersion = SCHEMA_VERSION;
}
