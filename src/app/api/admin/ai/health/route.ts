/**
 * HEAVIX — AI Provider Configuration Diagnostics
 *
 * GET /api/admin/ai/health
 * Configuration-only diagnostic. This endpoint NEVER contacts an AI provider,
 * never spends tokens, and never bypasses the AI budget.
 * A live provider probe must be a separately budgeted, explicitly confirmed
 * operation; it is intentionally not exposed by this endpoint.
 */
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/authorization";
import { getAIProviderConfigPublic } from "@/lib/ai-provider-router";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await isAdmin(user.id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const config = getAIProviderConfigPublic();
  const configured = Boolean(config.baseUrl && config.hasApiKey);
  const endpointShape = config.baseUrl
    ? config.provider === "zai"
      ? /^https?:\/\/[^\s]+\/v\d+$/i.test(config.baseUrl)
        ? { ok: true }
        : { ok: false, reason: "ZAI base URL must end with /v1" }
      : (() => { try { new URL(config.baseUrl); return { ok: true }; } catch { return { ok: false, reason: "Invalid provider base URL" }; } })()
    : { ok: false, reason: "Provider base URL is not configured" };

  const body = {
    ok: configured && endpointShape.ok,
    checks: {
      configured: configured ? { ok: true } : { ok: false, reason: "Provider credentials or base URL are missing" },
      endpointShape,
      auth: { ok: false, reason: "Not tested — configuration-only check" },
      model: { ok: false, reason: "Not tested — no live provider request was sent" },
      minimalRequest: { ok: false, reason: "Disabled — live probes can incur provider charges and must use a budgeted workflow" },
    },
    config,
    probeMode: "configuration_only" as const,
    timestamp: new Date().toISOString(),
  };

  await logAudit({
    actorId: user.id,
    actorType: "USER",
    action: "ai.health.config_check",
    entityType: "ai_provider",
    entityId: config.provider,
    reason: "configuration-only diagnostic; no provider request",
  }).catch(() => undefined);

  return NextResponse.json(body, { status: 200 });
}
