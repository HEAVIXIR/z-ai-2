import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("taxonomy brand read access and listing request limits", () => {
  it("protects the brand list endpoint with taxonomy.read and preserves the admin data contract", () => {
    const route = source("src/app/api/taxonomy/brands/route.ts");
    const get = route.slice(
      route.indexOf("export async function GET"),
      route.indexOf("/* POST /api/taxonomy/brands"),
    );

    const guard = get.indexOf('requireAdminPermission("taxonomy.read")');
    const query = get.indexOf("db.brand.findMany");
    expect(guard).toBeGreaterThanOrEqual(0);
    expect(query).toBeGreaterThan(guard);
    expect(get).toContain("pageSize");
    expect(get).toContain("Math.min(300");
    expect(get).toContain("return NextResponse.json({ brands: data, data })");
  });

  it("protects full brand detail, including SEO and display settings", () => {
    const route = source("src/app/api/taxonomy/brands/[id]/route.ts");
    const get = route.slice(
      route.indexOf("export async function GET"),
      route.indexOf("/* PATCH /api/taxonomy/brands/[id]"),
    );

    const guard = get.indexOf('requireAdminPermission("taxonomy.read")');
    const detailQuery = get.indexOf("db.brand.findUnique");
    expect(guard).toBeGreaterThanOrEqual(0);
    expect(detailQuery).toBeGreaterThan(guard);
  });

  it("bounds brand creation and rejects invalid JSON shapes before database writes", () => {
    const route = source("src/app/api/taxonomy/brands/route.ts");
    const post = route.slice(route.indexOf("export async function POST"));

    expect(route).toContain('import { readBoundedJson } from "@/lib/read-bounded-json"');
    expect(post).toContain("readBoundedJson<unknown>(req, 128 * 1024)");
    expect(post).toContain("Array.isArray(parsed.value)");
    expect(post.indexOf("checkCsrf(req)")).toBeLessThan(post.indexOf("readBoundedJson<unknown>"));
    expect(post.indexOf("readBoundedJson<unknown>")).toBeLessThan(post.indexOf("db.$transaction"));
    expect(post).not.toContain("req.json()");
  });

  it("bounds brand updates before reading existing records or mutating relations", () => {
    const route = source("src/app/api/taxonomy/brands/[id]/route.ts");
    const patch = route.slice(route.indexOf("export async function PATCH"));

    expect(route).toContain('import { readBoundedJson } from "@/lib/read-bounded-json"');
    expect(patch).toContain("readBoundedJson<unknown>(req, 128 * 1024)");
    expect(patch).toContain("Array.isArray(parsed.value)");
    expect(patch.indexOf("checkCsrf(req)")).toBeLessThan(patch.indexOf("readBoundedJson<unknown>"));
    expect(patch.indexOf("readBoundedJson<unknown>")).toBeLessThan(patch.indexOf("db.brand.findUnique"));
    expect(patch).not.toContain("req.json()");
  });

  it("bounds listing JSON bytes and rejects CSRF before consuming the body", () => {
    const route = source("src/app/api/listings/route.ts");
    const post = route.slice(route.indexOf("export async function POST"));

    const csrf = post.indexOf("checkCsrf(req)");
    const parser = post.indexOf("readBoundedJson<Record<string, any>>");
    expect(route).toContain("const MAX_LISTING_REQUEST_BODY_BYTES = 512 * 1024");
    expect(post).toContain("MAX_LISTING_REQUEST_BODY_BYTES");
    expect(csrf).toBeGreaterThanOrEqual(0);
    expect(parser).toBeGreaterThan(csrf);
    expect(post).not.toContain("req.json()");
  });
});
