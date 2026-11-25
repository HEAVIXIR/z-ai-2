import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) =>
  readFileSync(path.join(process.cwd(), file), "utf8");

/**
 * Phase K regression test — Preview #346 root cause.
 *
 * The Integration Preview HTTP 500 is caused by a schema drift: the Prisma
 * schema (`prisma/schema.prisma` + `prisma/preview-schema.prisma`) declares
 * `Listing.serviceTypeId` and `RFQ.listingId`, but the Preview DB hasn't had
 * the migration `20261118152000_link_listing_service_rfq` applied. When the
 * homepage queries Listing rows, Prisma selects `serviceTypeId` (per the
 * generated client) and PostgreSQL returns SQLSTATE 42703 (column not found).
 *
 * The migration file EXISTS and is additive (ADD COLUMN + FK + INDEX). The
 * workflow to apply it (`app-preview-single-migration.yml`, PR #347) is
 * open but NOT merged. The fix requires:
 * 1. PR #347 merge (makes the workflow available on Integration).
 * 2. Workflow dispatch with confirm=APPLY_APP_PREVIEW_20261118152000.
 * 3. The backup/restore gate (environment: preview-backup) must be cleared.
 *
 * This test pins the migration's existence + schema alignment so the fix
 * path is not lost.
 */
describe("Phase K — Preview #346 schema drift regression", () => {
  it("the serviceTypeId migration file exists", () => {
    const migrationDir = "prisma/migrations/20261118152000_link_listing_service_rfq";
    expect(existsSync(path.join(process.cwd(), migrationDir, "migration.sql"))).toBe(true);
  });

  it("the migration adds serviceTypeId to Listing", () => {
    const sql = read("prisma/migrations/20261118152000_link_listing_service_rfq/migration.sql");
    expect(sql).toContain('ADD COLUMN "serviceTypeId"');
    expect(sql).toContain('ALTER TABLE "Listing"');
    expect(sql).toContain('Listing_serviceTypeId_fkey');
  });

  it("the migration adds listingId to RFQ", () => {
    const sql = read("prisma/migrations/20261118152000_link_listing_service_rfq/migration.sql");
    expect(sql).toContain('ADD COLUMN "listingId"');
    expect(sql).toContain('ALTER TABLE "RFQ"');
    expect(sql).toContain('RFQ_listingId_key');
  });

  it("schema.prisma declares serviceTypeId on Listing", () => {
    const schema = read("prisma/schema.prisma");
    expect(schema).toContain("serviceTypeId");
    const listingBlock = schema.split("model Listing {")[1]?.split("}")[0] ?? "";
    expect(listingBlock).toContain("serviceTypeId");
    expect(listingBlock).toContain("@@index([serviceTypeId])");
  });

  it("preview-schema.prisma declares serviceTypeId on Listing", () => {
    const schema = read("prisma/preview-schema.prisma");
    expect(schema).toContain("serviceTypeId");
  });

  it("the guarded migration workflow exists (PR #347)", () => {
    const workflow = read(".github/workflows/app-preview-single-migration.yml");
    expect(workflow).toContain("APPLY_APP_PREVIEW_20261118152000");
    expect(workflow).toContain("preview-backup");
    expect(workflow).toContain("backup-restore-and-migrate");
  });

  it("the migration is additive (no destructive operations)", () => {
    const sql = read("prisma/migrations/20261118152000_link_listing_service_rfq/migration.sql");
    // The migration must be additive only — no DROP, DELETE, or TRUNCATE.
    expect(sql).not.toMatch(/DROP\s+(TABLE|COLUMN|INDEX)/i);
    expect(sql).not.toMatch(/DELETE\s+FROM/i);
    expect(sql).not.toMatch(/TRUNCATE/i);
    // It must add columns + create indexes + add FKs.
    expect(sql).toMatch(/ADD COLUMN/gi);
    expect(sql).toMatch(/CREATE INDEX/gi);
    expect(sql).toMatch(/FOREIGN KEY/gi);
  });
});
