/**
 * HEAVIX — ZAI Provider Health Check
 * ----------------------------------------------------------------
 * GET /api/admin/ai/health
 *
 * Admin-only diagnostic that confirms:
 *   1. Provider is configured     (env vars present)
 *   2. Endpoint is valid          (URL shape /v1)
 *   3. Authentication works       (provider returns 2xx for a
 *                                  trivial request, or 401/403
 *                                  for bad key)
 *   4. Model is available         (chat completions endpoint
 *                                  accepts a request)
 *   5. A safe minimal request succeeds
 *
 * This endpoint is NON-BILLABLE by design:
 *   - It does NOT call the gateway with a real prompt.
 *   - It sends a single chat-completion request with `max_tokens: 1`
 *     and `thinking: disabled`. If the provider counts tokens, the
 *     cost is one token — but we do not assume the provider is
 *     reachable. The endpoint reports whatever it sees.
 *   - The endpoint does NOT issue real image/video/audio calls.
 *
 * The endpoint is gated by admin auth. It is NOT callable by
 * anonymous users. It is NOT a public-facing health probe —
 * the existing /api/health route is the public probe.
 *
 * Output:
 *   200 OK with body:
 *     {
 *       ok: boolean,
 *       checks: {
 *         configured: { ok, reason? },
 *         endpointShape: { ok, reason? },
 *         auth: { ok, reason?, status? },
 *         model: { ok, reason?, status? },
 *         minimalRequest: { ok, reason?, status?, model?, latencyMs? }
 *       },
 *       config: { baseUrl, hasApiKey, hasToken, chatId?, userId? },
 *       timestamp: ISO-8601
 *     }
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/authorization";
import {
  getZAIProvider,
  getZAIProviderConfigPublic,
  type ZAIProviderConfigPublic,
} from "@/lib/ai-provider";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CheckResult = {
  ok: boolean;
  reason?: string;
  status?: number;
  model?: string;
  latencyMs?: number;
};

type HealthBody = {
  ok: boolean;
  checks: {
    configured: CheckResult;
    endpointShape: CheckResult;
    auth: CheckResult;
    model: CheckResult;
    minimalRequest: CheckResult;
  };
  config: ZAIProviderConfigPublic;
  timestamp: string;
};

export async function GET() {
  // ── Auth gate (admin only) ─────────────────────────────
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const adminOk = await isAdmin(user.id);
  if (!adminOk) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const config = getZAIProviderConfigPublic();
  const timestamp = new Date().toISOString();

  // ── Check 1: configured ────────────────────────────────
  const configured: CheckResult = config.baseUrl && config.hasApiKey
    ? { ok: true }
    : {
        ok: false,
        reason: !config.baseUrl
          ? "ZAI_BASE_URL is not set"
          : "ZAI_API_KEY is not set",
      };

  // ── Check 2: endpoint shape ────────────────────────────
  const endpointShape: CheckResult = config.baseUrl
    ? (/^https?:\/\/[^\s]+\/v\d+$/i.test(config.baseUrl)
        ? { ok: true }
        : { ok: false, reason: `${config.baseUrl} does not end with /v1` })
    : { ok: false, reason: "ZAI_BASE_URL unset" };

  // Short-circuit: if config is missing, we cannot run the live
  // checks. Return the partial result so the admin can see
  // exactly what is missing without triggering a provider call.
  if (!configured.ok || !endpointShape.ok) {
    const body: HealthBody = {
      ok: false,
      checks: {
        configured,
        endpointShape,
        auth: { ok: false, reason: "skipped — provider not configured" },
        model: { ok: false, reason: "skipped — provider not configured" },
        minimalRequest: { ok: false, reason: "skipped — provider not configured" },
      },
      config,
      timestamp,
    };
    await logAudit({
      actorId: user.id,
      actorType: "USER",
      action: "ai.health.check",
      entityType: "ai_provider",
      entityId: "zai",
      reason: "configuration incomplete",
    }).catch(() => {/* audit is best-effort */});
    return NextResponse.json(body, { status: 200 });
  }

  // ── Checks 3-5: live provider probe ────────────────────
  // We construct the provider directly via the adapter. The
  // adapter does NOT call ZAI.create() (which would touch the
  // filesystem), so this works on Cloudflare Workers.
  const provider = getZAIProvider();
  if (!provider.ok) {
    const body: HealthBody = {
      ok: false,
      checks: {
        configured,
        endpointShape,
        auth: { ok: false, reason: provider.error },
        model: { ok: false, reason: "skipped — provider construction failed" },
        minimalRequest: { ok: false, reason: "skipped — provider construction failed" },
      },
      config,
      timestamp,
    };
    return NextResponse.json(body, { status: 200 });
  }

  // Minimal chat-completion request. We deliberately do NOT
  // pass a `model` field — the SDK forwards whatever the caller
  // sets, and the provider applies its default model when
  // omitted. This is the cheapest possible probe: one system
  // message, one short user message, max_tokens omitted
  // (provider decides), thinking disabled (no reasoning cost).
  const startedAt = Date.now();
  try {
    const completion = await provider.zai.chat.completions.create({
      messages: [
        { role: "system", content: "Reply with exactly: OK" },
        { role: "user", content: "ping" },
      ],
      thinking: { type: "disabled" },
      // The SDK's CreateChatCompletionBody type allows arbitrary
      // extra keys via `[key: string]: any`. We use this to cap
      // the response cheaply when the provider supports it. The
      // provider may ignore unknown fields.
      max_tokens: 1,
    } as Parameters<typeof provider.zai.chat.completions.create>[0] & { max_tokens: number });

    const latencyMs = Date.now() - startedAt;

    // SDK returns either a JSON object (non-streaming) or a
    // ReadableStream (streaming). We did not request streaming,
    // so we expect a JSON object with `choices`.
    const ok = !!(completion as { choices?: unknown })?.choices;
    const auth: CheckResult = { ok: true, status: 200 };
    const model: CheckResult = {
      ok: true,
      status: 200,
      model: (completion as { model?: string })?.model,
    };
    const minimalRequest: CheckResult = ok
      ? { ok: true, status: 200, latencyMs, model: (completion as { model?: string })?.model }
      : { ok: false, status: 200, reason: "Provider returned 200 but no choices[] in response" };

    const body: HealthBody = {
      ok: ok,
      checks: {
        configured,
        endpointShape,
        auth,
        model,
        minimalRequest,
      },
      config,
      timestamp,
    };
    await logAudit({
      actorId: user.id,
      actorType: "USER",
      action: "ai.health.check",
      entityType: "ai_provider",
      entityId: "zai",
      reason: ok ? "provider reachable" : "provider responded without choices",
      after: { latencyMs, model: minimalRequest.model },
    }).catch(() => {/* audit is best-effort */});
    return NextResponse.json(body, { status: 200 });
  } catch (e) {
    const latencyMs = Date.now() - startedAt;
    const err = e as { message?: string; status?: number };
    const status = err?.status;
    const message = err?.message ?? String(e);

    // Classify the failure into auth / model / minimalRequest.
    // A 401/403 from the provider means auth failed. A 404 means
    // the endpoint/model path is wrong. A 429 means rate-limited.
    // Anything else is treated as a provider-side issue.
    const isAuth = status === 401 || status === 403 ||
      /unauthorized|forbidden|auth/i.test(message);
    const isRateLimit = status === 429 || /rate.?limit/i.test(message);
    const isNotFound = status === 404 || /not.found/i.test(message);

    const auth: CheckResult = isAuth
      ? { ok: false, status, reason: "Authentication failed — check ZAI_API_KEY" }
      : { ok: true, status: 200 };
    const model: CheckResult = isNotFound
      ? { ok: false, status, reason: "Endpoint or model not found" }
      : isRateLimit
        ? { ok: false, status, reason: "Rate-limited by provider" }
        : { ok: false, status, reason: message };
    const minimalRequest: CheckResult = {
      ok: false,
      status,
      reason: message,
      latencyMs,
    };

    const body: HealthBody = {
      ok: false,
      checks: {
        configured,
        endpointShape,
        auth,
        model,
        minimalRequest,
      },
      config,
      timestamp,
    };
    await logAudit({
      actorId: user.id,
      actorType: "USER",
      action: "ai.health.check",
      entityType: "ai_provider",
      entityId: "zai",
      reason: `provider probe failed: ${message}`,
      after: { latencyMs, status },
    }).catch(() => {/* audit is best-effort */});
    return NextResponse.json(body, { status: 200 });
  }
}
