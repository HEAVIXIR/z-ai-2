import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const workflow = readFileSync(
  path.join(process.cwd(), ".github/workflows/heavix-pr376-canonical-preview-deploy.yml"),
  "utf8",
);

describe("PR #376 canonical Preview deployment safety", () => {
  it("is manual-only and requires explicit Preview confirmation", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).not.toMatch(/^\s*push:/m);
    expect(workflow).toContain("inputs.confirm_preview_only == true");
    expect(workflow).toContain("accept_legacy_password_reset:");
    expect(workflow).toContain("ACCEPT_LEGACY_PASSWORD_RESET");
    expect(workflow).toContain("github.ref == 'refs/heads/main'");
    expect(workflow).toContain("environment:");
    expect(workflow).toContain("name: preview-backup");
  });

  it("deploys only the exact open Draft PR #376 head", () => {
    expect(workflow).toContain("pull_number: 376");
    expect(workflow).toContain('pr.state !== "open" || pr.draft !== true');
    expect(workflow).toContain('pr.base.ref !== "integration/preview-readiness-workerd-2026-11-15"');
    expect(workflow).toContain('pr.head.ref !== "fix/integration-cloudflare-free-auth-2026-11-24"');
    expect(workflow).toContain("pr.head.sha !== process.env.EXPECTED_HEAD_SHA");
    expect(workflow).toContain("Checkout exact PR #376 head");
  });

  it("requires a recent successful backup-only run with matching evidence", () => {
    expect(workflow).toContain("prisma-preview-backup-to-b2.yml");
    expect(workflow).toContain('run.conclusion !== "success"');
    expect(workflow).toContain("72 * 60 * 60 * 1000");
    expect(workflow).toContain("heavix-preview-paired-backup-evidence");
    expect(workflow).toContain('grep -Fxq "rbac_seed=SKIP"');
    expect(workflow).toContain('grep -Fxq "brand_seed=SKIP"');
    expect(workflow).toContain('grep -Fxq "model_name_migration=SKIP"');
  });

  it("runs a read-only password hash inventory and requires explicit bcrypt-reset acknowledgement", () => {
    expect(workflow).toContain("bunx tsx prisma/preview-password-hash-inventory.ts");
    expect(workflow).toContain("HEAVIX_APP_PREVIEW_DATABASE_OID");
    expect(workflow).toContain("HEAVIX_EXPECTED_SYSTEM_IDENTIFIER");
    expect(workflow).toContain("PBKDF2 hashes:");
    expect(workflow).toContain("supported bcrypt:");
    expect(workflow).toContain("Refusing deployment: ");
    expect(workflow).toContain("accounts use bcrypt");
    expect(workflow).toContain("unsupported/legacy hashes");
    expect(workflow).toContain("password reset");
    expect(workflow).not.toContain("migrate-passwords.ts --apply");
    expect(workflow).not.toContain("prisma/migrate-passwords.ts");
    expect(workflow).toContain("no user identifiers or password hashes");
  });

  it("syncs only the verified App/Store Preview DB bindings in the same Preview deployment", () => {
    expect(workflow).toContain("MAIN_PREVIEW_DATABASE_URL");
    expect(workflow).toContain("STORE_PREVIEW_DATABASE_URL");
    expect(workflow).toContain("HEAVIX_APP_PREVIEW_DATABASE_OID");
    expect(workflow).toContain("HEAVIX_STORE_PREVIEW_DATABASE_OID");
    expect(workflow).toContain("--secrets-file");
    expect(workflow).toContain('bunx wrangler deploy --name heavix-preview');
    expect(workflow).toContain("https://heavix-preview.heavixir.workers.dev");
  });

  it("refuses unsupported CPU limits and any Production route; never runs migrations or seeds", () => {
    expect(workflow).toContain('! grep -Eq \'"cpu_ms"[[:space:]]*:\' wrangler.jsonc');
    expect(workflow).toContain('! grep -Eq \'^  "routes"[[:space:]]*:\' wrangler.jsonc');
    expect(workflow).not.toContain("prisma migrate deploy");
    expect(workflow).not.toContain("seed-taxonomy");
    expect(workflow).not.toContain("seed-transaction-types");
    expect(workflow).not.toContain("seed-iran-location-catalog");
    expect(workflow).toContain("Database migrations/seeds: not invoked");
    expect(workflow).toContain("Production: not touched");
  });
});
