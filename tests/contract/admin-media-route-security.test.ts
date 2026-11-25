import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

describe("admin media route security contract", () => {
  it("checks CSRF before parsing an admin media upload", () => {
    const source = read("src/app/api/admin/media/route.ts");
    expect(source.indexOf("checkCsrf(req)")).toBeLessThan(source.indexOf("readBoundedMultipartRequest(req)"));
    expect(source).toContain("reader.read()");
    expect(source).toContain("MAX_UPLOAD_REQUEST_BYTES");
    expect(source).toContain("await boundedRequest.formData()");
    expect(source).not.toContain("err?.message");
  });

  it("checks CSRF before admin media deletion and does not expose raw errors", () => {
    const source = read("src/app/api/admin/media/[id]/route.ts");
    expect(source.indexOf("checkCsrf(req)")).toBeLessThan(source.indexOf("deleteAsset(id"));
    expect(source).toContain('error: "حذف رسانه ناموفق بود."');
    expect(source).not.toContain("err?.message");
  });
});
