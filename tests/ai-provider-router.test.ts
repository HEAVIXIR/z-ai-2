import { afterEach, describe, expect, it, vi } from "vitest";
import { getAIProvider } from "../src/lib/ai-provider-router";

const keys = ["AI_PROVIDER", "ZAI_BASE_URL", "ZAI_API_KEY", "ZAI_MODEL", "OPENAI_BASE_URL", "OPENAI_API_KEY", "OPENAI_MODEL", "GEMINI_BASE_URL", "GEMINI_API_KEY", "GEMINI_MODEL", "ANTHROPIC_BASE_URL", "ANTHROPIC_API_KEY", "ANTHROPIC_MODEL"] as const;
afterEach(() => { for (const key of keys) delete process.env[key]; vi.unstubAllGlobals(); });

describe("AI provider router", () => {
  it("defaults to ZAI and fails closed when credentials are absent", () => {
    const result = getAIProvider();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.provider).toBe("zai");
  });

  it("routes OpenAI-compatible providers using configured model and server key", async () => {
    process.env.AI_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "unit-test-key";
    process.env.OPENAI_MODEL = "test-model";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content: "hello" } }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const provider = getAIProvider();
    expect(provider.ok).toBe(true);
    if (!provider.ok) return;
    const response = await provider.client.chat.completions.create({ messages: [{ role: "user", content: "test" }] });
    expect(response.choices[0].message.content).toBe("hello");
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.openai.com/v1/chat/completions");
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer unit-test-key");
    expect(JSON.parse(String(init.body)).model).toBe("test-model");
  });

  it("translates Anthropic Messages responses into the shared completion shape", async () => {
    process.env.AI_PROVIDER = "anthropic";
    process.env.ANTHROPIC_API_KEY = "unit-test-key";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "msg-test", model: "claude-test", content: [{ type: "text", text: "result" }], usage: { input_tokens: 2, output_tokens: 1 } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const provider = getAIProvider();
    expect(provider.ok).toBe(true);
    if (!provider.ok) return;
    const response = await provider.client.chat.completions.create({ messages: [{ role: "system", content: "sys" }, { role: "user", content: "hello" }] });
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.anthropic.com/v1/messages");
    expect(response.choices[0].message.content).toBe("result");
    expect(response.usage?.total_tokens).toBe(3);
  });

  it("does not silently fall back when the selected provider is missing", () => {
    process.env.AI_PROVIDER = "gemini";
    process.env.GEMINI_API_KEY = "";
    const result = getAIProvider();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.provider).toBe("gemini");
  });
});
