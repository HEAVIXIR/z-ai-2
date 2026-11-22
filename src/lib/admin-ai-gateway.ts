import { db } from "@/lib/db";
import { preflightAIRequest } from "@/lib/ai-policy";
import { getAIProviderConfigPublic } from "@/lib/ai-provider-router";

export type AdminAIGatewayResult<T> =
  | { ok: true; output: T }
  | { ok: false; statusCode: number; error: string };

export async function executeAdminAIWithPolicy<T>(params: {
  userId: string;
  taskType: string;
  input: unknown;
  execute: () => Promise<T>;
}): Promise<AdminAIGatewayResult<T>> {
  const inputText = JSON.stringify(params.input ?? null);
  const preflight = await preflightAIRequest({
    taskType: params.taskType,
    user: { id: params.userId },
    inputLength: inputText.length,
  });
  if (!preflight.ok) return { ok: false, statusCode: preflight.statusCode, error: preflight.reason };

  const config = getAIProviderConfigPublic();
  const model = `${config.provider}:${preflight.policy.model === "default" ? config.model : preflight.policy.model}`;
  const startedAt = Date.now();
  let success = false;
  let output: unknown = null;
  let errorText: string | null = null;
  try {
    output = await params.execute();
    success = true;
  } catch (err) {
    errorText = err instanceof Error ? err.message.slice(0, 500) : "AI request failed";
  }

  // Preflight atomically reserves the policy ceiling. This is reserved budget,
  // not a provider-reported billable amount.
  await db.aIGatewayLog.create({
    data: {
      taskType: params.taskType,
      model,
      input: inputText.slice(0, 500),
      output: success ? JSON.stringify(output).slice(0, 500) : null,
      latencyMs: Date.now() - startedAt,
      tokensUsed: null,
      cost: preflight.policy.costCeilingUsd,
      success,
      error: errorText,
      userId: params.userId,
    },
  });
  return success ? { ok: true, output: output as T } : { ok: false, statusCode: 502, error: errorText ?? "AI request failed" };
}