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
  it("uses separate request-scoped PPG factories for App and Store", () => {
    const main = read("src/lib/db.worker.ts");
    const store = read("src/lib/store-db.worker.ts");
    const factories = read("src/lib/prisma-worker-clients.ts");
    const resolver = read("src/lib/prisma-worker-proxy.ts");

    expect(main).toContain("./generated/worker-client/client");
    expect(main).toContain("getCloudflareContext");
    expect(main).toContain("createAppWorkerClientResolver");
    expect(store).toContain("./generated/store-worker-client/client");
    expect(store).toContain("getCloudflareContext");
    expect(store).toContain("createStoreWorkerClientResolver");
    expect(factories).toContain("@prisma/adapter-ppg");
    expect(factories).toContain("DATABASE_URL");
    expect(factories).toContain("STORE_DATABASE_URL");
    expect(factories).toContain('Missing Cloudflare Worker secret: DATABASE_URL');
    expect(factories).toContain('Missing Cloudflare Worker secret: STORE_DATABASE_URL');
    expect(factories).not.toContain("@prisma/adapter-pg");
    expect(resolver).toContain("new WeakMap<object, TClient>()");
    expect(resolver).toContain("requestKey");
    expect(main).not.toMatch(/globalThis\s*\.\s*\w+/);
    expect(store).not.toMatch(/globalThis\s*\.\s*\w+/);
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
    expect(next).toContain("turbopack:");
    expect(next).not.toContain("webpack(config)");
    expect(next).not.toContain("asyncWebAssembly");
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

  it("pins tested Prisma and PPG package versions and the local proof runner", () => {
    const pkg = JSON.parse(read("package.json"));
    expect(pkg.dependencies["@prisma/client"]).toBe("6.19.3");
    expect(pkg.dependencies.prisma).toBe("6.19.3");
    expect(pkg.dependencies["@prisma/adapter-pg"]).toBe("6.19.3");
    expect(pkg.dependencies["@prisma/adapter-ppg"]).toBe("7.10.1");
    expect(pkg.dependencies["@prisma/ppg"]).toBe("1.0.1");
    expect(pkg.devDependencies["@opennextjs/cloudflare"]).toBe("1.20.14");
    expect(pkg.devDependencies.wrangler).toBe("4.156.0");
    expect(pkg.scripts["build:cloudflare"]).toContain("--noMinify");
    expect(pkg.scripts["test:workerd"]).toBe("bun scripts/run-prisma-workerd-proof.mjs");
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

  it("provides a separate fail-closed local Workerd runtime proof", () => {
    const worker = read("tests/workerd/worker.ts");
    const runner = read("scripts/run-prisma-workerd-proof.mjs");
    const workflow = read(".github/workflows/prisma-preview-workerd-proof.yml");
    const ci = read(".github/workflows/ci.yml");
    expect(worker).toContain('SELECT migration_name FROM "_prisma_migrations"');
    expect(worker).toContain("createAppWorkerClientResolver");
    expect(worker).toContain("createStoreWorkerClientResolver");
    expect(runner).toContain('HEAVIX_RUNTIME_PROOF_TARGET');
    expect(runner).toContain("wrangler");
    expect(runner).toContain("concurrent request isolation");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("environment: preview-backup");
    expect(workflow).toContain("refs/heads/recovery/heavix-full-product-integration-2026-11-11");
    expect(workflow).toContain("secrets.MAIN_PREVIEW_DATABASE_URL");
    expect(workflow).toContain("secrets.STORE_PREVIEW_DATABASE_URL");
    expect(workflow).toContain("bun run test:workerd");
    expect(ci).toContain("prisma-workerd-smoke:");
    expect(ci).toContain("HEAVIX_RUNTIME_PROOF_TARGET: SMOKE_ONLY");
    expect(ci).not.toContain("HEAVIX_APP_PREVIEW_PPG_URL");
    expect(ci).not.toContain("HEAVIX_STORE_PREVIEW_PPG_URL");
  });
  it("proves read-only mode per transaction without requiring a read-only Preview database", () => {
    const worker = read("tests/workerd/worker.ts");
    const runner = read("scripts/run-prisma-workerd-proof.mjs");
    const appStart = worker.indexOf('if (path === "/app/transaction")');
    const storeStart = worker.indexOf('if (path === "/store/transaction")');
    const appBlock = worker.slice(appStart, storeStart);
    const storeBlock = worker.slice(storeStart);

    expect(appBlock).toContain("SET TRANSACTION READ ONLY");
    expect(storeBlock).toContain("SET TRANSACTION READ ONLY");
    expect(appBlock.indexOf("await tx.$executeRaw")).toBeLessThan(
      appBlock.indexOf("const settingRows = await tx.$queryRaw"),
    );
    expect(storeBlock.indexOf("await tx.$executeRaw")).toBeLessThan(
      storeBlock.indexOf("const settingRows = await tx.$queryRaw"),
    );
    expect(worker).toContain("without requiring the entire Preview database to be read-only");
    expect(runner).not.toContain("Preview database must be read-only");
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
    expect(diagnostic).toContain('"--turbopack"');
    expect(diagnostic).toContain('process.env.HEAVIX_NEXT_BUNDLER === "webpack" ? "--webpack" : "--turbopack"');
    const artifactProof = read("scripts/cloudflare-worker-artifact-proof.sh");
    expect(artifactProof).toContain("bunx wrangler deploy --dry-run");
    expect(artifactProof).toContain("HEAVIX_PREVIEW_DEPLOY_BLOCKED_PENDING_ARTIFACT_AND_DATABASE_ISOLATION_PROOF");
    expect(artifactProof).toContain("query_compiler_bg.wasm");
    const patcher = read("scripts/patch-next-nft-concurrency.cjs");
    expect(openNext).toContain("patch-next-nft-concurrency.cjs");
    expect(patcher).toContain("next/dist/compiled/@vercel/nft");
    expect(patcher).toContain("fileIOConcurrency:w=1024");
    expect(patcher).toContain("fileIOConcurrency:w=16");
    expect(patcher).toContain("if(t.readFile)s.readFile=t.readFile;");
    expect(patcher).toContain("cachedFileSystem.executeFileIO(p,()=>t.readFile(p))");
    expect(patcher).toContain("customReadFile=semaphore");
    expect(patcher).toContain("16.4.5");
    expect(patcher).toContain("path.resolve(path.dirname(nftPath)");
  });
});
