import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("MediaUploader endpoint compatibility", () => {
  it("defaults to the existing admin upload compatibility route", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/components/admin/MediaUploader.tsx"),
      "utf8",
    );

    expect(source).toContain('endpoint = "/api/admin/upload"');
    expect(source).toContain("const DEFAULT_MAX = 4 * 1024 * 1024;");
    expect(source).not.toContain('endpoint = "/api/upload"');
  });
});
