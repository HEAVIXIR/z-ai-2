import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const source = readFileSync(path.join(process.cwd(), "scripts/patch-next-nft-concurrency.cjs"), "utf8");

describe("Next.js NFT concurrency patch compatibility", () => {
  it("allows the verified Next 16.4.6 build while retaining exact source-token guards", () => {
    expect(source).toContain('"16.4.6"');
    expect(source).toContain('const concurrencyNeedle = "fileIOConcurrency:w=1024"');
    expect(source).toContain('const readFileNeedle = "if(t.readFile)s.readFile=t.readFile;"');
    expect(source).toContain("concurrencyOccurrences === 1 && readFileOccurrences === 1");
    expect(source).toContain("HEAVIX_NFT_PATCH_BLOCKED");
  });
});
