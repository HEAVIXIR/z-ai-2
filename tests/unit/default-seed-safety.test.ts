import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "prisma/seed.ts"), "utf8");

describe("legacy demo seed safety contract", () => {
  it("requires explicit apply and the Preview environment before writes", () => {
    expect(source).toContain('process.argv.includes("--apply")');
    expect(source).toContain('process.env.HEAVIX_ENV !== "preview"');
    expect(source.indexOf('process.argv.includes("--apply")')).toBeLessThan(
      source.indexOf("await db.brand.upsert"),
    );
  });

  it("never deletes existing listings or listing images", () => {
    expect(source).not.toMatch(/db\.listing(?:Image)?\.deleteMany/);
  });

  it("skips sample listings whose deterministic slug already exists", () => {
    expect(source).toContain("db.listing.findUnique");
    expect(source).toContain("if (existingListing)");
  });

  it("does not overwrite existing brand or category customizations", () => {
    expect(source).toContain("// Preserve administrator edits on existing brands");
    expect(source).toContain("// Do not reset a category's hierarchy, layer, visibility, or admin state.");
  });

  it("does not make schema push silently accept data loss", () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(process.cwd(), "package.json"), "utf8"),
    ) as { scripts?: Record<string, string> };
    const pushScripts = Object.entries(packageJson.scripts ?? {})
      .filter(([name]) => name.includes("db:push"))
      .map(([, command]) => command);
    expect(pushScripts.length).toBeGreaterThan(0);
    expect(pushScripts.join("\n")).not.toContain("--accept-data-loss");
  });
});
