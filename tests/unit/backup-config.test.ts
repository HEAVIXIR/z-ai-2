import { describe, expect, it } from "vitest";
import { buildBackupEnvironment } from "@/lib/backup-config";

describe("buildBackupEnvironment", () => {
  it("maps Main and Store PostgreSQL URLs without losing encoded credentials", () => {
    expect(
      buildBackupEnvironment({
        DATABASE_URL: "postgresql://backup%2Buser:p%40ss%3Aword@db:5544/heavix%20main?schema=public",
        STORE_DATABASE_URL: "postgresql://store_user:store%20pass@store-db:5432/heavix_store?schema=public",
      }),
    ).toMatchObject({
      DB_HOST: "db",
      DB_PORT: "5544",
      DB_USER: "backup+user",
      DB_NAME: "heavix main",
      DB_PASSWORD: "p@ss:word",
      STORE_DB_HOST: "store-db",
      STORE_DB_PORT: "5432",
      STORE_DB_USER: "store_user",
      STORE_DB_NAME: "heavix_store",
      STORE_DB_PASSWORD: "store pass",
    });
  });

  it("fails closed when either database URL is missing", () => {
    expect(() =>
      buildBackupEnvironment({
        DATABASE_URL: "postgresql://u:p@db:5432/main",
        STORE_DATABASE_URL: undefined,
      }),
    ).toThrow("Store database URL is not configured");
  });

  it("rejects non-PostgreSQL URLs without echoing secrets", () => {
    const secret = "private-secret";
    expect(() =>
      buildBackupEnvironment({
        DATABASE_URL: `file:/tmp/${secret}.db`,
        STORE_DATABASE_URL: "postgresql://u:p@store-db:5432/store",
      }),
    ).toThrow("Main database URL must use PostgreSQL");
  });

  it("rejects missing database credentials", () => {
    expect(() =>
      buildBackupEnvironment({
        DATABASE_URL: "postgresql://db/main",
        STORE_DATABASE_URL: "postgresql://u:p@store-db:5432/store",
      }),
    ).toThrow("Main database URL is missing required connection fields");
  });
});
