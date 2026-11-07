import { getCloudflareContext } from "@opennextjs/cloudflare";
import { PrismaClient } from "./generated/store-worker-client/client";
import {
  createStoreWorkerClientResolver,
  type WorkerDatabaseEnv,
} from "./prisma-worker-clients";
import { createRequestScopedPrismaProxy } from "./prisma-worker-proxy";

const getRequestStoreClient = createStoreWorkerClientResolver();
const getCurrentRequestStoreClient = () => {
  const { ctx, env } = getCloudflareContext();
  return getRequestStoreClient(ctx as object, env as WorkerDatabaseEnv);
};

export const storeDb = createRequestScopedPrismaProxy(
  getCurrentRequestStoreClient,
) as PrismaClient;
