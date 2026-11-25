import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const read = (file: string) =>
  readFileSync(path.join(process.cwd(), file), "utf8");

describe("Preview catalog seed safety contract", () => {
  const workflow = read(".github/workflows/preview-activate-three-catalogs.yml");
  const backupWorkflow = read(".github/workflows/prisma-preview-backup-to-b2.yml");
  const legacyTaxonomySeed = read("prisma/seed-taxonomy-v11.ts");
  const transactionTypeSeed = read("prisma/seed-transaction-types.ts");
  const locationSeed = read("scripts/geospatial/seed-iran-location-catalog.ts");
  const technicalFormsSeed = read("prisma/seed-category-specific-attributes.ts");

  it("is manual-only and requires a successful, recent paired-backup run artifact", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).not.toMatch(/^\s*push:/m);
    expect(workflow).toContain("backup_run_id:");
    expect(workflow).toContain("run.conclusion !== \"success\"");
    expect(workflow).toContain("run.event !== \"workflow_dispatch\"");
    expect(workflow).toContain("run.head_branch !== \"integration/preview-readiness-workerd-2026-11-15\"");
    expect(workflow).toContain("72 * 60 * 60 * 1000");
    expect(workflow).toContain("listWorkflowRunArtifacts");
    expect(workflow).toContain("heavix-preview-paired-backup-evidence");
    expect(workflow).toContain("actions: read");
  });

  it("accepts only a backup-only run and checks the evidence artifact's run and SHA", () => {
    expect(backupWorkflow).toContain('echo "rbac_seed=$RBAC_SEED"');
    expect(backupWorkflow).toContain('echo "brand_seed=$BRAND_SEED"');
    expect(backupWorkflow).toContain('echo "model_name_migration=$MODEL_NAME_MIGRATION"');
    expect(workflow).toContain('grep -Fxq "rbac_seed=SKIP"');
    expect(workflow).toContain('grep -Fxq "brand_seed=SKIP"');
    expect(workflow).toContain('grep -Fxq "model_name_migration=SKIP"');
    expect(workflow).toContain('grep -Fxq "backup_run_id=$BACKUP_RUN_ID"');
    expect(workflow).toContain('grep -Fxq "backup_sha=$VERIFIED_BACKUP_SHA"');
  });

  it("uses isolated seeders with explicit approval rather than legacy taxonomy modes", () => {
    expect(workflow).toContain("prisma/seed-transaction-types.ts --apply");
    expect(workflow).toContain("prisma/seed-category-specific-attributes.ts --apply");
    expect(workflow).toContain("scripts/geospatial/seed-iran-location-catalog.ts --apply --confirm-preview-location-seed");
    expect(workflow).not.toContain("seed-taxonomy-v11.ts --apply --transaction-types-only");
    expect(workflow).not.toContain("seed-taxonomy-v11.ts --apply --locations-only");
    expect(transactionTypeSeed).toContain('HEAVIX_PREVIEW_TRANSACTION_TYPE_SEED_APPROVED !== "YES"');
    expect(technicalFormsSeed).toContain('HEAVIX_PREVIEW_TECHNICAL_FORMS_SEED_APPROVED !== "YES"');
    expect(workflow).toContain("HEAVIX_PREVIEW_TRANSACTION_TYPE_SEED_APPROVED: ${{ inputs.seed_transaction_types && 'YES' || 'NO' }}");
    expect(workflow).toContain("HEAVIX_PREVIEW_TECHNICAL_FORMS_SEED_APPROVED: ${{ inputs.seed_technical_forms && 'YES' || 'NO' }}");
    expect(workflow).toContain("HEAVIX_PREVIEW_LOCATION_SEED_APPROVED: ${{ inputs.seed_iran_locations && 'YES' || 'NO' }}");
  });

  it("keeps the location source rights gate and pins any permitted write to the exact Preview DB", () => {
    expect(locationSeed).toContain("rightsReviewStatus === \"APPROVED\"");
    expect(locationSeed).toContain("commercialUseAllowed === true");
    expect(locationSeed).toContain("HEAVIX_PREVIEW_LOCATION_SEED_APPROVED");
    expect(locationSeed).toContain("HEAVIX_ALLOW_PREVIEW_LOCATION_SEED");
    expect(locationSeed).toContain("assertPreviewLocationDatabaseIdentity");
    expect(locationSeed).toContain("HEAVIX_APP_PREVIEW_DATABASE_OID");
    expect(locationSeed).toContain("HEAVIX_EXPECTED_SYSTEM_IDENTIFIER");
  });

  it("fails closed when callers try to use legacy unguarded seed modes", () => {
    expect(legacyTaxonomySeed).toContain("The legacy TransactionType-only seed is disabled");
    expect(legacyTaxonomySeed).toContain("The legacy location-only seed is disabled");
    expect(legacyTaxonomySeed).toContain("scripts/geospatial/seed-iran-location-catalog.ts");
  });
});
