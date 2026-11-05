import { PrismaClient as AppPrismaClient } from "./generated/worker-client/client";
import { PrismaClient as StorePrismaClient } from "./generated/store-worker-client/client";
import { PrismaPostgresAdapter } from "@prisma/adapter-ppg";
import { createRequestScopedClientResolver } from "./prisma-worker-proxy";

export type WorkerDatabaseEnv = {
  DATABASE_URL?: string;
  STORE_DATABASE_URL?: string;
};

/** Shared factories used by OpenNext and the isolated local Workerd proof. */
export function createAppWorkerClientResolver() {
  return createRequestScopedClientResolver<AppPrismaClient, WorkerDatabaseEnv>(
    (_requestKey, env) => {
      const connectionString = env.DATABASE_URL;
      if (!connectionString) {
        throw new Error("Missing Cloudflare Worker secret: DATABASE_URL");
      }
      return new AppPrismaClient({
        adapter: new PrismaPostgresAdapter({ connectionString }),
        log: ["error", "warn"],
      });
    },
  );
}

export function createStoreWorkerClientResolver() {
  return createRequestScopedClientResolver<StorePrismaClient, WorkerDatabaseEnv>(
    (_requestKey, env) => {
      const connectionString = env.STORE_DATABASE_URL;
      if (!connectionString) {
        throw new Error("Missing Cloudflare Worker secret: STORE_DATABASE_URL");
      }
      return new StorePrismaClient({
        adapter: new PrismaPostgresAdapter({ connectionString }),
        log: ["error", "warn"],
      });
    },
  );
}

export type { AppPrismaClient, StorePrismaClient };
