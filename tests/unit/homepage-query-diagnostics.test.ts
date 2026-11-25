import { describe, expect, it, vi } from "vitest";
import {
  sanitizeHomepageQueryError,
  withHomepageQueryDiagnostics,
} from "@/lib/homepage-query-diagnostics";

describe("homepage query diagnostics", () => {
  it("keeps safe Prisma identifiers and excludes raw message/SQL/credentials", () => {
    const error = Object.assign(
      new Error("relation does not exist; DATABASE_URL=postgres://user:secret@db.invalid/app; SELECT * FROM User"),
      {
        name: "PrismaClientKnownRequestError",
        code: "P2021",
        meta: {
          modelName: "Listing",
          table: "public.Listing",
          column: "categoryId",
          database_error: "password=do-not-log",
          sql: "SELECT secret",
        },
      },
    );

    const diagnostic = sanitizeHomepageQueryError("listing.featured", error);
    const serialized = JSON.stringify(diagnostic);

    expect(diagnostic).toMatchObject({
      query: "listing.featured",
      errorName: "PrismaClientKnownRequestError",
      classification: "schema-object-missing",
      prismaCode: "P2021",
      model: "Listing",
      table: "public.Listing",
      column: "categoryId",
    });
    expect(serialized).not.toContain("secret");
    expect(serialized).not.toContain("DATABASE_URL");
    expect(serialized).not.toContain("SELECT");
    expect(serialized).not.toContain("db.invalid");
  });

  it("summarizes adapter error shape and shallow causes without logging raw values", () => {
    const error = {
      cause: {
        code: "P2022",
        message: "column does not exist; password=secret",
        meta: { modelName: "Listing", column: "categoryId" },
      },
      response: {
        status: 500,
        data: { message: "DATABASE_URL=secret", errors: [{ code: "P2022", message: "private SQL" }] },
        headers: { authorization: "secret" },
      },
      requestUrl: "https://db.invalid/private",
      sql: "SELECT private",
    };

    const diagnostic = sanitizeHomepageQueryError("listing.latest", error);
    const serialized = JSON.stringify(diagnostic);

    expect(diagnostic).toMatchObject({
      valueType: "object",
      errorName: "Object",
      causeName: "Object",
      causeKeys: ["code", "message", "meta"],
      responseStatus: 500,
      nestedErrorCount: 1,
      firstNestedErrorKeys: ["code", "message"],
      classification: "schema-object-missing",
      prismaCode: "P2022",
      model: "Listing",
      column: "categoryId",
    });
    expect(serialized).not.toContain("secret");
    expect(serialized).not.toContain("DATABASE_URL");
    expect(serialized).not.toContain("private");
    expect(serialized).not.toContain("db.invalid");
    expect(serialized).not.toContain("authorization");
  });

  it("extracts allowlisted PPG adapter code, kind, column and version without raw message", () => {
    const error = {
      originalCode: "42703",
      originalMessage: 'column "publishedAt" does not exist; DATABASE_URL=secret',
      kind: "ColumnNotFound",
      column: "publishedAt",
      clientVersion: "7.10.1",
    };

    const diagnostic = sanitizeHomepageQueryError("listing.featured", error);
    const serialized = JSON.stringify(diagnostic);

    expect(diagnostic).toMatchObject({
      databaseCode: "42703",
      adapterKind: "ColumnNotFound",
      column: "publishedAt",
      clientVersion: "7.10.1",
      classification: "schema-object-missing",
    });
    expect(serialized).not.toContain('column "publishedAt" does not exist');
    expect(serialized).not.toContain("DATABASE_URL");
    expect(serialized).not.toContain("secret");
  });

  it("drops malformed codes and arbitrary metadata", () => {
    const error = Object.assign(new Error("unknown argument"), {
      code: "postgres://secret",
      meta: {
        modelName: "Listing;DROP",
        table: "public.Listing;DROP",
        target: ["categoryId", "password=secret", "modelId"],
      },
    });

    const diagnostic = sanitizeHomepageQueryError("INVALID QUERY NAME", error);
    expect(diagnostic.query).toBe("homepage.unknown");
    expect(diagnostic.classification).toBe("query-validation");
    expect(diagnostic).not.toHaveProperty("prismaCode");
    expect(diagnostic).not.toHaveProperty("model");
    expect(diagnostic).not.toHaveProperty("table");
    expect(diagnostic.target).toEqual(["categoryId", "modelId"]);
  });

  it("logs only sanitized metadata and rethrows the original failure", async () => {
    const error = Object.assign(new Error("password=secret"), {
      name: "PrismaClientKnownRequestError",
      code: "P2022",
      meta: { modelName: "Listing" },
    });
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(
      withHomepageQueryDiagnostics("listing.latest", async () => {
        throw error;
      }),
    ).rejects.toBe(error);

    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][0]).toBe("[homepage-db-query-failed]");
    expect(JSON.stringify(log.mock.calls[0][1])).not.toContain("secret");
    expect(JSON.stringify(log.mock.calls[0][1])).toContain("P2022");
    log.mockRestore();
  });
});
