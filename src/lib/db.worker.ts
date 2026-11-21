import { getCloudflareContext } from "@opennextjs/cloudflare";
import { PrismaClient, Prisma } from "./generated/worker-client/client";
import {
  createAppWorkerClientResolver,
  type WorkerDatabaseEnv,
} from "./prisma-worker-clients";
import { createRequestScopedPrismaProxy } from "./prisma-worker-proxy";

const getRequestClient = createAppWorkerClientResolver();
const getCurrentRequestClient = () => {
  const { ctx, env } = getCloudflareContext();
  return getRequestClient(ctx as object, env as WorkerDatabaseEnv);
};

export const db = createRequestScopedPrismaProxy(getCurrentRequestClient) as PrismaClient;
export { Prisma };
export type { Article } from "./generated/worker-client/client";
