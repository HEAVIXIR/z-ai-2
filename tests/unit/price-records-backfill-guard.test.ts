import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("db:seed-prices safety gate", () => {
  it("fails closed without connecting to or mutating a database", () => {
    const result = spawnSync("bun", ["run", "db:seed-prices"], {
      encoding: "utf8",
      env: { ...process.env, DATABASE_URL: "" },
    });

    expect(result.status).toBe(2);
    expect(result.error).toBeUndefined();
    expect((result.stdout || "") + (result.stderr || "")).toContain("BLOCKED:");
    expect((result.stdout || "") + (result.stderr || "")).toContain("dedicated data-migration gate");
  });
});
