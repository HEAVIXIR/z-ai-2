import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  path.join(process.cwd(), ".github/workflows/prisma-preview-workerd-proof.yml"),
  "utf8",
);

describe("Prisma Preview Workerd dispatch safety contract", () => {
  it("requires explicit PREVIEW_ONLY dispatch confirmation", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("confirm_preview_only:");
    expect(workflow).toContain("required: true");
    expect(workflow).toContain("PREVIEW_ONLY");
  });

  it("checks out and verifies the exact triggering commit, not a historical SHA", () => {
    expect(workflow).toContain("ref: ${{ github.sha }}");
    expect(workflow).toContain('test "$(git rev-parse HEAD)" = "$GITHUB_SHA"');
    expect(workflow).not.toContain("b94b9d6f3540e8f4467b1d4ac051d5ef050c0994");
  });

  it("runs inside the protected Preview proof environment", () => {
    expect(workflow).toContain("environment: preview-proof");
  });

  it("requires both distinct Preview secrets without printing their values", () => {
    expect(workflow).toContain("HEAVIX_APP_PREVIEW_PPG_URL");
    expect(workflow).toContain("HEAVIX_STORE_PREVIEW_PPG_URL");
    expect(workflow).toContain('test -n "$HEAVIX_APP_PREVIEW_PPG_URL"');
    expect(workflow).toContain('test -n "$HEAVIX_STORE_PREVIEW_PPG_URL"');
    expect(workflow).toContain('test "$HEAVIX_APP_PREVIEW_PPG_URL" != "$HEAVIX_STORE_PREVIEW_PPG_URL"');
    expect(workflow).not.toMatch(/echo .*HEAVIX_(APP|STORE)_PREVIEW_PPG_URL/);
  });

  it("runs only the local Workerd proof and has no deployment or migration command", () => {
    expect(workflow).toContain("bun run test:workerd");
    expect(workflow).not.toMatch(/wrangler\s+deploy/i);
    expect(workflow).not.toMatch(/prisma\s+migrate|prisma\s+db\s+push/i);
    expect(workflow).toContain("permissions:");
    expect(workflow).toContain("contents: read");
  });
});
