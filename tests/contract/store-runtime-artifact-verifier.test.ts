import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const SCRIPT = path.resolve("scripts/verify-store-runtime-artifacts.mjs");
const roots: string[] = [];

function writeFixture(root: string, relativePath: string, content: string) {
  const destination = path.join(root, relativePath);
  mkdirSync(path.dirname(destination), { recursive: true });
  writeFileSync(destination, content);
}

function runVerifier(
  target: "node" | "worker",
  files: Record<string, string>,
) {
  const root = mkdtempSync(path.join(tmpdir(), "heavix-runtime-artifact-"));
  roots.push(root);
  for (const [relativePath, content] of Object.entries(files)) {
    writeFixture(root, relativePath, content);
  }

  const result = spawnSync(process.execPath, [SCRIPT, target, root], {
    encoding: "utf8",
  });
  return {
    exitCode: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    report: JSON.parse(result.stdout) as {
      result: string;
      expectedCompiledSources: string[];
      forbiddenCompiledSources: string[];
      traceMetadata: Array<{ file: string; forbiddenReferences: string[] }>;
      wasmFiles: string[];
    },
  };
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("Store runtime artifact verifier", () => {
  it("does not treat schema strings, source-map content, or NFT traces as executable Worker imports in a Node artifact", () => {
    const result = runVerifier("node", {
      "chunks/node-store-client.js":
        'const schema = "generator output = ../generated/store-client"; export const runtime = "node";',
      "chunks/node-store-client.js.map": JSON.stringify({
        version: 3,
        sources: ["../../../src/lib/generated/store-node-client/client.ts"],
        sourcesContent: [
          'generator client { output = "../src/lib/generated/store-client" runtime = "cloudflare" }',
        ],
      }),
      "chunks/node-main-client.js": "export const runtime = 'node';",
      "chunks/node-main-client.js.map": JSON.stringify({
        version: 3,
        sources: ["../../../src/lib/generated/node-client/client.ts"],
        sourcesContent: [],
      }),
      "app/api/admin/backup/route.js.nft.json": JSON.stringify({
        files: [
          "../../../../src/lib/generated/store-client/client.ts",
          "../../../../src/lib/generated/client/internal/query_compiler_fast_bg.wasm",
        ],
      }),
    });

    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.report.result).toBe("PASS");
    expect(result.report.expectedCompiledSources).toContain(
      "generated/store-node-client",
    );
    expect(result.report.forbiddenCompiledSources).toEqual([]);
    expect(result.report.traceMetadata).toHaveLength(1);
    expect(result.report.wasmFiles).toEqual([]);
  });

  it("rejects a Node artifact when a compiled chunk source map contains the Worker generated client", () => {
    const result = runVerifier("node", {
      "chunks/node-store-client.js": "export const runtime = 'node';",
      "chunks/node-store-client.js.map": JSON.stringify({
        version: 3,
        sources: [
          "../../../src/lib/generated/store-node-client/client.ts",
          "../../../src/lib/generated/node-client/client.ts",
          "../../../src/lib/generated/store-client/client.ts",
        ],
        sourcesContent: [],
      }),
    });

    expect(result.exitCode).toBe(1);
    expect(result.report.result).toBe("FAIL");
    expect(result.report.forbiddenCompiledSources).toContain(
      "generated/store-client",
    );
  });
});
