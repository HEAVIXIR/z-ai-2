/**
 * HEAVIX unified AI provider adapter (server-only).
 * ----------------------------------------------------------------
 * Central entry point for ALL AI calls in HEAVIX. No call site
 * should import `z-ai-web-dev-sdk` directly — they must go
 * through `getAIProvider()` (chat completions) or `getZAISDK()`
 * (ZAI-specific non-chat operations: images, video, async,
 * functions). This keeps provider selection, credentials, and
 * runtime compatibility in ONE place.
 *
 * Provider selection is explicit via AI_PROVIDER (default "zai").
 * Missing credentials fail closed — no silent fallback.
 *
 * Supports:
 *   - ZAI (default): OpenAI-compatible chat + native images/video/async/functions
 *   - OpenAI: OpenAI-compatible chat
 *   - Gemini: OpenAI-compatible chat
 *   - Anthropic: native Messages API
 *
 * No paid-provider fallback is ever attempted. A failed provider
 * returns a structured error; the caller decides what to do
 * (usually: return AI_UNAVAILABLE to the user).
 *
 * Cloudflare Workers / OpenNext compatibility:
 *   - The ZAI SDK's default entry point (`ZAI.create()`) reads
 *     `.z-ai-config` from disk, which does not exist on Workers.
 *   - `getZAISDK()` bypasses `loadConfig()` by calling
 *     `new ZAI(config)` directly with env-based config.
 *   - The SDK's `node:fs/path/os` imports are polyfilled by the
 *     `nodejs_compat` compatibility flag in wrangler.jsonc.
 *   - No filesystem access happens at runtime.
 */

import ZAI from "z-ai-web-dev-sdk";

// Re-export the SDK type so call sites can reference it without
// importing the SDK directly.
export type ZAISDK = {
  [key: string]: any;
  chat: { completions: { create: (request: any) => Promise<any> } };
  images: { generations: { create: (request: any) => Promise<any> } };
  video: { generations: { create: (request: any) => Promise<any> } };
  async: { result: { query: (taskId: string) => Promise<any> } };
  functions: { [key: string]: any };
};

export type AIProviderKey = "zai" | "openai" | "gemini" | "anthropic";
export type AIChatMessage = { role: "system" | "user" | "assistant"; content: string };
export type AIChatRequest = {
  model?: string;
  messages: AIChatMessage[];
  max_tokens?: number;
  temperature?: number;
  signal?: AbortSignal;
  /**
   * ZAI native field. When provider is "zai", this is forwarded
   * to the provider as-is. When provider is OpenAI/Gemini, this
   * is stripped (those providers do not support it). When
   * provider is Anthropic, this is ignored (Anthropic has its
   * own thinking config with a different shape).
   */
  thinking?: { type: "enabled" | "disabled" };
  [key: string]: unknown;
};
export type AIChatResponse = {
  id?: string;
  model?: string;
  choices: Array<{ index: number; message: { role: "assistant"; content: string }; finish_reason?: string }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
};

/**
 * Structured error classification surfaced to callers so they
 * can map provider failures to user-facing messages without
 * parsing error strings.
 */
export type AIProviderErrorKind =
  | "NOT_CONFIGURED"
  | "INVALID_ENDPOINT"
  | "AUTH_FAILED"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "ABORTED"
  | "PROVIDER_ERROR"
  | "NETWORK_ERROR";

export class AIProviderError extends Error {
  readonly kind: AIProviderErrorKind;
  readonly status?: number;
  readonly provider: AIProviderKey;
  constructor(kind: AIProviderErrorKind, message: string, opts: { status?: number; provider: AIProviderKey } & ErrorOptions = { provider: "zai" }) {
    super(message, opts);
    this.name = "AIProviderError";
    this.kind = kind;
    this.status = opts.status;
    this.provider = opts.provider;
  }
}

