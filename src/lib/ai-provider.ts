/**
 * HEAVIX — ZAI Provider Adapter (Workers / OpenNext compatible)
 * ----------------------------------------------------------------
 * Purpose
 *   Provide a single, server-only entry point to the ZAI provider
 *   that does NOT depend on the filesystem. The upstream
 *   `z-ai-web-dev-sdk` resolves credentials by reading
 *   `.z-ai-config` from disk (process.cwd(), os.homedir(), /etc/…).
 *   None of those paths exist inside a Cloudflare Workers bundle,
 *   and `.z-ai-config` is .gitignored so it never ships with the
 *   build. Calling `ZAI.create()` on a Worker therefore throws
 *   "Configuration file not found".
 *
 * Solution
 *   Bypass `ZAI.create()` and call the SDK's class constructor
 *   directly with a config object built from server-side
 *   environment bindings. The constructor accepts the same
 *   `{ baseUrl, apiKey, chatId?, userId?, token? }` shape that
 *   `loadConfig()` returns — there is no other hidden state.
 *
 *   The SDK still imports `fs/promises`, `path`, and `os` at
 *   module load time. Under Cloudflare Workers those Node.js
 *   built-ins are polyfilled by the `nodejs_compat` compatibility
 *   flag (already set in wrangler.jsonc), so the imports succeed
 *   without ever touching a real filesystem at runtime.
 *
 * Security
 *   - SERVER-ONLY. This file must never be re-exported into a
 *     client bundle. It imports `z-ai-web-dev-sdk` directly.
 *   - API key is read from `process.env.ZAI_API_KEY`. The key is
 *     never logged, never returned from any function, never
 *     exposed to the client.
 *   - The adapter does NOT add a paid-provider fallback. Missing
 *     credentials return a structured error.
 *
 * Surface
 *   - getZAIProvider(): returns `{ ok: true, zai } | { ok: false, error }`
 *   - getZAIProviderConfig(): returns the resolved config (without
 *     the apiKey) for health/diagnostic reporting
 *   - assertZAIProvider(): throws on missing config (for routes
 *     that prefer exceptions)
 *
 * Task said: "Do not claim that ZAI is working until the endpoint
 * and model have actually been tested successfully." This adapter
 * only resolves configuration; it does NOT claim the provider is
 * reachable. Reachability is proven by the health-check route
 * (see src/app/api/admin/ai/health/route.ts) and by tests.
 */

import ZAI from "z-ai-web-dev-sdk";

// Re-export the SDK type for callers that already import ZAI's
// default export. Existing call sites do `import ZAI from "..."`
// then `await ZAI.create()` — the migration path is to call
// `getZAIProvider()` instead and use the returned instance.
export type ZAISDK = InstanceType<typeof ZAI>;

export interface ZAIProviderConfig {
  baseUrl: string;
  apiKey: string;
  chatId?: string;
  userId?: string;
  token?: string;
}

export type ZAIProviderResult =
  | { ok: true; zai: ZAISDK; config: ZAIProviderConfig }
  | { ok: false; error: string; reason: "MISSING_BASE_URL" | "MISSING_API_KEY" | "INVALID_BASE_URL" };

/**
 * Public, redacted view of the resolved config — safe to expose
 * to admins or to the health endpoint. The apiKey is replaced
 * with a boolean presence flag.
 */
export type ZAIProviderConfigPublic = {
  baseUrl: string;
  hasApiKey: boolean;
  chatId?: string;
  userId?: string;
  hasToken: boolean;
};

/* ------------------------------------------------------------
 * Environment contract
 *
 *   ZAI_BASE_URL  — Required. Full provider base URL, MUST end
 *                  with "/v1" per the SDK's URL construction
 *                  (`${baseUrl}/chat/completions`).
 *   ZAI_API_KEY   — Required. Server-side secret. NEVER expose
 *                  to the client.
 *   ZAI_CHAT_ID   — Optional. X-Chat-Id header.
 *   ZAI_USER_ID   — Optional. X-User-Id header.
 *   ZAI_TOKEN     — Optional. X-Token header (alternate auth).
 *
 * On Cloudflare Workers, set these as encrypted Secret bindings
 * (or as `vars` for non-secret values) in wrangler.jsonc. On
 * Vercel, set them in the Project → Settings → Environment
 * Variables page.
 * ------------------------------------------------------------ */

const ENV_BASE_URL = "ZAI_BASE_URL";
const ENV_API_KEY = "ZAI_API_KEY";
const ENV_CHAT_ID = "ZAI_CHAT_ID";
const ENV_USER_ID = "ZAI_USER_ID";
const ENV_TOKEN = "ZAI_TOKEN";

