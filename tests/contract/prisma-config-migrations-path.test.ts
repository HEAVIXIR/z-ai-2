import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolvePrismaMigrationsPath } from "../../prisma.config";

describe("Prisma multi-schema migration paths", () => {
  it("uses the Store migration directory when the Store schema is selected", () => {
    expect(
      resolvePrismaMigrationsPath(["prisma", "migrate", "deploy", "--schema=prisma/store/schema.prisma"], "/repo"),
    ).toBe(path.join("/repo", "prisma", "store", "migrations"));
  });

  it("keeps the main database migration directory for the main schema", () => {
    expect(
      resolvePrismaMigrationsPath(["prisma", "migrate", "deploy", "--schema=prisma/schema.prisma"], "/repo"),
    ).toBe(path.join("/repo", "prisma", "migrations"));
  });
});