type ProviderConfig = { provider: AIProviderKey; baseUrl: string; apiKey: string; model: string };
type Result =
  | { ok: true; provider: AIProviderKey; model: string; client: { chat: { completions: { create: (request: AIChatRequest) => Promise<AIChatResponse> } } } }
  | { ok: false; provider: AIProviderKey; reason: string };

const PROVIDER_DEFAULTS: Record<AIProviderKey, { baseUrl: string; keyEnv: string; modelEnv: string; defaultModel: string }> = {
  zai: { baseUrl: "", keyEnv: "ZAI_API_KEY", modelEnv: "ZAI_MODEL", defaultModel: "glm-4.6-flash" },
  openai: { baseUrl: "https://api.openai.com/v1", keyEnv: "OPENAI_API_KEY", modelEnv: "OPENAI_MODEL", defaultModel: "gpt-4o-mini" },
  gemini: { baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", keyEnv: "GEMINI_API_KEY", modelEnv: "GEMINI_MODEL", defaultModel: "gemini-2.5-flash" },
  anthropic: { baseUrl: "https://api.anthropic.com", keyEnv: "ANTHROPIC_API_KEY", modelEnv: "ANTHROPIC_MODEL", defaultModel: "claude-3-5-haiku-latest" },
};

/**
 * Default request timeout (ms). Can be overridden via
 * AI_REQUEST_TIMEOUT_MS. Applied via AbortSignal.timeout() when
 * the caller does not pass its own AbortSignal. Network waits
 * (DNS, TCP, TLS, response body) DO count against Workers wall
 * time but NOT against CPU time — so a 30s timeout is safe on
 * the Free tier.
 */
const DEFAULT_TIMEOUT_MS = 30_000;

function readEnv(name: string): string | undefined {
  if (typeof process === "undefined" || !process.env) return undefined;
  const v = process.env[name];
  return v && v.trim().length > 0 ? v.trim() : undefined;
}

function readConfig(): ProviderConfig | { provider: AIProviderKey; error: string } {
  const raw = (readEnv("AI_PROVIDER") || "zai")!.toLowerCase();
  if (!(raw in PROVIDER_DEFAULTS)) return { provider: "zai", error: "AI_PROVIDER must be one of zai, openai, gemini, anthropic" };
  const provider = raw as AIProviderKey;
  const defaults = PROVIDER_DEFAULTS[provider];
  const baseUrlEnvName =
    provider === "zai" ? "ZAI_BASE_URL" :
    provider === "openai" ? "OPENAI_BASE_URL" :
    provider === "gemini" ? "GEMINI_BASE_URL" :
    "ANTHROPIC_BASE_URL";
  const baseUrl = readEnv(baseUrlEnvName) || defaults.baseUrl;
  const apiKey = readEnv(defaults.keyEnv) || "";
  const model = readEnv(defaults.modelEnv) || defaults.defaultModel;
  if (!baseUrl) return { provider, error: `${baseUrlEnvName} is not configured` };
  if (!apiKey) return { provider, error: `${defaults.keyEnv} is not configured` };
  try { new URL(baseUrl); } catch { return { provider, error: `${baseUrlEnvName} is invalid: ${baseUrl}` }; }
  return { provider, baseUrl: baseUrl.replace(/\/+$/, ""), apiKey, model };
}

/**
 * Returns the configured request timeout in ms. Reads
 * AI_REQUEST_TIMEOUT_MS at call time so tests can change it.
 */
function getTimeoutMs(): number {
  const v = readEnv("AI_REQUEST_TIMEOUT_MS");
  if (!v) return DEFAULT_TIMEOUT_MS;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TIMEOUT_MS;
}

/**
 * Compose the caller's AbortSignal (if any) with a timeout
 * signal. If the caller passed a signal, both signals race —
 * whichever fires first aborts the fetch. If the caller did not
 * pass a signal, only the timeout applies.
 *
 * AbortSignal.any() is available in Node 20+, Workers, and
 * modern browsers. We guard with a feature check for older
 * runtimes.
 */
function composeSignal(callerSignal?: AbortSignal): AbortSignal | undefined {
  const timeoutMs = getTimeoutMs();
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  if (!callerSignal) return timeoutSignal;
  // AbortSignal.any exists in Node 20+ and modern Workers.
  if (typeof (AbortSignal as unknown as { any?: (signals: AbortSignal[]) => AbortSignal }).any === "function") {
    return (AbortSignal as unknown as { any: (signals: AbortSignal[]) => AbortSignal }).any([callerSignal, timeoutSignal]);
  }
  // Fallback: race manually via a controller.
  const controller = new AbortController();
  const onAbort = (reason: unknown) => controller.abort(reason);
  callerSignal.addEventListener("abort", () => onAbort(callerSignal.reason), { once: true });
  timeoutSignal.addEventListener("abort", () => onAbort(timeoutSignal.reason), { once: true });
  return controller.signal;
}

/**
 * Classify a fetch failure into a structured AIProviderError.
 * Inspects status code for HTTP errors, the error name for
 * abort/timeout, and the message for network issues.
 */
function classifyError(err: unknown, provider: AIProviderKey): AIProviderError {
  if (err instanceof AIProviderError) return err;
  const msg = err instanceof Error ? err.message : String(err);
  const name = err instanceof Error ? err.name : "";

  // Abort/timeout
  if (name === "AbortError" || /aborted/i.test(msg)) {
    // Distinguish timeout from caller-initiated abort by
    // checking the message. AbortSignal.timeout() sets the
    // reason to "The operation was aborted due to timeout" or
    // similar in Node 20+.
    const isTimeout = /timeout/i.test(msg) || (err instanceof Error && /timeout/i.test(String((err as Error & { reason?: unknown }).reason)));
    return new AIProviderError(
      isTimeout ? "TIMEOUT" : "ABORTED",
      msg,
      { provider },
    );
  }

  // Network errors (fetch threw before getting a response)
  if (name === "TypeError" && /fetch|network|failed to fetch/i.test(msg)) {
    return new AIProviderError("NETWORK_ERROR", msg, { provider });
  }

  // HTTP status errors — our callers throw Error with a status
  // embedded in the message. We also accept a `status` property.
  const status = (err as { status?: number })?.status ??
    (function () {
      const m = msg.match(/HTTP (\d{3})/);
      return m ? parseInt(m[1], 10) : undefined;
    })();
  if (status) {
    if (status === 401 || status === 403) return new AIProviderError("AUTH_FAILED", msg, { status, provider });
    if (status === 404) return new AIProviderError("NOT_FOUND", msg, { status, provider });
    if (status === 429) return new AIProviderError("RATE_LIMITED", msg, { status, provider });
    return new AIProviderError("PROVIDER_ERROR", msg, { status, provider });
  }

  return new AIProviderError("PROVIDER_ERROR", msg, { provider });
}

/**
 * Strip fields that should NOT be forwarded to OpenAI-compatible
 * providers. `signal` is consumed by fetch, never sent in the
 * body. `thinking` is ZAI-specific — preserved for ZAI, stripped
 * for OpenAI/Gemini/Anthropic.
 */
function stripPrivateFields(request: AIChatRequest, provider: AIProviderKey) {
  const { signal: _signal, thinking: _thinking, ...body } = request;
  // Preserve `thinking` for ZAI (native field).
  if (provider === "zai" && request.thinking) {
    return { ...body, thinking: request.thinking };
  }
  return body;
}

async function callOpenAICompatible(config: ProviderConfig, request: AIChatRequest): Promise<AIChatResponse> {
  const body = stripPrivateFields(request, config.provider);
  const model = request.model || config.model;
  const signal = composeSignal(request.signal);
  let res: Response;
  try {
    res = await fetch(config.baseUrl + "/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer " + config.apiKey,
        ...(config.provider === "zai" ? { "X-Z-AI-From": "Z" } : {}),
      },
      body: JSON.stringify({ ...body, model }),
      signal,
    });
  } catch (err) {
    throw classifyError(err, config.provider);
  }
  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new AIProviderError(
      res.status === 401 || res.status === 403 ? "AUTH_FAILED" :
      res.status === 404 ? "NOT_FOUND" :
      res.status === 429 ? "RATE_LIMITED" : "PROVIDER_ERROR",
      `${config.provider.toUpperCase()} provider returned HTTP ${res.status}${errBody ? ": " + errBody.slice(0, 200) : ""}`,
      { status: res.status, provider: config.provider },
    );
  }
  try {
    return await res.json() as AIChatResponse;
  } catch (err) {
    throw classifyError(err, config.provider);
  }
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
  const signal = composeSignal(request.signal);
  let res: Response;
  try {
    res = await fetch(config.baseUrl + "/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": config.apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    throw classifyError(err, config.provider);
  }
  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new AIProviderError(
      res.status === 401 || res.status === 403 ? "AUTH_FAILED" :
      res.status === 404 ? "NOT_FOUND" :
      res.status === 429 ? "RATE_LIMITED" : "PROVIDER_ERROR",
      `ANTHROPIC provider returned HTTP ${res.status}${errBody ? ": " + errBody.slice(0, 200) : ""}`,
      { status: res.status, provider: config.provider },
    );
  }
  const data = await res.json() as { id?: string; model?: string; content?: Array<{ type: string; text?: string }>; stop_reason?: string; usage?: { input_tokens?: number; output_tokens?: number } };
  const content = (data.content || []).filter(x => x.type === "text").map(x => x.text || "").join("");
  return {
    id: data.id,
    model: data.model || body.model as string,
    choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: data.stop_reason }],
    usage: {
      prompt_tokens: data.usage?.input_tokens,
      completion_tokens: data.usage?.output_tokens,
      total_tokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
    },
  };
}

