/**
 * HEAVIX — E2E Smoke Tests (Track E / T4)
 * ------------------------------------------------------------
 * Lightweight file-content smoke checks that verify the build &
 * test infrastructure is wired correctly WITHOUT actually
 * running `tsc` / `eslint` (which would make the E2E suite slow
 * and flaky). The real type-check + lint run is part of the CI
 * pipeline; here we assert that the configuration that drives them
 * is present and consistent.
 *
 * These run under `bun run test:e2e`
 * (config: vitest.e2e.config.ts → includes tests/e2e/**).
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "..", "..");

function read(p: string): string {
  return fs.readFileSync(p, "utf8");
}

function exists(p: string): boolean {
  return fs.existsSync(p);
}

describe("Smoke — TypeScript build config", () => {
  it("tsconfig.json exists at project root", () => {
    expect(exists(path.join(ROOT, "tsconfig.json"))).toBe(true);
  });

  it("tsconfig has strict mode enabled", () => {
    const ts = read(path.join(ROOT, "tsconfig.json"));
    expect(ts).toMatch(/"strict"\s*:\s*true/);
  });

  it("tsconfig has noEmit enabled (type-check only)", () => {
    const ts = read(path.join(ROOT, "tsconfig.json"));
    expect(ts).toMatch(/"noEmit"\s*:\s*true/);
  });

  it("tsconfig maps the @/* path alias to ./src/*", () => {
    const ts = read(path.join(ROOT, "tsconfig.json"));
    expect(ts).toMatch(/"@\/\*"/);
    expect(ts).toMatch(/\.\/src\/\*/);
  });

  it("package.json declares a `typecheck` (= tsc --noEmit) script", () => {
    const pkg = read(path.join(ROOT, "package.json"));
    expect(pkg).toMatch(/"typecheck"\s*:\s*"tsc --noEmit"/);
  });
});

describe("Smoke — ESLint config", () => {
  it("eslint.config.mjs exists at project root", () => {
    expect(exists(path.join(ROOT, "eslint.config.mjs"))).toBe(true);
  });

  it("eslint config extends next core-web-vitals + typescript", () => {
    const es = read(path.join(ROOT, "eslint.config.mjs"));
    expect(es).toMatch(/eslint-config-next\/core-web-vitals/);
    expect(es).toMatch(/eslint-config-next\/typescript/);
  });

  it("package.json declares a `lint` script", () => {
    const pkg = read(path.join(ROOT, "package.json"));
    expect(pkg).toMatch(/"lint"\s*:\s*"eslint \."/);
  });
});

describe("Smoke — Contract test suite is present", () => {
  // The four contract / public-UI test files that the verify step
  // (bunx vitest run …) executes. Their presence is a precondition
  // for the track's acceptance criteria ("must be 99/99").
  const contractTests = [
    "tests/phase-store-2c-contracts.test.ts",
    "tests/phase-store-2d-public-ui.test.ts",
    "tests/phase-marketplace-2b-contracts.test.ts",
    "tests/phase-c1-navigation-contract.test.ts",
  ];

  it.each(contractTests)("contract test file exists: %s", (rel) => {
    expect(exists(path.join(ROOT, rel))).toBe(true);
  });

  it("each contract test file actually contains at least one `it(...)` block", () => {
    for (const rel of contractTests) {
      const content = read(path.join(ROOT, rel));
      expect(
        content,
        `${rel} should contain at least one vitest it() block`,
      ).toMatch(/\bit\s*\(/);
    }
  });
});

describe("Smoke — E2E + security vitest configs exist", () => {
  it("vitest.e2e.config.ts exists and targets tests/e2e/**", () => {
    const cfgPath = path.join(ROOT, "vitest.e2e.config.ts");
    expect(exists(cfgPath)).toBe(true);
    expect(read(cfgPath)).toMatch(/tests\/e2e\/\*\*\/\*\.test\.ts/);
  });

  it("vitest.security.config.ts exists and targets tests/security/**", () => {
    const cfgPath = path.join(ROOT, "vitest.security.config.ts");
    expect(exists(cfgPath)).toBe(true);
    expect(read(cfgPath)).toMatch(/tests\/security\/\*\*\/\*\.test\.ts/);
  });

  it("package.json wires test:e2e + test:security scripts", () => {
    const pkg = read(path.join(ROOT, "package.json"));
    expect(pkg).toMatch(/"test:e2e"\s*:\s*"vitest run --config vitest\.e2e\.config\.ts"/);
    expect(pkg).toMatch(
      /"test:security"\s*:\s*"vitest run --config vitest\.security\.config\.ts"/,
    );
  });
});
