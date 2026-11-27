import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "src/lib/media-service.ts"),
  "utf8",
);

describe("media sidecar path containment contract", () => {
  it("rejects absolute, empty, backslash and NUL paths", () => {
    expect(source).toContain('typeof relativePath !== "string"');
    expect(source).toContain("relativePath.length === 0");
    expect(source).toContain("path.isAbsolute(relativePath)");
    expect(source).toContain('relativePath.includes("\\\\")');
    expect(source).toContain('relativePath.includes("\\0")');
  });

  it("rejects paths that resolve outside the upload root", () => {
    expect(source).toContain("const root = path.resolve(UPLOAD_ROOT)");
    expect(source).toContain("const resolved = path.resolve(root, relativePath)");
    expect(source).toContain("relative.startsWith(`..${path.sep}`)");
  });

  it("checks real parent paths and rejects symlinked binary or sidecar files", () => {
    expect(source).toContain("await fs.realpath(UPLOAD_ROOT)");
    expect(source).toContain("await fs.realpath(path.dirname(resolved))");
    expect(source).toContain("await fs.lstat(candidate)");
    expect(source).toContain("stat.isSymbolicLink()");
  });

  it("requires both delete and attach to use the guarded resolver", () => {
    expect(source.match(/resolveUploadPath\(asset\.relativePath\)/g)).toHaveLength(2);
    expect(source).toContain("مسیر فایل رسانه نامعتبر است");
  });
});
