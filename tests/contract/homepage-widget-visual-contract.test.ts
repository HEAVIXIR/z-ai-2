import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

describe("homepage widget visual contracts", () => {
  it("reuses the maintained ListingCard with missing-image and missing-price fallbacks", () => {
    const widget = read("src/components/page-renderer/widgets/listing-grid-widget.tsx");
    const card = read("src/components/listings/ListingCard.tsx");
    expect(widget).toMatch(/from ['"]@\/components\/listings\/ListingCard['"]/);
    expect(widget).toMatch(/priceType/);
    expect(widget).toMatch(/image:/);
    expect(card).toMatch(/l\.icon \?\? "🚜"/);
    expect(card).toMatch(/PRICE_TYPE_LABELS\[l\.priceType\]/);
  });

  it.each([
    "src/components/page-renderer/widgets/brand-grid-widget.tsx",
    "src/components/page-renderer/widgets/service-grid-widget.tsx",
    "src/components/page-renderer/widgets/article-list-widget.tsx",
  ])("%s keeps text legible on the dark HEAVIX theme", (file) => {
    const source = read(file);
    expect(source).toMatch(/bg-\[#141414\]/);
    expect(source).toMatch(/text-white/);
    expect(source).not.toMatch(/bg-white/);
  });
});
