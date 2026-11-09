import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  path.join(process.cwd(), ".github/workflows/prisma-preview-workerd-proof.yml"),
  "utf8",
);

describe("Prisma Preview Workerd dispatch safety contract", () => {
  it("runs on exact proof-branch pushes and retains explicit PREVIEW_ONLY manual dispatch", () => {
    expect(workflow).toContain("push:");
    expect(workflow).toContain("- infra/prisma6-cloudflare-runtime");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("confirm_preview_only:");
    expect(workflow).toContain("required: true");
    expect(workflow).toContain("PREVIEW_ONLY");
  });

  it("checks out and verifies the exact commit selected for this workflow run", () => {
    expect(workflow).toContain("ref: ${{ github.sha }}");
    expect(workflow).toContain('test "$GITHUB_REF" = "refs/heads/infra/prisma6-cloudflare-runtime"');
    expect(workflow).toContain('test "$(git rev-parse HEAD)" = "$GITHUB_SHA"');
    expect(workflow).not.toContain("b94b9d6f3540e8f4467b1d4ac051d5ef050c0994");
    expect(workflow).not.toContain("a5b62a41a94b41ea5d09ffb27ec02cadec51fc64");
  });

  it("requires both distinct Preview secrets without printing their values", () => {
    expect(workflow).toContain("environment: preview-backup");
    expect(workflow).toContain("secrets.MAIN_PREVIEW_DATABASE_URL");
    expect(workflow).toContain("secrets.STORE_PREVIEW_DATABASE_URL");
    expect(workflow).toContain("HEAVIX_APP_PREVIEW_PPG_URL");
    expect(workflow).toContain("HEAVIX_STORE_PREVIEW_PPG_URL");
    expect(workflow).toContain('test -n "$HEAVIX_APP_PREVIEW_PPG_URL"');
    expect(workflow).toContain('test -n "$HEAVIX_STORE_PREVIEW_PPG_URL"');
    expect(workflow).toContain('test "$HEAVIX_APP_PREVIEW_PPG_URL" != "$HEAVIX_STORE_PREVIEW_PPG_URL"');
    expect(workflow).not.toMatch(/echo .*HEAVIX_(APP|STORE)_PREVIEW_PPG_URL/);
    expect(workflow).not.toMatch(/echo .*MAIN_PREVIEW_DATABASE_URL|echo .*STORE_PREVIEW_DATABASE_URL/);
  });

  it("runs only the local Workerd proof and has no deployment or migration command", () => {
    expect(workflow).toContain("bun run test:workerd");
    expect(workflow).not.toMatch(/wrangler\s+deploy/i);
    expect(workflow).not.toMatch(/prisma\s+migrate|prisma\s+db\s+push/i);
    expect(workflow).toContain("permissions:");
    expect(workflow).toContain("contents: read");
  });
});
