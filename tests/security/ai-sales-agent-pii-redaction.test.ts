import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("AI sales agent buyer-PII boundary", () => {
  it("does not send viewer phone or free-text lead notes to the model", () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "src/app/api/ai-sales-agent/route.ts"),
      "utf8",
    );
    const match = source.match(/const leadSummary[\s\S]*?const offerSummary/);
    expect(match).not.toBeNull();

    const executable = (match?.[0] ?? "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");

    expect(executable).toContain("type: l.leadType");
    expect(executable).toContain("listing: l.listing?.title");
    expect(executable).not.toContain("viewerPhone");
    expect(executable).not.toContain("viewerName");
    expect(executable).not.toContain("l.note");
  });
});
