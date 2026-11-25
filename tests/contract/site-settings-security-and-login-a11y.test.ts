import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

describe("site settings mutation security and login accessibility", () => {
  it("uses one canonical admin permission for both settings read and write", () => {
    const source = read("src/app/api/admin/site-settings/route.ts");
    expect(source.match(/hasPermission\(sessionUser\.id, 'admin\.settings\.manage'\)/g)).toHaveLength(2);
    expect(source).not.toMatch(/hasPermission\(sessionUser\.id, 'settings\.manage'\)/);
  });

  it("keeps settings GET read-only and returns safe defaults without inserting a row", () => {
    const source = read("src/app/api/admin/site-settings/route.ts");
    const get = source.slice(source.indexOf("export async function GET"), source.indexOf("export async function PUT"));
    expect(get).toContain("findUnique");
    expect(get).not.toMatch(/\.create\(|\.upsert\(|\.update\(/);
    expect(get).toContain("DEFAULT_SETTINGS");
  });

  it("bounds and validates the settings request before database mutation", () => {
    const source = read("src/app/api/admin/site-settings/route.ts");
    const put = source.slice(source.indexOf("export async function PUT"));
    expect(source).toContain("readBoundedJson");
    expect(source).toContain("maxBytes = 32 * 1024");
    expect(put).toContain("typeof body[key] !== 'boolean'");
    expect(put.indexOf("readBoundedJson(req)")).toBeLessThan(put.indexOf("db.$transaction"));
  });

  it("checks CSRF on settings PUT before parsing or mutating the request body", () => {
    const source = read("src/app/api/admin/site-settings/route.ts");
    const put = source.slice(source.indexOf("export async function PUT"));
    expect(source).toContain("import { checkCsrf } from '@/lib/csrf'");
    expect(put).toContain("if (!checkCsrf(req))");
    expect(put.indexOf("if (!checkCsrf(req))")).toBeLessThan(put.indexOf("readBoundedJson(req)"));
  });

  it("writes the settings change and its audit row in one transaction", () => {
    const source = read("src/app/api/admin/site-settings/route.ts");
    const put = source.slice(source.indexOf("export async function PUT"));
    expect(put).toContain("db.$transaction(async (tx)");
    expect(put).toContain("tx.siteSettings.upsert");
    expect(put).toContain("tx.auditLog.create");
  });

  it("gives both login inputs programmatic accessible names", () => {
    const source = read("src/app/login/LoginForm.tsx");
    expect(source).toContain('aria-label="موبایل / ایمیل"');
    expect(source).toContain('aria-label="رمز عبور"');
  });
});
