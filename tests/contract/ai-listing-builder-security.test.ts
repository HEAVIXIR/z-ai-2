import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("AI listing builder request and output contract", () => {
  it("authenticates and checks CSRF before bounded request parsing and policy work", () => {
    const route = read("src/app/api/ai-listing-builder/route.ts");
    const post = route.slice(route.indexOf("export async function POST"));
    const auth = post.indexOf("getCurrentUser()");
    const csrf = post.indexOf("checkCsrf(req)");
    const parser = post.indexOf("readBoundedJson<unknown>(req, 64 * 1024)");
    const policy = post.indexOf("preflightAIRequest(");
    const provider = post.indexOf("getAIProvider()");
    expect(auth).toBeGreaterThanOrEqual(0);
    expect(csrf).toBeGreaterThan(auth);
    expect(parser).toBeGreaterThan(csrf);
    expect(policy).toBeGreaterThan(parser);
    expect(provider).toBeGreaterThan(policy);
    expect(post).not.toContain("req.json()");
  });

  it("rejects malformed and oversized descriptions before invoking the provider", () => {
    const route = read("src/app/api/ai-listing-builder/route.ts");
    const post = route.slice(route.indexOf("export async function POST"));
    expect(post).toContain("Array.isArray(parsedBody.value)");
    expect(post).toContain("description.length > 20_000");
    expect(post).toContain("status: parsedBody.status");
  });

  it("validates generated output against the shared strict listing schema", () => {
    const route = read("src/app/api/ai-listing-builder/route.ts");
    expect(route).toContain("validateLLMJson(");
    expect(route).toContain("listingBuilderSchema");
    expect(route).toContain("MAX_LISTING_BUILDER_OUTPUT_CHARS");
    expect(route).not.toContain("JSON.parse(jsonStr");
    expect(route).toContain("status: 502");
  });

  it("covers every structured field requested by the listing builder prompt", () => {
    const schema = read("src/lib/ai-gateway-validation.ts");
    for (const field of ["title:", "brand:", "model:", "year:", "hours:", "condition:", "price:", "priceType:", "province:", "city:", "specs:"]) {
      expect(schema).toContain(field);
    }
    expect(schema).toContain("}).strict();");
  });
});
