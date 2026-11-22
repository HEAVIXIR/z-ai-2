/**
 * HEAVIX unified chat-completion provider adapter (server-only).
 * Provider selection is explicit via AI_PROVIDER; missing credentials fail closed.
 * Supports OpenAI-compatible ZAI/OpenAI/Gemini endpoints and native Anthropic Messages.
 * No fallback provider is ever attempted.
 */
export type AIProviderKey = "zai" | "openai" | "gemini" | "anthropic";
export type AIChatMessage = { role: "system" | "user" | "assistant"; content: string };
export type AIChatRequest = {
  model?: string;
  messages: AIChatMessage[];
  max_tokens?: number;
  temperature?: number;
  signal?: AbortSignal;
  [key: string]: unknown;
};
export type AIChatResponse = {
  id?: string;
  model?: string;
  choices: Array<{ index: number; message: { role: "assistant"; content: string }; finish_reason?: string }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
};

type ProviderConfig = { provider: AIProviderKey; baseUrl: string; apiKey: string; model: string };
type Result = { ok: true; provider: AIProviderKey; model: string; client: { chat: { completions: { create: (request: AIChatRequest) => Promise<AIChatResponse> } } } } | { ok: false; provider: AIProviderKey; reason: string };

const PROVIDER_DEFAULTS: Record<AIProviderKey, { baseUrl: string; keyEnv: string; modelEnv: string; defaultModel: string }> = {
  zai: { baseUrl: "", keyEnv: "ZAI_API_KEY", modelEnv: "ZAI_MODEL", defaultModel: "glm-4.6-flash" },
  openai: { baseUrl: "https://api.openai.com/v1", keyEnv: "OPENAI_API_KEY", modelEnv: "OPENAI_MODEL", defaultModel: "gpt-4o-mini" },
  gemini: { baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", keyEnv: "GEMINI_API_KEY", modelEnv: "GEMINI_MODEL", defaultModel: "gemini-2.5-flash" },
  anthropic: { baseUrl: "https://api.anthropic.com", keyEnv: "ANTHROPIC_API_KEY", modelEnv: "ANTHROPIC_MODEL", defaultModel: "claude-3-5-haiku-latest" },
};

function readConfig(): ProviderConfig | { provider: AIProviderKey; error: string } {
  const raw = (process.env.AI_PROVIDER || "zai").trim().toLowerCase();
  if (!(raw in PROVIDER_DEFAULTS)) return { provider: "zai", error: "AI_PROVIDER must be one of zai, openai, gemini, anthropic" };
  const provider = raw as AIProviderKey;
  const defaults = PROVIDER_DEFAULTS[provider];
  const baseUrl = provider === "zai" ? (process.env.ZAI_BASE_URL || "").trim() : (process.env[provider === "openai" ? "OPENAI_BASE_URL" : provider === "gemini" ? "GEMINI_BASE_URL" : "ANTHROPIC_BASE_URL"] || defaults.baseUrl).trim();
  const apiKey = (process.env[defaults.keyEnv] || "").trim();
  const model = (process.env[defaults.modelEnv] || defaults.defaultModel).trim();
  if (!baseUrl) return { provider, error: "Provider endpoint is not configured" };
  if (!apiKey) return { provider, error: defaults.keyEnv + " is not configured" };
  try { new URL(baseUrl); } catch { return { provider, error: "Provider base URL is invalid" }; }
  return { provider, baseUrl: baseUrl.replace(/\/+$/, ""), apiKey, model };
}

function stripPrivateFields(request: AIChatRequest) {
  const { signal: _signal, thinking: _thinking, ...body } = request;
  return body;
}

async function callOpenAICompatible(config: ProviderConfig, request: AIChatRequest): Promise<AIChatResponse> {
  const body = stripPrivateFields(request);
  const model = request.model || config.model;
  const res = await fetch(config.baseUrl + "/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer " + config.apiKey, ...(config.provider === "zai" ? { "X-Z-AI-From": "Z" } : {}) },
    body: JSON.stringify({ ...body, model }),
    signal: request.signal,
  });
  if (!res.ok) throw new Error(config.provider.toUpperCase() + " provider returned HTTP " + res.status);
  return await res.json() as AIChatResponse;
}

async function callAnthropic(config: ProviderConfig, request: AIChatRequest): Promise<AIChatResponse> {
  const messages = request.messages.filter(m => m.role !== "system").map(m => ({ role: m.role, content: m.content }));
  const system = request.messages.filter(m => m.role === "system").map(m => m.content).join("\n");
  const body: Record<string, unknown> = {
    model: request.model || config.model,
    max_tokens: request.max_tokens || 1024,
    messages,
    ...(system ? { system } : {}),
    ...(typeof request.temperature === "number" ? { temperature: request.temperature } : {}),
  };
  const res = await fetch(config.baseUrl + "/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": config.apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify(body),
    signal: request.signal,
  });
  if (!res.ok) throw new Error("ANTHROPIC provider returned HTTP " + res.status);
  const data = await res.json() as { id?: string; model?: string; content?: Array<{ type: string; text?: string }>; stop_reason?: string; usage?: { input_tokens?: number; output_tokens?: number } };
  const content = (data.content || []).filter(x => x.type === "text").map(x => x.text || "").join("");
  return { id: data.id, model: data.model || body.model as string, choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: data.stop_reason }], usage: { prompt_tokens: data.usage?.input_tokens, completion_tokens: data.usage?.output_tokens, total_tokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0) } };
}

export function getAIProvider(): Result {
  const config = readConfig();
  if ("error" in config) return { ok: false, provider: config.provider, reason: config.error };
  const client = {
    chat: {
      completions: {
        create: (request: AIChatRequest) => config.provider === "anthropic" ? callAnthropic(config, request) : callOpenAICompatible(config, request),
      },
    },
  };
  return { ok: true, provider: config.provider, model: config.model, client };
}
