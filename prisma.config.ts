import path from "node:path";

const cliArgs = process.argv.join(" ");
const isPreviewSchema = cliArgs.includes("prisma/preview-schema.prisma");
const isStoreSchema = cliArgs.includes("prisma/store/schema.prisma");

const datasourceUrl = isPreviewSchema
  ? process.env.PREVIEW_DATABASE_URL
  : isStoreSchema
    ? process.env.STORE_DATABASE_URL
    : process.env.DATABASE_URL;

export default {
  schema: path.join(process.cwd(), "prisma", "schema.prisma"),
  migrations: {
    path: path.join(process.cwd(), "prisma", "migrations"),
  },
  ...(datasourceUrl ? { datasource: { url: datasourceUrl } } : {}),
};