/**
 * Resolve the configured chat-completion provider.
 *
 * Returns `{ ok: true, provider, model, client }` on success.
 * The `client.chat.completions.create(request)` function:
 *   - Accepts the standard OpenAI-style request shape.
 *   - Accepts an optional `signal: AbortSignal` for caller-
 *     initiated cancellation.
 *   - Accepts an optional `thinking: { type: "disabled" }` for
 *     ZAI (forwarded as a native field).
 *   - Applies a default 30s timeout (configurable via
 *     AI_REQUEST_TIMEOUT_MS) when no signal is provided.
 *   - Throws `AIProviderError` with a structured `kind` field
 *     on any failure (auth, not-found, rate-limit, timeout,
 *     network, provider error).
 *
 * Returns `{ ok: false, provider, reason }` when credentials
 * are missing or the endpoint is malformed. Never throws on
 * configuration errors — only on actual request failures.
 */
export function getAIProvider(): Result {
  const config = readConfig();
  if ("error" in config) return { ok: false, provider: config.provider, reason: config.error };
  const client = {
    chat: {
      completions: {
        create: (request: AIChatRequest) =>
          config.provider === "anthropic"
            ? callAnthropic(config, request)
            : callOpenAICompatible(config, request),
      },
    },
  };
  return { ok: true, provider: config.provider, model: config.model, client };
}

