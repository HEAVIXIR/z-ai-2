import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("SEO robots policy preservation", () => {
  it("does not reset an existing noindex policy when an editor changes unrelated SEO fields", () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "src/lib/seo-service.ts"),
      "utf8",
    );
    expect(source).toContain('if (input.robots !== undefined)');
    expect(source).toContain("patch.robotsIndex = robotsIndex");
    expect(source).toContain("patch.robotsFollow = robotsFollow");
    expect(source).not.toMatch(/const \{ robotsIndex, robotsFollow \} = parseRobots\(input\.robots\);[\s\S]{0,500}patch\.robotsIndex = robotsIndex;[\s\S]{0,100}patch\.robotsFollow = robotsFollow;[\s\S]{0,200}const seo = await upsertSEO/);
  });
});
