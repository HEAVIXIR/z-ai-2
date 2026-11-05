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

  it("checks out and verifies the exact reviewed Prisma Workerd commit", () => {
    const reviewedSha = "a5b62a41a94b41ea5d09ffb27ec02cadec51fc64";
    expect(workflow).toContain(`ref: ${reviewedSha}`);
    expect(workflow).toContain(`test "$(git rev-parse HEAD)" = "${reviewedSha}"`);
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
