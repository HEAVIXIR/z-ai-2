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
    expect(result.stdout).toContain("src/app/api/ai-gateway/route.ts");
    expect(result.stdout).toContain("src/lib/ai-gateway-service.ts");
    expect(result.stdout).not.toContain(" - src/app/api/ai-gateway/route.ts");
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
