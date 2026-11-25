import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("SEO robots policy preservation", () => {
  it("updates robots only when directives are explicitly supplied", () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), "src/lib/seo-service.ts"), "utf8");
    const start = source.indexOf("if (input.robots !== undefined)");
    const end = source.indexOf("const seo = await upsertSEO", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const guarded = source.slice(start, end);
    expect(guarded).toContain("patch.robotsIndex = robotsIndex");
    expect(guarded).toContain("patch.robotsFollow = robotsFollow");
  });
});
