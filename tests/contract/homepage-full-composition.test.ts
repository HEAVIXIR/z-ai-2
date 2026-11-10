import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_HOME_SECTIONS } from "@/lib/homepage/sections";

const homepageSource = readFileSync(
  path.join(process.cwd(), "src/app/page.tsx"),
  "utf8",
);

describe("HEAVIX full homepage composition contract", () => {
  it("renders every canonical section through an explicit component switch case", () => {
    for (const section of DEFAULT_HOME_SECTIONS) {
      expect(homepageSource, `missing homepage renderer for ${section.key}`).toContain(
        `case "${section.key}":`,
      );
    }
  });

  it("uses the canonical in-memory section merge and keeps public rendering read-only", () => {
    expect(homepageSource).toContain("mergeHomepageSections(rows)");
    expect(homepageSource).not.toMatch(/db\.homePageSection\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/);
  });

  it("does not contain the historical fabricated province statistic", () => {
    expect(homepageSource).not.toContain("31, label: \"استان تحت پوشش\"");
    expect(homepageSource).not.toContain("31 استان");
  });
});
