import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const route = readFileSync(
  resolve(process.cwd(), "src/app/api/admin/ai/listing-analyze/route.ts"),
  "utf8",
);
const service = readFileSync(
  resolve(process.cwd(), "src/lib/ai-listing-builder.ts"),
  "utf8",
);

describe("admin AI listing analysis budget contract", () => {
  it("enforces admin permission, CSRF, bounded input, and LISTING_BUILDER preflight", () => {
    expect(route).toContain('requireAdmin("ai.execute")');
    expect(route).toContain("checkCsrf(req)");
    expect(route).toContain("readBoundedJson<unknown>(req, 64 * 1024)");
    expect(route).toMatch(/preflightAIRequest\(\{[\s\S]*?taskType: "LISTING_BUILDER"/);
  });

  it("enforces policy timeout and records token usage and reserved ceiling", () => {
    expect(route).toContain("setTimeout(() => controller.abort(), policy.timeoutMs)");
    expect(route).toContain("tokensUsed: result.tokensUsed ?? null");
    expect(route).toContain("cost: policy.costCeilingUsd > 0 ? policy.costCeilingUsd : null");
    expect(route).toContain("db.aIGatewayLog.create");
  });

  it("passes cancellation to the central provider and exposes normalized token usage", () => {
    expect(service).toContain("signal?: AbortSignal");
    expect(service).toContain("signal,");
    expect(service).toContain("completion.usage!.total_tokens!");
  });
});
