import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const wizard = read("src/app/listings/new/page.tsx");
const modelRoute = read("src/app/api/taxonomy/brands/[id]/models/route.ts");
const listingRoute = read("src/app/api/listings/route.ts");
const attributeRoute = read("src/app/api/categories/[id]/attributes/route.ts");

describe("registered model-specific listing forms", () => {
  it("loads active registered models for the selected brand and leaf category", () => {
    expect(wizard).toContain("/api/taxonomy/brands/");
    expect(wizard).toContain("models?categoryId=");
    expect(modelRoute).toContain("modelCategories: { some: { categoryId } }");
  });

  it("passes the selected ProductModel id into the inherited technical form resolver", () => {
    expect(wizard).toContain("modelId={modelId || null}");
    expect(attributeRoute).toContain("db.productModelAttribute.findMany");
    expect(attributeRoute).toContain("where: { modelId: selectedModel.id, categoryId: selected.id }");
  });

  it("persists the selected model id with the listing request", () => {
    expect(wizard).toContain("modelId: modelId || undefined");
    expect(listingRoute).toContain("modelId: body.modelId || null");
  });

  it("rejects a registered model that belongs to another category", () => {
    expect(listingRoute).toContain("model.categoryId === String(body.categoryId)");
    expect(listingRoute).toContain("model.modelCategories.some((link) => link.categoryId === String(body.categoryId))");
    expect(listingRoute).toContain("مدل انتخاب‌شده به دسته‌بندی آگهی متصل نیست.");
  });

  it("keeps free-text model names available without falsely applying a model overlay", () => {
    expect(wizard).toContain('setModelId("")');
    expect(wizard).toContain("اگر مدل در فهرست نیست، نام آن را آزاد وارد کنید");
  });
});
