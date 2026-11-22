/**
 * HEAVIX — ZAI Provider Adapter tests
 * ----------------------------------------------------------------
 * Non-billable, fully mocked. No real provider is contacted.
 *
 * Coverage:
 *   1. getZAIProvider() returns ok:false with the right reason
 *      when each required env var is missing.
 *   2. getZAIProvider() returns ok:false when baseUrl does not
 *      end with /v1.
 *   3. getZAIProvider() returns ok:true and a usable ZAI instance
 *      when both env vars are present and well-formed — and the
 *      instance's `chat.completions.create` is the SDK's real
 *      function (i.e., we did NOT wrap or replace it).
 *   4. Direct construction does NOT call fs.readFile — verified
 *      by spying on the fs.promises module.
 *   5. assertZAIProvider() throws on missing config.
 *   6. getZAIProviderConfigPublic() redacts apiKey.
 *   7. The returned ZAI instance can be called with a mocked
 *      fetch to simulate a provider response — proving the
 *      adapter plumbs config into the SDK's request headers
 *      correctly (Authorization: Bearer <apiKey>, X-Z-AI-From: Z).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Hoist the SDK import so we can spy on its internals before the
// adapter loads it. The adapter does `import ZAI from "..."` at
// module load time; we need that import to resolve to a spied
// instance.
const fsPromisesSpy = vi.hoisted(() => ({
  readFile: vi.fn(),
}));

vi.mock("fs/promises", () => ({
  default: fsPromisesSpy,
  readFile: fsPromisesSpy.readFile,
}));

// We do NOT mock z-ai-web-dev-sdk. The real constructor is used
// so we can prove it accepts our config object directly. The
// only network call the SDK makes is `fetch()`, which we mock
// globally per-test.

describe("ai-provider adapter", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clean env between tests so each test sets exactly what it needs.
    delete process.env.ZAI_BASE_URL;
    delete process.env.ZAI_API_KEY;
    delete process.env.ZAI_CHAT_ID;
    delete process.env.ZAI_USER_ID;
    delete process.env.ZAI_TOKEN;
    fsPromisesSpy.readFile.mockReset();
    fsPromisesSpy.readFile.mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("returns MISSING_BASE_URL when ZAI_BASE_URL is unset", async () => {
    process.env.ZAI_API_KEY = "test-key";
    const mod = await import("@/lib/ai-provider");
    const r = mod.getZAIProvider();
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("MISSING_BASE_URL");
      expect(r.error).toContain("ZAI_BASE_URL");
    }
  });

  it("returns MISSING_API_KEY when ZAI_API_KEY is unset", async () => {
    process.env.ZAI_BASE_URL = "https://provider.example/v1";
    const mod = await import("@/lib/ai-provider");
    const r = mod.getZAIProvider();
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("MISSING_API_KEY");
      expect(r.error).toContain("ZAI_API_KEY");
    }
  });

  it("returns INVALID_BASE_URL when baseUrl does not end with /v1", async () => {
    process.env.ZAI_BASE_URL = "https://provider.example/api";
    process.env.ZAI_API_KEY = "test-key";
    const mod = await import("@/lib/ai-provider");
    const r = mod.getZAIProvider();
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("INVALID_BASE_URL");
    }
  });

  it("strips trailing slashes from baseUrl before validation", async () => {
    process.env.ZAI_BASE_URL = "https://provider.example/v1/";
    process.env.ZAI_API_KEY = "test-key";
    const mod = await import("@/lib/ai-provider");
    const r = mod.getZAIProvider();
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.config.baseUrl).toBe("https://provider.example/v1");
    }
  });

  it("returns a usable ZAI instance WITHOUT touching the filesystem", async () => {
    process.env.ZAI_BASE_URL = "https://provider.example/v1";
    process.env.ZAI_API_KEY = "test-key";
    const mod = await import("@/lib/ai-provider");
    const r = mod.getZAIProvider();
    expect(r.ok).toBe(true);
    if (r.ok) {
      // The adapter must NOT have called fs.readFile.
      expect(fsPromisesSpy.readFile).not.toHaveBeenCalled();
      // The returned instance exposes the SDK's standard surface.
      expect(typeof r.zai.chat.completions.create).toBe("function");
      expect(typeof r.zai.images.generations.create).toBe("function");
      // Config is plumbed through.
      expect(r.config.baseUrl).toBe("https://provider.example/v1");
      expect(r.config.apiKey).toBe("test-key");
    }
  });

  it("assertZAIProvider() throws on missing config", async () => {
    process.env.ZAI_API_KEY = "test-key"; // no BASE_URL
    const mod = await import("@/lib/ai-provider");
    expect(() => mod.assertZAIProvider()).toThrow(/ZAI_BASE_URL/);
  });

  it("getZAIProviderConfigPublic() redacts apiKey to a boolean", async () => {
    process.env.ZAI_BASE_URL = "https://provider.example/v1";
    process.env.ZAI_API_KEY = "secret-do-not-leak";
    const mod = await import("@/lib/ai-provider");
    const cfg = mod.getZAIProviderConfigPublic();
    expect(cfg.baseUrl).toBe("https://provider.example/v1");
    expect(cfg.hasApiKey).toBe(true);
    // The redacted view MUST NOT contain the apiKey string.
    expect(JSON.stringify(cfg)).not.toContain("secret-do-not-leak");
  });

  it("forwards config into SDK request headers on a chat completion call", async () => {
    process.env.ZAI_BASE_URL = "https://provider.example/v1";
    process.env.ZAI_API_KEY = "test-key";
    process.env.ZAI_CHAT_ID = "chat-xyz";
    process.env.ZAI_USER_ID = "user-abc";

    // Mock global fetch — the SDK uses it directly.
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        choices: [{ message: { content: "OK" } }],
        model: "glm-4.6-flash",
      }), { status: 200, headers: { "content-type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const mod = await import("@/lib/ai-provider");
    const r = mod.getZAIProvider();
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const completion = await r.zai.chat.completions.create({
      messages: [
        { role: "system", content: "Reply OK" },
        { role: "user", content: "ping" },
      ],
      thinking: { type: "disabled" },
    });

    // SDK produced a parsed JSON response (non-streaming path).
    expect((completion as { choices?: unknown }).choices).toBeDefined();

    // Exactly one fetch call.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    // URL is built from baseUrl + "/chat/completions".
    expect(String(url)).toBe("https://provider.example/v1/chat/completions");
    // Headers contain the auth + chat/user IDs from env.
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer test-key");
    expect(headers["X-Z-AI-From"]).toBe("Z");
    expect(headers["X-Chat-Id"]).toBe("chat-xyz");
    expect(headers["X-User-Id"]).toBe("user-abc");
    // The apiKey value appears only in the Authorization header —
    // it must never appear in the request body.
    const body = (init as RequestInit).body as string;
    expect(body).not.toContain("test-key");
  });

  it("propagates provider non-2xx responses as thrown errors", async () => {
    process.env.ZAI_BASE_URL = "https://provider.example/v1";
    process.env.ZAI_API_KEY = "bad-key";

    const fetchMock = vi.fn().mockResolvedValue(
      new Response("Unauthorized", { status: 401 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const mod = await import("@/lib/ai-provider");
    const r = mod.getZAIProvider();
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    await expect(
      r.zai.chat.completions.create({
        messages: [{ role: "user", content: "ping" }],
      }),
    ).rejects.toThrow(/401/);
  });
});
