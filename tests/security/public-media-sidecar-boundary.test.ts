import { describe, expect, it } from "vitest";
import type { NextRequest } from "next/server";
import { middleware } from "@/middleware";

function request(url: string): NextRequest {
  return {
    nextUrl: new URL(url),
    cookies: { get: () => undefined },
  } as unknown as NextRequest;
}

describe("public media sidecar privacy boundary", () => {
  it.each([
    "https://heavix.ir/uploads/2026/11/asset.jpg.meta.json",
    "https://heavix.ir/uploads/asset%2Emeta.json",
    "https://heavix.ir/uploads/nested/ASSET.META.JSON",
  ])("returns a non-cacheable 404 for sidecar URL %s", (url) => {
    const response = middleware(request(url));

    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("does not block public image assets", () => {
    const response = middleware(
      request("https://heavix.ir/uploads/2026/11/asset.jpg"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("does not treat metadata-like names outside /uploads as media sidecars", () => {
    const response = middleware(
      request("https://heavix.ir/docs/example.meta.json"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});
