import path from "node:path";

const cliArgs = process.argv.join(" ");
const isPreviewSchema = cliArgs.includes("prisma/preview-schema.prisma");
const isStoreSchema = cliArgs.includes("prisma/store/schema.prisma");

export function resolvePrismaMigrationsPath(
  args: readonly string[],
  cwd = process.cwd(),
): string {
  const storeSchemaSelected = args.join(" ").includes("prisma/store/schema.prisma");
  return path.join(
    cwd,
    "prisma",
    storeSchemaSelected ? "store/migrations" : "migrations",
  );
}

const datasourceUrl = isPreviewSchema
  ? process.env.PREVIEW_DATABASE_URL
  : isStoreSchema
    ? process.env.STORE_DATABASE_URL
    : process.env.DATABASE_URL;

export default {
  schema: path.join(process.cwd(), "prisma", "schema.prisma"),
  migrations: {
    // Main and Store are separate PostgreSQL databases with separate histories.
    path: resolvePrismaMigrationsPath(process.argv),
  },
  ...(datasourceUrl ? { datasource: { url: datasourceUrl } } : {}),
};
