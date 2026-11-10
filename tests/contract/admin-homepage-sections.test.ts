import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_HOME_SECTIONS } from "@/lib/homepage/sections";

const apiSource = readFileSync(
  path.join(process.cwd(), "src/app/api/admin/homepage-sections/route.ts"),
  "utf8",
);
const editorSource = readFileSync(
  path.join(process.cwd(), "src/app/admin/homepage-layout/page.tsx"),
  "utf8",
);

describe("admin homepage section control-plane contract", () => {
  it("exposes canonical virtual defaults to the admin editor", () => {
    expect(apiSource).toContain("mergeHomepageSections(rows)");
    for (const section of DEFAULT_HOME_SECTIONS) {
      expect(editorSource, `missing admin label for ${section.key}`).toContain(
        `"${section.key}"`,
      );
    }
  });

  it("persists virtual defaults by stable key rather than synthetic row id", () => {
    expect(apiSource).toContain("db.homePageSection.upsert({");
    expect(apiSource).toContain("where: { key: data.key }");
    expect(apiSource).not.toContain("where: { id: String(s.id) }");
  });
});
