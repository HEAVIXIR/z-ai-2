import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "src/lib/media-service.ts"),
  "utf8",
);

describe("media sidecar path containment contract", () => {
  it("rejects absolute, empty, backslash and NUL paths", () => {
    expect(source).toMatch(/typeof relativePath !== "string"/);
    expect(source).toMatch(/relativePath.length === 0/);
    expect(source).toMatch(/path\.isAbsolute\(relativePath\)/);
    expect(source).toMatch(/relativePath\.includes\("\\\\\\\"\)/);
    expect(source).toMatch(/relativePath\.includes\("\\0"\)/);
  });

  it("rejects paths that resolve outside the upload root", () => {
    expect(source).toMatch(/const root = path\.resolve\(UPLOAD_ROOT\)/);
    expect(source).toMatch(/const resolved = path\.resolve\(root, relativePath\)/);
    expect(source).toMatch(/relative\.startsWith\(\`\.\.\$\{path\.sep\}\`\)/);
  });

  it("requires both delete and attach to use the guarded resolver", () => {
    expect(source.match(/resolveUploadPath\(asset\.relativePath\)/g)).toHaveLength(2);
    expect(source).toMatch(/مسیر فایل رسانه نامعتبر است/);
  });
});