/**
 * Resolve the ZAI SDK instance for non-chat operations
 * (images.generations, images.search, video.generations,
 * async.result.query, functions.invoke).
 *
 * This bypasses the SDK's `ZAI.create()` factory (which reads
 * `.z-ai-config` from disk) and constructs the client directly
 * from `ZAI_BASE_URL` + `ZAI_API_KEY` env vars — the same vars
 * `getAIProvider()` uses for chat. ONE config source, TWO
 * surfaces (chat via the router, non-chat via the raw SDK).
 *
 * Returns `{ ok: true, sdk }` on success. The returned `sdk`
 * exposes the FULL ZAI SDK API surface — only `chat.completions`
 * is redundant with `getAIProvider()` and should not be used
 * from here (use `getAIProvider()` for chat so provider routing
 * works uniformly).
 *
 * Returns `{ ok: false, reason }` when ZAI_BASE_URL or
 * ZAI_API_KEY is missing, or when AI_PROVIDER is not "zai"
 * (non-chat ZAI operations are only available when ZAI is the
 * selected provider).
 */
export type ZAISDKResult =
  | { ok: true; sdk: ZAISDK }
  | { ok: false; reason: string };

export function getZAISDK(): ZAISDKResult {
  // Non-chat ZAI operations only make sense when ZAI is the
  // active provider. If the operator switched to OpenAI/etc.,
  // these operations are unavailable — call sites must handle
  // the structured error (typically: return AI_UNAVAILABLE).
  const provider = (readEnv("AI_PROVIDER") || "zai")!.toLowerCase();
  if (provider !== "zai") {
    return {
      ok: false,
      reason: `ZAI non-chat operations are unavailable when AI_PROVIDER="${provider}". Only chat completions are routed to alternate providers.`,
    };
  }
  const baseUrl = readEnv("ZAI_BASE_URL");
  const apiKey = readEnv("ZAI_API_KEY");
  if (!baseUrl) {
    return { ok: false, reason: "ZAI_BASE_URL is not configured" };
  }
  if (!apiKey) {
    return { ok: false, reason: "ZAI_API_KEY is not configured" };
  }
  // Construct directly — bypasses loadConfig()'s filesystem reads.
  // The constructor is documented as private in the .d.ts but is
  // a regular public constructor in the shipped JS. Cast through
  // unknown to satisfy tsc without changing runtime behavior.
  const sdk = new (ZAI as unknown as new (cfg: { baseUrl: string; apiKey: string; chatId?: string; userId?: string; token?: string }) => ZAISDK)({
    baseUrl: baseUrl.replace(/\/+$/, ""),
    apiKey,
  });
  return { ok: true, sdk };
}

