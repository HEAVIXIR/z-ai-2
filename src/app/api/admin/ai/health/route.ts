/**
 * HEAVIX — AI Provider Health Check
 * ----------------------------------------------------------------
 * GET /api/admin/ai/health
 *
 * Admin-only diagnostic that confirms:
 *   1. Provider is configured     (env vars present)
 *   2. Endpoint is valid          (URL parses, /v1 suffix for ZAI)
 *   3. Authentication works       (provider returns 2xx for a
 *                                  trivial request, or 401/403
 *                                  for bad key)
 *   4. Model is available         (chat completions endpoint
 *                                  accepts the request and
 *                                  returns a model name)
 *   5. A safe minimal request succeeds
 *
 * This endpoint is NON-BILLABLE by design:
 *   - It sends a single chat-completion request with
 *     `max_tokens: 1` and `thinking: disabled`. The provider
 *     may ignore `max_tokens` (ZAI does when the field is not
 *     in its native schema) — but the request is still one
 *     short chat turn, not a real prompt.
 *   - It does NOT issue real image/video/audio calls.
 *   - It runs ONLY when an admin explicitly invokes it. There
 *     is no automatic recurring probe — that would consume
 *     quota/budget without operator awareness.
 *
 * The endpoint is gated by admin auth. Anonymous users get 401.
 *
 * Output (200 OK — even on provider failure, so the admin sees
 * the structured diagnosis):
 *   {
 *     ok: boolean,
 *     checks: {
 *       configured:     { ok, reason? },
 *       endpointShape:  { ok, reason? },
 *       auth:           { ok, reason?, status? },
 *       model:          { ok, reason?, status?, model? },
 *       minimalRequest: { ok, reason?, status?, model?, latencyMs? }
 *     },
 *     config: { provider, baseUrl, model, hasApiKey, timeoutMs },
 *     timestamp: ISO-8601
 *   }
 *
 * Failure handling:
 *   - Missing credentials → returns ok=false with
 *     checks.configured.ok=false. Does NOT attempt a live probe.
 *   - Provider 401/403 → checks.auth.ok=false,
 *     reason="Authentication failed — check <PROVIDER>_API_KEY".
 *   - Provider 404 → checks.model.ok=false,
 *     reason="Endpoint or model not found".
 *   - Provider 429 → checks.model.ok=false,
 *     reason="Rate-limited by provider".
 *   - Timeout → checks.minimalRequest.ok=false,
 *     reason="Request timed out after <N>ms".
 *   - Network error → checks.minimalRequest.ok=false,
 *     reason="Network error: <message>".
 *   - NO paid-provider fallback is attempted. The selected
 *     provider is the only one probed.
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/authorization";
import {
  getAIProvider,
  getAIProviderConfigPublic,
  AIProviderError,
  type AIProviderConfigPublic,
} from "@/lib/ai-provider-router";
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
  config: AIProviderConfigPublic;
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

  const config = getAIProviderConfigPublic();
  const timestamp = new Date().toISOString();

  // ── Check 1: configured ────────────────────────────────
  const configured: CheckResult = config.baseUrl && config.hasApiKey
    ? { ok: true }
    : {
        ok: false,
        reason: !config.baseUrl
          ? `${config.provider.toUpperCase()}_BASE_URL is not set`
          : `${config.provider.toUpperCase()}_API_KEY is not set`,
      };

  // ── Check 2: endpoint shape ────────────────────────────
  // ZAI requires /v1 suffix (the SDK appends /chat/completions).
  // OpenAI/Gemini/Anthropic defaults are known-good; custom URLs
  // are validated by URL parsing in the router already.
  const endpointShape: CheckResult = config.baseUrl
    ? (config.provider === "zai"
        ? (/^https?:\/\/[^\s]+\/v\d+$/i.test(config.baseUrl)
            ? { ok: true }
            : { ok: false, reason: `${config.baseUrl} does not end with /v1 (ZAI requires this)` })
        : { ok: true })
    : { ok: false, reason: "Provider base URL unset" };

  // Short-circuit: if config is missing, we cannot run the live
  // checks. Return the partial result so the admin sees exactly
  // what is missing without triggering a provider call.
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
      entityId: config.provider,
      reason: "configuration incomplete",
    }).catch(() => { /* audit is best-effort */ });
    return NextResponse.json(body, { status: 200 });
  }

  // ── Checks 3-5: live provider probe ────────────────────
  const provider = getAIProvider();
  if (!provider.ok) {
    const body: HealthBody = {
      ok: false,
      checks: {
        configured,
        endpointShape,
        auth: { ok: false, reason: provider.reason },
        model: { ok: false, reason: "skipped — provider construction failed" },
        minimalRequest: { ok: false, reason: "skipped — provider construction failed" },
      },
      config,
      timestamp,
    };
    return NextResponse.json(body, { status: 200 });
  }

  // Minimal chat-completion request. We deliberately do NOT
  // pass a real prompt — "ping" is the cheapest possible user
  // message. max_tokens: 1 caps the response when the provider
  // honors it. thinking: disabled avoids reasoning-token cost
  // on providers that support it (ZAI does).
  const startedAt = Date.now();
  try {
    const completion = await provider.client.chat.completions.create({
      messages: [
        { role: "system", content: "Reply with exactly: OK" },
        { role: "user", content: "ping" },
      ],
      thinking: { type: "disabled" },
      max_tokens: 1,
    });

    const latencyMs = Date.now() - startedAt;
    const ok = !!completion?.choices?.length;
    const modelReturned = completion?.model;

    const auth: CheckResult = { ok: true, status: 200 };
    const model: CheckResult = {
      ok: true,
      status: 200,
      model: modelReturned,
    };
    const minimalRequest: CheckResult = ok
      ? { ok: true, status: 200, latencyMs, model: modelReturned }
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
      entityId: config.provider,
      reason: ok ? "provider reachable" : "provider responded without choices",
      after: { latencyMs, model: modelReturned },
    }).catch(() => { /* audit is best-effort */ });
    return NextResponse.json(body, { status: 200 });
  } catch (e) {
    const latencyMs = Date.now() - startedAt;
    const isProviderError = e instanceof AIProviderError;
    const kind = isProviderError ? (e as AIProviderError).kind : "PROVIDER_ERROR";
    const status = isProviderError ? (e as AIProviderError).status : undefined;
    const message = e instanceof Error ? e.message : String(e);

    // Classify the failure into auth / model / minimalRequest.
    const auth: CheckResult = kind === "AUTH_FAILED"
      ? { ok: false, status, reason: `Authentication failed — check ${config.provider.toUpperCase()}_API_KEY` }
      : { ok: true, status: 200 };
    const model: CheckResult = kind === "NOT_FOUND"
      ? { ok: false, status, reason: "Endpoint or model not found" }
      : kind === "RATE_LIMITED"
        ? { ok: false, status, reason: "Rate-limited by provider" }
        : { ok: false, status, reason: message };
    const minimalRequest: CheckResult = (() => {
      if (kind === "TIMEOUT") return { ok: false, reason: `Request timed out after ${config.timeoutMs}ms`, latencyMs };
      if (kind === "ABORTED") return { ok: false, reason: "Request aborted", latencyMs };
      if (kind === "NETWORK_ERROR") return { ok: false, reason: `Network error: ${message}`, latencyMs };
      return { ok: false, status, reason: message, latencyMs };
    })();

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
      entityId: config.provider,
      reason: `provider probe failed: ${message}`,
      after: { latencyMs, status, kind },
    }).catch(() => { /* audit is best-effort */ });
    return NextResponse.json(body, { status: 200 });
  }
}
