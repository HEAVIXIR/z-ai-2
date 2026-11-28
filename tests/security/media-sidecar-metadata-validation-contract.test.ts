import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isValidSidecar } from "@/lib/media-service";

const source = readFileSync(
  resolve(process.cwd(), "src/lib/media-service.ts"),
  "utf8",
);

const validSidecar = () => ({
  id: "0123456789abcdef01234567",
  filename: "image.webp",
  url: "/uploads/2026/11/image.webp",
  relativePath: "2026/11/image.webp",
  mimeType: "image/webp",
  ext: "webp",
  size: 1024,
  uploadedBy: null,
  uploadedAt: "2026-11-28T12:30:00.000Z",
  entityType: "Listing",
  entityId: "listing-123",
  altText: "Listing image",
});

describe("media sidecar metadata validation", () => {
  it("accepts a valid legacy-compatible sidecar", () => {
    expect(isValidSidecar(validSidecar())).toBe(true);
  });

  it("rejects non-object values and arrays", () => {
    expect(isValidSidecar(null)).toBe(false);
    expect(isValidSidecar([])).toBe(false);
    expect(isValidSidecar("metadata")).toBe(false);
  });

  it("rejects malformed ids and unsafe filenames", () => {
    expect(isValidSidecar({ ...validSidecar(), id: "not-an-id" })).toBe(false);
    expect(isValidSidecar({ ...validSidecar(), filename: "../image.webp" })).toBe(false);
    expect(isValidSidecar({ ...validSidecar(), filename: "image.webp\\0" })).toBe(false);
  });

  it("rejects absolute, traversal, backslash, and mismatched paths", () => {
    expect(isValidSidecar({ ...validSidecar(), relativePath: "/2026/11/image.webp" })).toBe(false);
    expect(isValidSidecar({ ...validSidecar(), relativePath: "2026/../image.webp" })).toBe(false);
    expect(isValidSidecar({ ...validSidecar(), relativePath: "2026\\\\11\\\\image.webp" })).toBe(false);
    expect(isValidSidecar({ ...validSidecar(), relativePath: "2026/11/other.webp" })).toBe(false);
  });

  it("rejects a public URL that does not match the stored path", () => {
    expect(isValidSidecar({ ...validSidecar(), url: "https://example.test/image.webp" })).toBe(false);
  });

  it("rejects unsupported extensions and MIME mismatches", () => {
    expect(isValidSidecar({ ...validSidecar(), ext: "exe" })).toBe(false);
    expect(isValidSidecar({ ...validSidecar(), mimeType: "image/png" })).toBe(false);
    expect(isValidSidecar({ ...validSidecar(), filename: "image.png" })).toBe(false);
  });

  it("rejects invalid sizes and overlong fields", () => {
    expect(isValidSidecar({ ...validSidecar(), size: 0 })).toBe(false);
    expect(isValidSidecar({ ...validSidecar(), size: -1 })).toBe(false);
    expect(isValidSidecar({ ...validSidecar(), size: Number.MAX_SAFE_INTEGER + 1 })).toBe(false);
    expect(isValidSidecar({ ...validSidecar(), altText: "x".repeat(501) })).toBe(false);
  });

  it("rejects invalid timestamps and entity associations", () => {
    expect(isValidSidecar({ ...validSidecar(), uploadedAt: "yesterday" })).toBe(false);
    expect(isValidSidecar({ ...validSidecar(), entityType: "UnknownEntity" })).toBe(false);
    expect(isValidSidecar({ ...validSidecar(), entityId: "x".repeat(257) })).toBe(false);
  });

  it("retains read-side size limits and fail-closed JSON handling", () => {
    expect(source).toContain('if (raw.length > 4096) return null');
    expect(source).toContain("const parsed: unknown = JSON.parse(raw)");
    expect(source).toContain("return isValidSidecar(parsed) ? parsed : null");
  });
});
