import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("comparison summary free-provider safety", () => {
  it("uses the deterministic local summary without invoking a hosted AI SDK", () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "src/lib/compare-engine.ts"),
      "utf8",
    );
    expect(source).toContain("const summary = buildFallbackSummary(data)");
    expect(source).toContain("explicitly approved, verified-free provider");
    expect(source).not.toContain('import("z-ai-web-dev-sdk")');
    expect(source).not.toContain("ZAI.create()");
  });
});
