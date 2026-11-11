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

  it("uses a protected environment and the exact selected recovery commit", () => {
    expect(workflow).toContain("environment: preview-backup");
    expect(workflow).toContain("refs/heads/recovery/heavix-full-product-integration-2026-11-11");
    expect(workflow).toContain("ref: ${{ github.sha }}");
    expect(workflow).toContain('test "$(git rev-parse HEAD)" = "$GITHUB_SHA"');
    expect(workflow).not.toContain("b94b9d6f3540e8f4467b1d4ac051d5ef050c0994");
  });

  it("requires distinct Preview URLs and database OIDs without printing values", () => {
    expect(workflow).toContain("HEAVIX_APP_PREVIEW_PPG_URL");
    expect(workflow).toContain("HEAVIX_STORE_PREVIEW_PPG_URL");
    expect(workflow).toContain('test -n "$HEAVIX_APP_PREVIEW_PPG_URL"');
    expect(workflow).toContain('test -n "$HEAVIX_STORE_PREVIEW_PPG_URL"');
    expect(workflow).toContain('test "$HEAVIX_APP_PREVIEW_PPG_URL" != "$HEAVIX_STORE_PREVIEW_PPG_URL"');
    expect(workflow).toContain("secrets.HEAVIX_APP_PREVIEW_DATABASE_OID");
    expect(workflow).toContain("secrets.HEAVIX_STORE_PREVIEW_DATABASE_OID");
    expect(workflow).toContain('[[ "$HEAVIX_APP_PREVIEW_DATABASE_OID" =~');
    expect(workflow).toContain('[[ "$HEAVIX_STORE_PREVIEW_DATABASE_OID" =~');
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
