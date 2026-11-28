import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "src/lib/media-service.ts"),
  "utf8",
);

describe("media sidecar metadata validation contract", () => {
  it("bounds sidecar size and ignores parse failures", () => {
    expect(source).toContain('if (raw.length > 4096) return null');
    expect(source).toContain("const parsed: unknown = JSON.parse(raw)");
    expect(source).toContain("return isValidSidecar(parsed) ? parsed : null");
  });

  it("validates opaque ids and safe filenames/relative paths", () => {
    expect(source).toContain('/^[a-f0-9]{24}$/');
    expect(source).toContain("path.basename(s.filename) !== s.filename");
    expect(source).toContain('s.relativePath.includes("\\\\")');
    expect(source).toContain('s.relativePath.startsWith("/")');
    expect(source).toContain('part === ".."');
  });

  it("requires public URL and path to match the sidecar filename", () => {
    expect(source).toContain("s.url !==");
    expect(source).toContain("/uploads/");
    expect(source).toContain("path.posix.dirname(s.relativePath)");
    expect(source).toContain("s.filename");
  });

  it("accepts only supported extension and matching MIME pairs", () => {
    expect(source).toContain('jpg: "image/jpeg"');
    expect(source).toContain('webp: "image/webp"');
    expect(source).toContain('bmp: "image/bmp"');
    expect(source).toContain("s.mimeType !== formats[s.ext]");
    expect(source).toContain('s.filename.toLowerCase().endsWith(`.${s.ext}`)');
  });

  it("bounds metadata fields and requires positive size and timestamp", () => {
    expect(source).toContain("Number.isSafeInteger(s.size)");
    expect(source).toContain("(s.size as number) <= 0");
    expect(source).toContain("s.uploadedBy.length > 256");
    expect(source).toContain("s.entityId.length > 256");
    expect(source).toContain("s.altText.length > 500");
    expect(source).toContain("Date.parse(s.uploadedAt)");
  });

  it("allows only known entity types for non-null associations", () => {
    expect(source).toContain("ALLOWED_ENTITY_TYPES.has(s.entityType as string)");
  });
});
