import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

const originalHeavixEnv = process.env.HEAVIX_ENV;
const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;

beforeEach(() => {
  process.env.HEAVIX_ENV = "preview";
  process.env.NEXT_PUBLIC_SITE_URL = "https://heavix-preview.heavixir.workers.dev";
});

afterEach(() => {
  if (originalHeavixEnv === undefined) delete process.env.HEAVIX_ENV;
  else process.env.HEAVIX_ENV = originalHeavixEnv;
  if (originalSiteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
});

describe("Next.js Proxy request boundary", () => {
  it("adds noindex headers to public Preview responses", () => {
    const response = proxy(new NextRequest("https://preview.example.workers.dev/"));

    expect(response.status).toBe(200);
    expect(response.headers.get("X-Robots-Tag")).toBe(
      "noindex, nofollow, noarchive",
    );
  });

  it("returns 401 JSON for anonymous admin API requests", async () => {
    const response = proxy(
      new NextRequest("https://preview.example.workers.dev/api/admin/users"),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("X-Robots-Tag")).toBe(
      "noindex, nofollow, noarchive",
    );
    await expect(response.json()).resolves.toMatchObject({
      error: "Unauthorized",
    });
  });

  it("redirects anonymous admin page requests while preserving the requested URL", () => {
    const response = proxy(
      new NextRequest(
        "https://preview.example.workers.dev/admin/users?tab=roles",
      ),
    );

    expect(response.status).toBe(307);
    const location = response.headers.get("Location");
    expect(location).not.toBeNull();
    const redirect = new URL(location!);
    expect(redirect.pathname).toBe("/login");
    expect(redirect.searchParams.get("redirect")).toBe(
      "/admin/users?tab=roles",
    );
  });

  it("keeps health endpoints public", () => {
    const response = proxy(
      new NextRequest("https://preview.example.workers.dev/api/health"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("X-Robots-Tag")).toBe(
      "noindex, nofollow, noarchive",
    );
  });

  it("allows the canonical session cookie through the optimistic proxy check", () => {
    const response = proxy(
      new NextRequest("https://preview.example.workers.dev/admin/users", {
        headers: { cookie: "heavix-user=synthetic-token" },
      }),
    );

    // Cookie presence is only an optimistic routing check. Route handlers
    // remain responsible for validating the actual session and permissions.
    expect(response.status).toBe(200);
    expect(response.headers.get("X-Robots-Tag")).toBe(
      "noindex, nofollow, noarchive",
    );
  });
});
