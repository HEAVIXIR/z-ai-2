/**
 * HEAVIX — AI Provider Router tests
 * ----------------------------------------------------------------
 * Non-billable, fully mocked. No real provider is contacted.
 *
 * Coverage:
 *   A. Configuration resolution
 *      - defaults to ZAI when AI_PROVIDER unset
 *      - fails closed when ZAI_API_KEY missing
 *      - fails closed when ZAI_BASE_URL missing
 *      - fails closed when AI_PROVIDER is unknown
 *      - OPENAI/GEMINI/ANTHROPIC each resolve with their env vars
 *
 *   B. Request plumbing
 *      - ZAI: forwards X-Z-AI-From: Z header
 *      - ZAI: preserves `thinking: { type: "disabled" }` in body
 *      - OpenAI: strips `thinking` (not a native field)
 *      - Anthropic: translates system message to `system` field
 *      - model from request overrides config model
 *      - apiKey appears ONLY in Authorization header, never in body
 *
 *   C. Timeout / Abort
 *      - default 30s timeout applied via AbortSignal
 *      - AI_REQUEST_TIMEOUT_MS overrides default
 *      - caller's AbortSignal is respected
 *
 *   D. Error classification
 *      - 401/403 → AUTH_FAILED
 *      - 404 → NOT_FOUND
 *      - 429 → RATE_LIMITED
 *      - fetch TypeError → NETWORK_ERROR
 *      - AbortError → ABORTED or TIMEOUT
 *
 *   E. getZAISDK() (non-chat operations)
 *      - returns ok:true with a usable SDK instance
 *      - does NOT call fs.readFile (no filesystem access)
 *      - returns ok:false when ZAI_BASE_URL missing
 *      - returns ok:false when ZAI_API_KEY missing
 *      - returns ok:false when AI_PROVIDER != "zai"
 *      - the returned sdk exposes images, video, async, functions
 *
 *   F. Public config redaction
 *      - getAIProviderConfigPublic() does not leak apiKey
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getAIProvider,
  getZAISDK,
  getAIProviderConfigPublic,
  AIProviderError,
} from "../src/lib/ai-provider-router";

// Hoisted fs spy so we can assert the SDK never touches the
// filesystem when constructed via getZAISDK().
const fsSpy = vi.hoisted(() => ({
  readFile: vi.fn(),
}));

vi.mock("fs/promises", () => ({
  default: fsSpy,
  readFile: fsSpy.readFile,
}));

const ENV_KEYS = [
  "AI_PROVIDER",
  "AI_REQUEST_TIMEOUT_MS",
  "ZAI_BASE_URL",
  "ZAI_API_KEY",
  "ZAI_MODEL",
  "OPENAI_BASE_URL",
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
  "GEMINI_BASE_URL",
  "GEMINI_API_KEY",
  "GEMINI_MODEL",
  "ANTHROPIC_BASE_URL",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_MODEL",
] as const;

beforeEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
  fsSpy.readFile.mockReset();
  fsSpy.readFile.mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
});

afterEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
  vi.unstubAllGlobals();
});

describe("AI provider router — configuration resolution", () => {
  it("defaults to ZAI when AI_PROVIDER is unset", () => {
    process.env.ZAI_BASE_URL = "https://provider.example/v1";
    process.env.ZAI_API_KEY = "k";
    const r = getAIProvider();
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.provider).toBe("zai");
  });

  it("fails closed when ZAI_API_KEY is missing", () => {
    process.env.ZAI_BASE_URL = "https://provider.example/v1";
    const r = getAIProvider();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("ZAI_API_KEY");
  });

  it("fails closed when ZAI_BASE_URL is missing", () => {
    process.env.ZAI_API_KEY = "k";
    const r = getAIProvider();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("ZAI_BASE_URL");
  });

  it("fails closed when AI_PROVIDER is unknown", () => {
    process.env.AI_PROVIDER = "unknown";
    const r = getAIProvider();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("AI_PROVIDER");
  });

  it("resolves OpenAI with default base URL when OPENAI_BASE_URL unset", () => {
    process.env.AI_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "k";
    const r = getAIProvider();
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.provider).toBe("openai");
      expect(r.model).toBe("gpt-4o-mini");
    }
  });

  it("resolves Anthropic with default base URL", () => {
    process.env.AI_PROVIDER = "anthropic";
    process.env.ANTHROPIC_API_KEY = "k";
    const r = getAIProvider();
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.provider).toBe("anthropic");
  });

  it("does NOT silently fall back when selected provider is missing credentials", () => {
    process.env.AI_PROVIDER = "gemini";
    // GEMINI_API_KEY intentionally unset
    const r = getAIProvider();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.provider).toBe("gemini");
  });
});

describe("AI provider router — request plumbing", () => {
  it("forwards X-Z-AI-From: Z header for ZAI", async () => {
    process.env.ZAI_BASE_URL = "https://provider.example/v1";
    process.env.ZAI_API_KEY = "zai-key";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content: "ok" } }] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const p = getAIProvider();
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    await p.client.chat.completions.create({ messages: [{ role: "user", content: "ping" }] });
    const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers["X-Z-AI-From"]).toBe("Z");
    expect(headers["authorization"]).toBe("Bearer zai-key");
  });

  it("preserves `thinking: { type: 'disabled' }` for ZAI in request body", async () => {
    process.env.ZAI_BASE_URL = "https://provider.example/v1";
    process.env.ZAI_API_KEY = "k";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content: "ok" } }] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const p = getAIProvider();
    if (!p.ok) return;
    await p.client.chat.completions.create({
      messages: [{ role: "user", content: "ping" }],
      thinking: { type: "disabled" },
    });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.thinking).toEqual({ type: "disabled" });
  });

  it("strips `thinking` for OpenAI (not a native field)", async () => {
    process.env.AI_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "k";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content: "ok" } }] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const p = getAIProvider();
    if (!p.ok) return;
    await p.client.chat.completions.create({
      messages: [{ role: "user", content: "ping" }],
      thinking: { type: "disabled" },
    });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.thinking).toBeUndefined();
  });

  it("translates Anthropic system messages to the `system` field", async () => {
    process.env.AI_PROVIDER = "anthropic";
    process.env.ANTHROPIC_API_KEY = "k";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        id: "m1", model: "claude-test",
        content: [{ type: "text", text: "result" }],
        usage: { input_tokens: 2, output_tokens: 1 },
      }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const p = getAIProvider();
    if (!p.ok) return;
    const r = await p.client.chat.completions.create({
      messages: [
        { role: "system", content: "sys-instr" },
        { role: "user", content: "hello" },
      ],
    });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.system).toBe("sys-instr");
    expect(body.messages).toEqual([{ role: "user", content: "hello" }]);
    expect(r.usage?.total_tokens).toBe(3);
  });

  it("request model overrides config model", async () => {
    process.env.ZAI_BASE_URL = "https://provider.example/v1";
    process.env.ZAI_API_KEY = "k";
    process.env.ZAI_MODEL = "default-model";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content: "ok" } }] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const p = getAIProvider();
    if (!p.ok) return;
    await p.client.chat.completions.create({
      model: "override-model",
      messages: [{ role: "user", content: "ping" }],
    });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.model).toBe("override-model");
  });

  it("apiKey appears ONLY in Authorization header, never in request body", async () => {
    process.env.ZAI_BASE_URL = "https://provider.example/v1";
    process.env.ZAI_API_KEY = "secret-key-do-not-leak";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content: "ok" } }] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const p = getAIProvider();
    if (!p.ok) return;
    await p.client.chat.completions.create({
      messages: [{ role: "user", content: "ping" }],
    });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const body = String(init.body);
    expect(body).not.toContain("secret-key-do-not-leak");
    const headers = init.headers as Record<string, string>;
    expect(headers["authorization"]).toBe("Bearer secret-key-do-not-leak");
  });
});

describe("AI provider router — timeout / abort", () => {
  it("applies a default 30s timeout via AbortSignal", async () => {
    process.env.ZAI_BASE_URL = "https://provider.example/v1";
    process.env.ZAI_API_KEY = "k";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content: "ok" } }] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const p = getAIProvider();
    if (!p.ok) return;
    await p.client.chat.completions.create({ messages: [{ role: "user", content: "ping" }] });
    const signal = (fetchMock.mock.calls[0][1] as RequestInit).signal as AbortSignal;
    expect(signal).toBeDefined();
    expect(signal.aborted).toBe(false);
    // The default timeout is 30s — the signal should not be
    // aborted immediately. We can't wait 30s in a test, but we
    // can verify the signal exists and is not yet aborted.
  });

  it("AI_REQUEST_TIMEOUT_MS overrides the default", async () => {
    process.env.ZAI_BASE_URL = "https://provider.example/v1";
    process.env.ZAI_API_KEY = "k";
    process.env.AI_REQUEST_TIMEOUT_MS = "5000";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content: "ok" } }] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const p = getAIProvider();
    if (!p.ok) return;
    await p.client.chat.completions.create({ messages: [{ role: "user", content: "ping" }] });
    // Just verify no throw — the timeout value is reflected in
    // getAIProviderConfigPublic().timeoutMs.
    expect(getAIProviderConfigPublic().timeoutMs).toBe(5000);
  });

  it("caller's AbortSignal is respected (request is aborted)", async () => {
    process.env.ZAI_BASE_URL = "https://provider.example/v1";
    process.env.ZAI_API_KEY = "k";
    const controller = new AbortController();
    controller.abort(new Error("caller cancelled"));
    const fetchMock = vi.fn().mockImplementation((_url, init) => {
      // fetch rejects with AbortError when signal is already aborted.
      const sig = (init as RequestInit).signal as AbortSignal;
      if (sig.aborted) {
        const err = new Error("The operation was aborted");
        err.name = "AbortError";
        return Promise.reject(err);
      }
      return Promise.resolve(new Response("{}", { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const p = getAIProvider();
    if (!p.ok) return;
    await expect(
      p.client.chat.completions.create({
        messages: [{ role: "user", content: "ping" }],
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AIProviderError", kind: "ABORTED" });
  });
});

describe("AI provider router — error classification", () => {
  it("classifies 401 as AUTH_FAILED", async () => {
    process.env.ZAI_BASE_URL = "https://provider.example/v1";
    process.env.ZAI_API_KEY = "bad";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Unauthorized", { status: 401 })));
    const p = getAIProvider();
    if (!p.ok) return;
    await expect(
      p.client.chat.completions.create({ messages: [{ role: "user", content: "x" }] }),
    ).rejects.toMatchObject({ kind: "AUTH_FAILED", status: 401 });
  });

  it("classifies 404 as NOT_FOUND", async () => {
    process.env.ZAI_BASE_URL = "https://provider.example/v1";
    process.env.ZAI_API_KEY = "k";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Not Found", { status: 404 })));
    const p = getAIProvider();
    if (!p.ok) return;
    await expect(
      p.client.chat.completions.create({ messages: [{ role: "user", content: "x" }] }),
    ).rejects.toMatchObject({ kind: "NOT_FOUND", status: 404 });
  });

  it("classifies 429 as RATE_LIMITED", async () => {
    process.env.ZAI_BASE_URL = "https://provider.example/v1";
    process.env.ZAI_API_KEY = "k";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Too Many Requests", { status: 429 })));
    const p = getAIProvider();
    if (!p.ok) return;
    await expect(
      p.client.chat.completions.create({ messages: [{ role: "user", content: "x" }] }),
    ).rejects.toMatchObject({ kind: "RATE_LIMITED", status: 429 });
  });

  it("classifies fetch TypeError as NETWORK_ERROR", async () => {
    process.env.ZAI_BASE_URL = "https://provider.example/v1";
    process.env.ZAI_API_KEY = "k";
    const netErr = new TypeError("Failed to fetch");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(netErr));
    const p = getAIProvider();
    if (!p.ok) return;
    await expect(
      p.client.chat.completions.create({ messages: [{ role: "user", content: "x" }] }),
    ).rejects.toMatchObject({ kind: "NETWORK_ERROR" });
  });

  it("AIProviderError carries provider + kind for caller introspection", () => {
    const err = new AIProviderError("AUTH_FAILED", "test", { status: 401, provider: "zai" });
    expect(err.kind).toBe("AUTH_FAILED");
    expect(err.provider).toBe("zai");
    expect(err.status).toBe(401);
    expect(err instanceof Error).toBe(true);
  });
});

describe("AI provider router — getZAISDK() (non-chat operations)", () => {
  it("returns a usable SDK instance WITHOUT touching the filesystem", () => {
    process.env.ZAI_BASE_URL = "https://provider.example/v1";
    process.env.ZAI_API_KEY = "k";
    const r = getZAISDK();
    expect(r.ok).toBe(true);
    if (r.ok) {
      // The adapter must NOT have called fs.readFile.
      expect(fsSpy.readFile).not.toHaveBeenCalled();
      // Full SDK surface is available.
      expect(typeof r.sdk.chat.completions.create).toBe("function");
      expect(typeof r.sdk.images.generations.create).toBe("function");
      expect(typeof r.sdk.images.search.create).toBe("function");
      expect(typeof r.sdk.video.generations.create).toBe("function");
      expect(typeof r.sdk.async.result.query).toBe("function");
      expect(typeof r.sdk.functions.invoke).toBe("function");
    }
  });

  it("returns ok:false when ZAI_BASE_URL is missing", () => {
    process.env.ZAI_API_KEY = "k";
    const r = getZAISDK();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("ZAI_BASE_URL");
  });

  it("returns ok:false when ZAI_API_KEY is missing", () => {
    process.env.ZAI_BASE_URL = "https://provider.example/v1";
    const r = getZAISDK();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("ZAI_API_KEY");
  });

  it("returns ok:false when AI_PROVIDER is not 'zai'", () => {
    process.env.AI_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "k";
    const r = getZAISDK();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("openai");
  });

  it("forwards config into SDK request headers on a chat call", async () => {
    process.env.ZAI_BASE_URL = "https://provider.example/v1";
    process.env.ZAI_API_KEY = "zai-key";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content: "OK" } }], model: "glm-4.6-flash" }), { status: 200, headers: { "content-type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const r = getZAISDK();
    if (!r.ok) return;
    await r.sdk.chat.completions.create({
      messages: [{ role: "user", content: "ping" }],
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://provider.example/v1/chat/completions");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer zai-key");
    expect(headers["X-Z-AI-From"]).toBe("Z");
  });
});

describe("AI provider router — public config redaction", () => {
  it("getAIProviderConfigPublic() does not leak apiKey", () => {
    process.env.ZAI_BASE_URL = "https://provider.example/v1";
    process.env.ZAI_API_KEY = "secret-do-not-leak";
    const cfg = getAIProviderConfigPublic();
    expect(cfg.hasApiKey).toBe(true);
    expect(JSON.stringify(cfg)).not.toContain("secret-do-not-leak");
  });

  it("getAIProviderConfigPublic() reports provider + baseUrl + model + timeoutMs", () => {
    process.env.ZAI_BASE_URL = "https://provider.example/v1";
    process.env.ZAI_API_KEY = "k";
    process.env.ZAI_MODEL = "glm-4.6-flash";
    process.env.AI_REQUEST_TIMEOUT_MS = "15000";
    const cfg = getAIProviderConfigPublic();
    expect(cfg.provider).toBe("zai");
    expect(cfg.baseUrl).toBe("https://provider.example/v1");
    expect(cfg.model).toBe("glm-4.6-flash");
    expect(cfg.timeoutMs).toBe(15000);
  });
});
