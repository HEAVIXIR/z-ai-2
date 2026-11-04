import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

function scalarListFields(schema: string): string[] {
  const enumNames = [...schema.matchAll(/^enum\s+(\w+)\s*\{/gm)].map((m) => m[1]);
  const scalarNames = [
    "String", "Int", "BigInt", "Float", "Decimal", "Boolean",
    "DateTime", "Json", "Bytes", ...enumNames,
  ];
  const scalarType = scalarNames.join("|");
  return schema.split("\n").filter((line) =>
    new RegExp(`^\\s*\\w+\\s+(?:${scalarType})\\[\\]`).test(line),
  );
}

describe("Prisma Postgres workerd client contract", () => {
  it("uses separate workerd generated clients and PPG adapters for both databases", () => {
    const main = read("src/lib/db.worker.ts");
    const store = read("src/lib/store-db.worker.ts");

    expect(main).toContain("@/lib/generated/worker-client/client");
    expect(main).toContain("@prisma/adapter-ppg");
    expect(main).not.toContain("@prisma/adapter-pg");
    expect(main).toContain('requiredEnv("DATABASE_URL")');

    expect(store).toContain("@/lib/generated/store-worker-client/client");
    expect(store).toContain("@prisma/adapter-ppg");
    expect(store).not.toContain("@prisma/adapter-pg");
    expect(store).toContain('requiredEnv("STORE_DATABASE_URL")');
  });

  it("keeps Node entrypoints as the default and aliases only the Worker build", () => {
    const config = JSON.parse(read("tsconfig.worker.json"));
    expect(config.compilerOptions.paths["@/lib/db"]).toEqual(["./src/lib/db.worker.ts"]);
    expect(config.compilerOptions.paths["@/lib/store-db"]).toEqual(["./src/lib/store-db.worker.ts"]);
    expect(config.compilerOptions.paths["@prisma/client"]).toEqual([
      "./src/lib/generated/worker-client/client.ts",
    ]);
    expect(config.compilerOptions.paths["@/lib/generated/store-client"]).toEqual([
      "./src/lib/generated/store-worker-client/client.ts",
    ]);
    expect(read("next.config.ts")).toContain('process.env.HEAVIX_ENV?.toLowerCase() === "preview"');
  });

  it("does not use native PostgreSQL scalar-list fields unsupported by PPG 7.10.1", () => {
    expect(scalarListFields(read("prisma/schema.prisma"))).toEqual([]);
    expect(scalarListFields(read("prisma/store/schema.prisma"))).toEqual([]);
  });

  it("pins Prisma 6.19.3 and the tested PPG adapter/driver line", () => {
    const pkg = JSON.parse(read("package.json"));
    expect(pkg.dependencies["@prisma/client"]).toBe("6.19.3");
    expect(pkg.dependencies.prisma).toBe("6.19.3");
    expect(pkg.dependencies["@prisma/adapter-ppg"]).toBe("7.10.1");
    expect(pkg.dependencies["@prisma/ppg"]).toBe("1.0.1");
  });
});
