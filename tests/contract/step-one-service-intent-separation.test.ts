import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");

describe("Step 1 service and equipment demand separation", () => {
  it("seeds service offer as the seventh legacy transaction key", () => {
    const seed = read("prisma/seed-taxonomy-v11.ts");
    expect(seed).toContain('key: "SERVICE_OFFER"');
    expect(seed).toContain('nameFa: "ارائه خدمت"');
    expect(seed).toContain("HBR §18 (7)");
    expect(seed).toContain('update: t.key === "SERVICE_OFFER" ? { active: true } : {}');
  });

  it("keeps service request separate from WANTED sub-intents", () => {
    const wizard = read("src/app/listings/new/page.tsx");
    expect(wizard).toContain('transactionType === "SERVICE_REQUEST"');
    expect(wizard).not.toContain('{ v: "SERVICE_REQUEST", l: "خدمات" }');
    expect(wizard).toContain('l: "خرید"');
    expect(wizard).toContain('l: "اجاره"');
  });

  it("supports a dedicated service-offer option in the transaction picker", () => {
    const picker = read("src/components/listings/TransactionTypePicker.tsx");
    expect(picker).toContain('"SERVICE_OFFER":"ارائه خدمت"');
    expect(picker).toContain('"SERVICE_OFFER":"🧰"');
  });
});
