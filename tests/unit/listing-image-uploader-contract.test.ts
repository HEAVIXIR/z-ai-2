import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Listing image upload contract", () => {
  const read = (relativePath: string) =>
    readFileSync(path.join(process.cwd(), relativePath), "utf8");

  it("uploads real files through the permission-checked media endpoint", () => {
    const source = read("src/components/listings/ListingImageUploader.tsx");
    expect(source).toContain('fetch("/api/media/staging"');
    expect(source).toContain('body.append("file", prepared.file)');
    expect(source).toContain("prepareImageForUpload(source)");
    expect(source).toContain("result?.url");
    expect(source).not.toContain("placeholder-");
  });

  it("renders actual uploaded image URLs and supports removal", () => {
    const source = read("src/components/listings/ListingImageUploader.tsx");
    expect(source).toContain("<img");
    expect(source).toContain("onChange(images.filter");
    expect(source).toContain("maxImages = 10");
  });

  it("uses the real uploader in the listing wizard instead of placeholder URLs", () => {
    const source = read("src/app/listings/new/page.tsx");
    expect(source).toContain("ListingImageUploader images={images} onChange={setImages}");
    expect(source).not.toContain("placeholder-${Date.now()}");
  });
});
