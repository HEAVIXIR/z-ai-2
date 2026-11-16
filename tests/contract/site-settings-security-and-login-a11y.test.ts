import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

describe("site settings mutation security and login accessibility", () => {
  it("uses one canonical admin permission for both settings read and write", () => {
    const source = read("src/app/api/admin/site-settings/route.ts");
    expect(source.match(/hasPermission\(sessionUser\.id, "admin\.settings\.manage"\)/g)).toHaveLength(2);
    expect(source).not.toMatch(/hasPermission\(sessionUser\.id, "settings\.manage"\)/);
  });

  it("checks CSRF on settings PUT before parsing or mutating the request body", () => {
    const source = read("src/app/api/admin/site-settings/route.ts");
    const put = source.slice(source.indexOf("export async function PUT"));
    expect(put).toContain('import { checkCsrf } from "@/lib/csrf"');
    expect(put).toContain("if (!checkCsrf(req))");
    expect(put.indexOf("if (!checkCsrf(req))")).toBeLessThan(put.indexOf("req.json()"));
  });

  it("gives both login inputs programmatic accessible names", () => {
    const source = read("src/app/login/LoginForm.tsx");
    expect(source).toContain('aria-label="موبایل / ایمیل"');
    expect(source).toContain('aria-label="رمز عبور"');
  });
});
