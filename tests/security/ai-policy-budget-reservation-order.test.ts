import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("AI policy preflight budget reservation ordering", () => {
  it("rejects invalid/oversized input before reserving any model budget", () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "src/lib/ai-policy.ts"),
      "utf8",
    );
    const start = source.indexOf("export async function preflightAIRequest");
    expect(start).toBeGreaterThanOrEqual(0);

    // Search the complete function tail instead of stopping at the first
    // nested closing brace. The previous "\n}" boundary truncated the
    // function at its first inner block and produced a false negative.
    const body = source.slice(start);
    const sizeCheck = body.indexOf("inputLength > policy.maxInputChars");
    const budgetReserve = body.indexOf(
      "checkAIBudget(policy.costCeilingUsd, budget)",
    );

    expect(sizeCheck).toBeGreaterThanOrEqual(0);
    expect(budgetReserve).toBeGreaterThan(sizeCheck);
    expect(body).toContain("!Number.isSafeInteger(inputLength)");
  });
});
