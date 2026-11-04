import { getCloudflareContext } from "@opennextjs/cloudflare";
import { PrismaClient } from "@/lib/generated/store-worker-client/client";
import { PrismaPostgresAdapter } from "@prisma/adapter-ppg";
import {
  createRequestScopedClientResolver,
  createRequestScopedPrismaProxy,
} from "@/lib/prisma-worker-proxy";

type WorkerEnv = {
  STORE_DATABASE_URL?: string;
};

const getRequestStoreClient = createRequestScopedClientResolver(
  () => getCloudflareContext().ctx as object,
  () => {
    const { env } = getCloudflareContext();
    const connectionString = (env as WorkerEnv).STORE_DATABASE_URL;
    if (!connectionString) {
      throw new Error("Missing Cloudflare Worker secret: STORE_DATABASE_URL");
    }

    return new PrismaClient({
      adapter: new PrismaPostgresAdapter({ connectionString }),
      log: ["error", "warn"],
    });
  },
);

export const storeDb = createRequestScopedPrismaProxy(
  getRequestStoreClient,
) as PrismaClient;
