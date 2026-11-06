import { describe, expect, it, vi } from "vitest";
import { handlePreviewGate, previewGatePaths } from "../../src/lib/preview-gate";

const PASSWORD = "p".repeat(48);
const SIGNING_KEY = "s".repeat(48);
const ENV = {
  HEAVIX_ENV: "preview",
  HEAVIX_PREVIEW_GATE_PASSWORD: PASSWORD,
  HEAVIX_PREVIEW_GATE_SIGNING_KEY: SIGNING_KEY,
};

function navRequest(path = "/", headers: Record<string, string> = {}) {
  return new Request(`https://preview.heavix.invalid${path}`, {
    headers: {
      accept: "text/html",
      "sec-fetch-mode": "navigate",
      ...headers,
    },
  });
}

async function login() {
  const request = new Request(`https://preview.heavix.invalid${previewGatePaths.login}`, {
    method: "POST",
    headers: {
      origin: "https://preview.heavix.invalid",
      "sec-fetch-site": "same-origin",
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ password: PASSWORD }),
  });
  return handlePreviewGate(request, ENV, async () => new Response("must not run"));
}

function cookieFrom(response: Response): string {
  const value = response.headers.get("set-cookie");
  expect(value).toBeTruthy();
  return value!.split(";")[0];
}

describe("Heavix preview outer authentication gate", () => {
  it("fails closed if preview mode or either secret is missing", async () => {
    const downstream = vi.fn(async () => new Response("app"));
    for (const env of [
      {},
      { ...ENV, HEAVIX_ENV: "production" },
      { ...ENV, HEAVIX_PREVIEW_GATE_PASSWORD: undefined },
      { ...ENV, HEAVIX_PREVIEW_GATE_SIGNING_KEY: undefined },
      { ...ENV, HEAVIX_PREVIEW_GATE_PASSWORD: "short" },
    ]) {
      const response = await handlePreviewGate(navRequest(), env, downstream);
      expect(response.status).toBe(503);
      expect(response.headers.get("cache-control")).toContain("no-store");
    }
    expect(downstream).not.toHaveBeenCalled();
  });

  it("serves only the dedicated no-store login page without invoking OpenNext", async () => {
    const downstream = vi.fn(async () => new Response("app"));
    const response = await handlePreviewGate(navRequest(previewGatePaths.login), ENV, downstream);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(response.headers.get("x-robots-tag")).toContain("noindex");
    expect(await response.text()).toContain("پیش‌نمایش خصوصی هویـکس");
    expect(downstream).not.toHaveBeenCalled();
  });

  it("rejects missing and cross-origin login CSRF origins", async () => {
    const missingOrigin = new Request(`https://preview.heavix.invalid${previewGatePaths.login}`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ password: PASSWORD }),
    });
    const foreignOrigin = new Request(`https://preview.heavix.invalid${previewGatePaths.login}`, {
      method: "POST",
      headers: {
        origin: "https://attacker.invalid",
        "sec-fetch-site": "cross-site",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ password: PASSWORD }),
    });
    expect((await handlePreviewGate(missingOrigin, ENV, async () => new Response())).status).toBe(403);
    expect((await handlePreviewGate(foreignOrigin, ENV, async () => new Response())).status).toBe(403);
  });

  it("rejects wrong credentials without disclosing the submitted value", async () => {
    const request = new Request(`https://preview.heavix.invalid${previewGatePaths.login}`, {
      method: "POST",
      headers: {
        origin: "https://preview.heavix.invalid",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ password: "wrong-password" }),
    });
    const response = await handlePreviewGate(request, ENV, async () => new Response("app"));
    expect(response.status).toBe(401);
    expect(await response.text()).not.toContain("wrong-password");
  });

  it("issues a Secure HttpOnly SameSite=Strict host-only cookie and redirects after login", async () => {
    const response = await login();
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://preview.heavix.invalid/");
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("__Host-heavix_preview_session=");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("Max-Age=28800");
  });

  it("forwards a valid session to OpenNext and hardens the returned response", async () => {
    const session = await login();
    const cookie = cookieFrom(session);
    const downstream = vi.fn(async () => new Response("protected app", {
      headers: { "content-type": "text/plain" },
    }));
    const response = await handlePreviewGate(navRequest("/", { cookie }), ENV, downstream);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("protected app");
    expect(downstream).toHaveBeenCalledTimes(1);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("x-robots-tag")).toContain("noindex");
    expect(response.headers.get("vary")).toContain("Cookie");
  });

  it("denies app, API, assets, RSC and every non-navigation request without a session", async () => {
    const downstream = vi.fn(async () => new Response("app"));
    const requests = [
      navRequest("/"),
      navRequest("/api/admin/backup", { accept: "application/json", "sec-fetch-mode": "cors" }),
      navRequest("/_next/static/chunks/app.js", { accept: "*/*", "sec-fetch-mode": "no-cors" }),
      navRequest("/dashboard?_rsc=abc", { accept: "*/*", "sec-fetch-mode": "cors" }),
      new Request("https://preview.heavix.invalid/api/listings", { method: "POST" }),
      new Request("https://preview.heavix.invalid/", { method: "HEAD" }),
    ];
    const responses = await Promise.all(requests.map((request) => handlePreviewGate(request, ENV, downstream)));
    expect(responses[0].status).toBe(303);
    for (const response of responses.slice(1)) expect(response.status).toBe(401);
    expect(downstream).not.toHaveBeenCalled();
  });

  it("rejects tampered session cookies", async () => {
    const session = await login();
    const cookie = cookieFrom(session);
    const tampered = cookie.replace(/.$/, cookie.endsWith("a") ? "b" : "a");
    const downstream = vi.fn(async () => new Response("app"));
    const response = await handlePreviewGate(navRequest("/", { cookie: tampered }), ENV, downstream);
    expect(response.status).toBe(303);
    expect(downstream).not.toHaveBeenCalled();
  });

  it("requires same-origin logout and clears the session cookie", async () => {
    const request = new Request(`https://preview.heavix.invalid${previewGatePaths.logout}`, {
      method: "POST",
      headers: {
        origin: "https://preview.heavix.invalid",
        "sec-fetch-site": "same-origin",
      },
    });
    const response = await handlePreviewGate(request, ENV, async () => new Response("app"));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain(previewGatePaths.login);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});
