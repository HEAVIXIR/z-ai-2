import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

function scalarListFields(schema: string): string[] {
  const enumNames = [...schema.matchAll(/^enum\s+(\w+)\s*\{/gm)].map((m) => m[1]);
  const scalarNames = ["String", "Int", "BigInt", "Float", "Decimal", "Boolean", "DateTime", "Json", "Bytes", ...enumNames];
  const scalarType = scalarNames.join("|");
  return schema.split("\n").filter((line) => new RegExp(`^\\s*\\w+\\s+(?:${scalarType})\\[\\]`).test(line));
}

describe("Prisma Postgres workerd client contract", () => {
  it("uses PPG adapters and distinct workerd clients for both databases", () => {
    const main = read("src/lib/db.worker.ts");
    const store = read("src/lib/store-db.worker.ts");
    expect(main).toContain("@/lib/generated/worker-client/client");
    expect(main).toContain("@prisma/adapter-ppg");
    expect(main).toContain("getCloudflareContext");
    expect(main).toContain("createRequestScopedClientResolver");
    expect(main).not.toMatch(/globalThis\s*\.\s*\w+/);
    expect(main).not.toContain("@prisma/adapter-pg");
    expect(main).toContain('Missing Cloudflare Worker secret: DATABASE_URL');
    expect(store).toContain("@/lib/generated/store-worker-client/client");
    expect(store).toContain("@prisma/adapter-ppg");
    expect(store).toContain("getCloudflareContext");
    expect(store).toContain("createRequestScopedClientResolver");
    expect(store).not.toMatch(/globalThis\s*\.\s*\w+/);
    expect(store).not.toContain("@prisma/adapter-pg");
    expect(store).toContain('Missing Cloudflare Worker secret: STORE_DATABASE_URL');
  });

  it("selects Worker-only aliases and type resolution for Cloudflare", () => {
    const config = JSON.parse(read("tsconfig.worker.json"));
    expect(config.compilerOptions.paths["@/lib/db"]).toEqual(["./src/lib/db.worker.ts"]);
    expect(config.compilerOptions.paths["@/lib/store-db"]).toEqual(["./src/lib/store-db.worker.ts"]);
    expect(config.compilerOptions.paths["@prisma/client"]).toEqual(["./src/lib/generated/worker-client/client.ts"]);
    expect(config.compilerOptions.paths["@/lib/generated/store-client"]).toEqual(["./src/lib/generated/store-worker-client/client.ts"]);
    const next = read("next.config.ts");
    expect(next).toContain('process.env.HEAVIX_ENV?.toLowerCase() === "preview"');
    expect(next).toContain('process.env.VERCEL !== "1"');
    expect(next).toContain('tsconfigPath: isCloudflareBuild ? "tsconfig.worker.json" : "tsconfig.json"');
    expect(next).toContain("asyncWebAssembly: true");
    expect(next).toContain("config.parallelism = 4");
    expect(next).toContain("outputFileTracingExcludes");
    expect(next).toContain("./src/lib/generated/worker-client/**/*.ts");
    expect(next).toContain("./src/lib/generated/store-worker-client/**/*.ts");
    expect(next).toContain("outputFileTracingIncludes");
    expect(next).toContain("./src/lib/generated/worker-client/internal/query_compiler_bg.wasm");
    expect(next).toContain("cpus: 1");
    const openNext = read("open-next.config.ts");
    expect(openNext).toContain("ulimit -n 4096");
    expect(openNext).toContain("HEAVIX_NOFILE_SOFT");
    expect(openNext).toContain("UV_THREADPOOL_SIZE=4");
  });

  it("keeps Node Prisma entrypoints separate from the Worker PPG adapter", () => {
    const nodeMain = read("src/lib/db.ts");
    const nodeStore = read("src/lib/store-db.ts");
    expect(nodeMain).toContain("require('@prisma/client')");
    expect(nodeMain).not.toContain("@prisma/adapter-ppg");
    expect(nodeMain).not.toContain("worker-client");
    expect(nodeStore).toContain("@/lib/generated/store-client");
    expect(nodeStore).not.toContain("@prisma/adapter-ppg");
    expect(nodeStore).not.toContain("store-worker-client");
  });

  it("generates independent workerd clients without changing the Node generators", () => {
    const main = read("prisma/schema.prisma");
    const store = read("prisma/store/schema.prisma");
    for (const schema of [main, store]) {
      expect(schema).toContain('provider   = "prisma-client"');
      expect(schema).toContain('engineType = "client"');
      expect(schema).toContain('runtime    = "workerd"');
    }
    expect(main).toContain('output     = "../src/lib/generated/worker-client"');
    expect(store).toContain('output     = "../../src/lib/generated/store-worker-client"');
    expect(main).toContain('provider = "prisma-client-js"');
    expect(store).toContain('provider = "prisma-client-js"');
  });

  it("blocks native PostgreSQL scalar-list fields unsupported by PPG 7.10.1", () => {
    expect(scalarListFields(read("prisma/schema.prisma"))).toEqual([]);
    expect(scalarListFields(read("prisma/store/schema.prisma"))).toEqual([]);
  });

  it("pins tested Prisma and PPG package versions", () => {
    const pkg = JSON.parse(read("package.json"));
    expect(pkg.dependencies["@prisma/client"]).toBe("6.19.3");
    expect(pkg.dependencies.prisma).toBe("6.19.3");
    expect(pkg.dependencies["@prisma/adapter-pg"]).toBe("6.19.3");
    expect(pkg.dependencies["@prisma/adapter-ppg"]).toBe("7.10.1");
    expect(pkg.dependencies["@prisma/ppg"]).toBe("1.0.1");
    expect(pkg.devDependencies["@opennextjs/cloudflare"]).toBe("1.20.14");
    expect(pkg.devDependencies.wrangler).toBe("4.156.0");
    expect(pkg.scripts["build:cloudflare"]).toContain("--noMinify");
    expect(pkg.overrides["minimatch@^3.1.2"]).toBe("3.1.5");
    expect(pkg.overrides["minimatch@^3.1.5"]).toBe("3.1.5");
    expect(pkg.overrides["minimatch@^9.0.1"]).toBe("11.0.4");
    expect(pkg.overrides["minimatch@^10.2.2"]).toBe("11.0.4");
    expect(pkg.overrides["minimatch@^11.0.2"]).toBe("11.0.4");
    expect(pkg.overrides["brace-expansion@^1.1.7"]).toBe("1.1.21");
    expect(pkg.overrides["brace-expansion@^5.0.12"]).toBe("5.0.12");
    expect(pkg.overrides.glob).toBeUndefined();
    const lock = read("bun.lock");
    expect(lock).toContain('"minimatch": ["minimatch@3.1.5"');
    expect(lock).toContain('"@node-minify/core/glob/minimatch": ["minimatch@11.0.4"');
    expect(lock).toContain('"glob/minimatch": ["minimatch@11.0.4"');
    expect(lock).toContain('"brace-expansion": ["brace-expansion@1.1.21"');
    expect(lock).toContain('"@node-minify/core/glob/minimatch/brace-expansion": ["brace-expansion@5.0.12"');
    expect(lock).toContain('"glob/minimatch/brace-expansion": ["brace-expansion@5.0.12"');
  });

  it("runs the Worker-specific TypeScript check in blocking CI", () => {
    const pkg = JSON.parse(read("package.json"));
    expect(pkg.scripts["typecheck:worker"]).toBe("tsc --noEmit -p tsconfig.worker.json");
    expect(read(".github/workflows/ci.yml")).toContain("run: bun run typecheck:worker");
  });
});

describe("Cloudflare Next build descriptor diagnostics", () => {
  it("samples the Next build process tree without changing build semantics", () => {
    const openNext = read("open-next.config.ts");
    const diagnostic = read("scripts/cloudflare-next-build-diagnostics.mjs");
    expect(openNext).toContain("cloudflare-next-build-diagnostics.mjs");
    expect(diagnostic).toContain("/proc");
    expect(diagnostic).toContain("HEAVIX_FD_PEAK");
    expect(diagnostic).toContain("next/dist/bin/next");
    const patcher = read("scripts/patch-next-nft-concurrency.cjs");
    expect(openNext).toContain("patch-next-nft-concurrency.cjs");
    expect(patcher).toContain("next/dist/compiled/@vercel/nft");
    expect(patcher).toContain("fileIOConcurrency:w=1024");
    expect(patcher).toContain("fileIOConcurrency:w=64");
    expect(patcher).toContain("16.4.5");
  });
});