/**
 * Public, redacted view of the resolved provider config — safe
 * to expose to admins or to the health endpoint. The apiKey is
 * replaced with a boolean presence flag.
 */
export type AIProviderConfigPublic = {
  provider: AIProviderKey;
  baseUrl: string;
  model: string;
  hasApiKey: boolean;
  timeoutMs: number;
};

export function getAIProviderConfigPublic(): AIProviderConfigPublic {
  const cfg = readConfig();
  if ("error" in cfg) {
    return {
      provider: cfg.provider,
      baseUrl: "",
      model: PROVIDER_DEFAULTS[cfg.provider].defaultModel,
      hasApiKey: false,
      timeoutMs: getTimeoutMs(),
    };
  }
  return {
    provider: cfg.provider,
    baseUrl: cfg.baseUrl,
    model: cfg.model,
    hasApiKey: true,
    timeoutMs: getTimeoutMs(),
  };
}

/**
 * Names of the environment variables this adapter reads.
 * Exported for documentation and test reference.
 */
export const AI_ENV_VARS = {
  provider: "AI_PROVIDER",
  requestTimeoutMs: "AI_REQUEST_TIMEOUT_MS",
  zaiBaseUrl: "ZAI_BASE_URL",
  zaiApiKey: "ZAI_API_KEY",
  zaiModel: "ZAI_MODEL",
  openaiBaseUrl: "OPENAI_BASE_URL",
  openaiApiKey: "OPENAI_API_KEY",
  openaiModel: "OPENAI_MODEL",
  geminiBaseUrl: "GEMINI_BASE_URL",
  geminiApiKey: "GEMINI_API_KEY",
  geminiModel: "GEMINI_MODEL",
  anthropicBaseUrl: "ANTHROPIC_BASE_URL",
  anthropicApiKey: "ANTHROPIC_API_KEY",
  anthropicModel: "ANTHROPIC_MODEL",
} as const;
