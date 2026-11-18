import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) =>
  readFileSync(path.join(process.cwd(), file), "utf8");

const migration = read(".github/workflows/app-preview-product-model-attributes-migration.yml");
const backup = read(".github/workflows/prisma-preview-backup-to-b2.yml");
const proof = read("scripts/run-prisma-workerd-proof.mjs");
const migrationReadme = read("prisma/migrations/README.md");

describe("Paired Preview migration governance", () => {
  it("requires explicit paired Preview scope, exact Integration commit and successful backup run", () => {
    expect(migration).toContain("workflow_dispatch:");
    expect(migration).toContain("APP_AND_STORE_PREVIEW_ONLY");
    expect(migration).toContain("APPLY_REVIEWED_ADDITIVE_MIGRATIONS_TO_PREVIEW");
    expect(migration).toContain("backup_run_id:");
    expect(migration).toContain("environment: preview-backup");
    expect(migration).toContain('test "$GITHUB_REF" = "refs/heads/integration/preview-readiness-workerd-2026-11-15"');
    expect(migration).toContain('test "$(git rev-parse HEAD)" = "$GITHUB_SHA"');
    expect(migration).toContain("gh api");
    expect(migration).toContain("actions/download-artifact@v4");
    expect(migration).toContain(".conclusion");
    expect(migration).toContain(".head_sha");
  });

  it("requires exact database identities, migration histories and schema preconditions before applying", () => {
    expect(migration).toContain("7701427422680793119");
    expect(migration).toContain("7701425043360235551");
    expect(migration).toContain("HEAVIX_APP_PREVIEW_DATABASE_OID");
    expect(migration).toContain("HEAVIX_STORE_PREVIEW_DATABASE_OID");
    expect(migration).toContain("PGSSLMODE=verify-full");
    expect(migration).toContain("4|20261025081255_init_postgresql_baseline,20261025193000_add_auditlog_idempotency_key,20261112160000_add_selectable_hero_templates,20261114150000_product_model_attributes");
    expect(migration).toContain("2|0001_init_store_baseline,0002_add_audit_outbox");
    expect(migration).toContain("PASS: all 16 App Preview schema preconditions.");
    expect(migration).toContain("PASS: both Store Preview schema preconditions.");
    expect(migration).toContain("ProductModelAttribute");
    expect(migration).toContain("CompanyInvitation");
    expect(migration).toContain("PurchaseOrder");
  });

  it("applies both schemas independently and verifies exact final migration sets", () => {
    expect(migration).toContain("prisma migrate deploy --schema=prisma/schema.prisma");
    expect(migration).toContain("prisma migrate deploy --schema=prisma/store/schema.prisma");
    expect(migration).toContain("7|20261025081255_init_postgresql_baseline");
    expect(migration).toContain("0003_purchase_order_submitter");
    expect(migration).toContain("prisma migrate status --schema=prisma/schema.prisma");
    expect(migration).toContain("prisma migrate status --schema=prisma/store/schema.prisma");
    expect(migration).not.toMatch(/prisma\s+db\s+push|--accept-data-loss|migrate\s+reset/i);
    expect(migration).not.toMatch(/wrangler\s+deploy/i);
  });

  it("requires a recent encrypted paired backup with verified B2 read-back and restore proof", () => {
    expect(backup).toContain('test "$GITHUB_REF" = "refs/heads/integration/preview-readiness-workerd-2026-11-15"');
    expect(backup).toContain("default_transaction_read_only=on");
    expect(backup).toContain("pg_dump --serializable-deferrable");
    expect(backup).toContain("age -r");
    expect(backup).toContain("sha256sum -c ENCRYPTED_SHA256SUMS");
    expect(backup).toContain("pg_restore --exit-on-error");
    expect(backup).toContain("actions/upload-artifact@v4");
    expect(backup).toContain("heavix-preview-paired-backup-evidence");
  });

  it("keeps Workerd fingerprints and migration documentation aligned to both complete chains", () => {
    for (const name of [
      "20261112160000_add_selectable_hero_templates",
      "20261114150000_product_model_attributes",
      "20261116120000_industrial_marketplace_identity_core",
      "20261116130000_company_invitations",
      "20261118152000_link_listing_service_rfq",
    ]) {
      expect(proof).toContain(name);
      expect(migrationReadme).toContain(name);
    }
    expect(proof).toContain("0003_purchase_order_submitter");
    expect(migrationReadme).toContain("0003_purchase_order_submitter");
  });
});