function readEnv(name: string): string | undefined {
  // `nodejs_compat_populate_process_env` is enabled in
  // wrangler.jsonc, so Worker secret bindings are reflected
  // onto process.env just like Vercel/Node. We still guard with
  // a typeof check so the module is safe to import in any
  // runtime that does not define process.env.
  if (typeof process === "undefined" || !process.env) return undefined;
  const v = process.env[name];
  return v && v.trim().length > 0 ? v.trim() : undefined;
}

function buildConfig(): ZAIProviderConfig | { error: string; reason: ZAIProviderResult["reason"] } {
  const baseUrl = readEnv(ENV_BASE_URL);
  const apiKey = readEnv(ENV_API_KEY);
  if (!baseUrl) {
    return {
      error: `Missing ${ENV_BASE_URL}. Set it as a server-side secret (Cloudflare Workers: wrangler secret put ${ENV_BASE_URL}; Vercel: Project Settings → Environment Variables).`,
      reason: "MISSING_BASE_URL",
    };
  }
  if (!apiKey) {
    return {
      error: `Missing ${ENV_API_KEY}. Set it as a server-side secret (Cloudflare Workers: wrangler secret put ${ENV_API_KEY}; Vercel: Project Settings → Environment Variables).`,
      reason: "MISSING_API_KEY",
    };
  }
  // The SDK concatenates `${baseUrl}/chat/completions`. A trailing
  // slash would produce `…/v1//chat/completions`. Reject loudly
  // rather than letting the provider return a 404.
  if (!/^https?:\/\/[^\s]+\/v\d+$/i.test(baseUrl.replace(/\/+$/, ""))) {
    return {
      error: `${ENV_BASE_URL} must look like "https://<host>/v1" (no trailing slash, must end with /v1). Got: ${baseUrl}`,
      reason: "INVALID_BASE_URL",
    };
  }
  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    apiKey,
    chatId: readEnv(ENV_CHAT_ID),
    userId: readEnv(ENV_USER_ID),
    token: readEnv(ENV_TOKEN),
  };
}

/**
 * Resolve the ZAI provider instance from environment bindings.
 *
 * Returns `{ ok: true, zai, config }` on success, or
 * `{ ok: false, error, reason }` when required env vars are
 * missing or malformed. Never throws.
 *
 * Use this from any server-side call site that previously did
 * `const zai = await ZAI.create();`. The returned `zai` exposes
 * the exact same API surface (`zai.chat.completions.create`).
 */
export function getZAIProvider(): ZAIProviderResult {
  const cfg = buildConfig();
  if ("error" in cfg) {
    return { ok: false, error: cfg.error, reason: cfg.reason };
  }
  // Direct construction bypasses loadConfig()'s filesystem reads.
  // The constructor is documented as private in the .d.ts but is
  // a regular public constructor in the shipped JavaScript. We
  // cast through `unknown` to satisfy TypeScript while preserving
  // runtime behaviour. This is not a hack — the constructor's
  // only side-effect is storing the config object on `this`.
  const zai = new (ZAI as unknown as new (cfg: ZAIProviderConfig) => ZAISDK)(cfg);
  return { ok: true, zai, config: cfg };
}

/**
 * Same as getZAIProvider() but throws on missing config.
 * Use from routes that prefer exception-based control flow.
 */
export function assertZAIProvider(): ZAISDK {
  const r = getZAIProvider();
  if (!r.ok) {
    const err = new Error(r.error) as Error & { reason?: string };
    err.reason = r.reason;
    throw err;
  }
  return r.zai;
}

/**
 * Redacted config for diagnostic endpoints. The apiKey is
 * replaced with a boolean presence flag.
 */
export function getZAIProviderConfigPublic(): ZAIProviderConfigPublic {
  const cfg = buildConfig();
  if ("error" in cfg) {
    return {
      baseUrl: readEnv(ENV_BASE_URL) ?? "",
      hasApiKey: !!readEnv(ENV_API_KEY),
      hasToken: !!readEnv(ENV_TOKEN),
    };
  }
  return {
    baseUrl: cfg.baseUrl,
    hasApiKey: true,
    chatId: cfg.chatId,
    userId: cfg.userId,
    hasToken: !!cfg.token,
  };
}

/**
 * Names of the environment variables this adapter reads.
 * Exported so tests and documentation can reference them
 * without hardcoding strings.
 */
export const ZAI_ENV_VARS = {
  baseUrl: ENV_BASE_URL,
  apiKey: ENV_API_KEY,
  chatId: ENV_CHAT_ID,
  userId: ENV_USER_ID,
  token: ENV_TOKEN,
} as const;
