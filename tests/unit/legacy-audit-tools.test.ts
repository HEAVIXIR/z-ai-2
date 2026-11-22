import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("legacy audit tools", () => {
  it("reports AI provider candidates without treating the heuristic as a CI verdict", () => {
    const result = spawnSync("node", ["scripts/audit-ai-gateway.mjs"], {
      encoding: "utf8",
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("heuristic");
    // The central provider router is the approved entry point
    // for the z-ai-web-dev-sdk import. The audit script lists it
    // as approved, not as a candidate.
    expect(result.stdout).toContain("src/app/api/ai-gateway/route.ts");
    expect(result.stdout).toContain("src/lib/ai-provider-router.ts");
    // No src/lib module should import z-ai-web-dev-sdk directly
    // after the migration — they must route through the router.
    expect(result.stdout).not.toContain("src/lib/ai-listing-builder.ts");
    expect(result.stdout).not.toContain("src/lib/ai-search.ts");
    expect(result.stdout).not.toContain("src/lib/ai-gateway-service.ts");
    // The approved files appear under "Approved direct provider entry points:",
    // not under "Direct provider SDK candidates outside the allowlist:".
    // The " - " prefix only appears for candidates (findings), not for
    // approved entries which are listed separately.
    expect(result.stdout).not.toMatch(/Direct provider SDK candidates.*src\/app\/api\/ai-gateway\/route\.ts/s);
  });

  it("classifies admin routes without claiming marker counts prove authorization", () => {
    const result = spawnSync("node", ["scripts/audit-admin-rbac.mjs"], {
      encoding: "utf8",
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("heuristic");
    expect(result.stdout).toContain("not proof of correct permission");
    expect(result.stdout).toContain("Admin route files:");
  });
});
