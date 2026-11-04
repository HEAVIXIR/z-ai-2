import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

describe("Cloudflare modern glob dependency overrides", () => {
  it("keeps legacy and modern minimatch APIs on compatible major versions", () => {
    const pkg = JSON.parse(read("package.json"));
    expect(pkg.overrides.minimatch).toBeUndefined();
    expect(pkg.overrides["minimatch@^3.1.2"]).toBe("3.1.5");
    expect(pkg.overrides["minimatch@^3.1.5"]).toBe("3.1.5");
    expect(pkg.overrides["minimatch@^9.0.1"]).toBe("11.0.4");
    expect(pkg.overrides["minimatch@^10.2.2"]).toBe("11.0.4");
    expect(pkg.overrides["minimatch@^11.0.2"]).toBe("11.0.4");
  });

  it("keeps brace-expansion v1 and v5 APIs isolated by declared range", () => {
    const pkg = JSON.parse(read("package.json"));
    expect(pkg.overrides["brace-expansion"]).toBeUndefined();
    expect(pkg.overrides["brace-expansion@^1.1.7"]).toBe("1.1.21");
    expect(pkg.overrides["brace-expansion@^5.0.12"]).toBe("5.0.12");
    expect(pkg.overrides.glob).toBeUndefined();
    expect(pkg.devDependencies["@opennextjs/cloudflare"]).toBe("1.20.14");
    expect(pkg.devDependencies.wrangler).toBe("4.156.0");
    const lock = read("bun.lock");
    expect(lock).toContain('"@node-minify/core/glob/minimatch": ["minimatch@11.0.4"');
    expect(lock).toContain('"glob/minimatch": ["minimatch@11.0.4"');
    expect(lock).toContain('"@node-minify/core/glob/minimatch/brace-expansion": ["brace-expansion@5.0.12"');
    expect(lock).toContain('"glob/minimatch/brace-expansion": ["brace-expansion@5.0.12"');
  });
});

describe("CI Bun and lockfile compatibility", () => {
  it("pins every CI Bun setup to the lockfile writer version", () => {
    const ci = read(".github/workflows/ci.yml");
    const setupCount = (ci.match(/uses: oven-sh\/setup-bun@v2/g) || []).length;
    const pinCount = (ci.match(/bun-version: "1.4.4"/g) || []).length;
    expect(setupCount).toBeGreaterThan(0);
    expect(pinCount).toBe(setupCount);
    expect(ci).not.toContain('bun-version: "1.3.14"');
  });
});

describe("Cloudflare Next file-descriptor guard", () => {
  it("applies the constrained build settings only to Cloudflare", () => {
    const next = read("next.config.ts");
    expect(next).toContain('process.env.HEAVIX_BUILD_TARGET === "cloudflare"');
    expect(next).toContain("cpus: 1");
    expect(next).toContain("config.parallelism = 4");
    const openNext = read("open-next.config.ts");
    expect(openNext).toContain("patch-next-nft-concurrency.cjs");
    const patcher = read("scripts/patch-next-nft-concurrency.cjs");
    expect(patcher).toContain("next/dist/compiled/@vercel/nft");
    expect(patcher).toContain("fileIOConcurrency:w=1024");
    expect(patcher).toContain("fileIOConcurrency:w=16");
    expect(patcher).toContain("16.4.3");
    expect(patcher).toContain("16.4.5");
    const diagnostic = read("scripts/cloudflare-next-build-diagnostics.mjs");
    expect(diagnostic).toContain("HEAVIX_FD_PEAK");
  });
});

describe("Docker Bun toolchain alignment", () => {
  it("uses the same pinned Bun version as CI and the lockfile refresh", () => {
    const dockerfile = read("Dockerfile");
    expect(dockerfile).toContain("FROM oven/bun:1.4.4 AS builder");
    expect(dockerfile).toContain("FROM oven/bun:1.4.4-slim AS runtime");
    expect(dockerfile).not.toContain("oven/bun:1.3.14");
  });
});
