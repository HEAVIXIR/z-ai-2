/**
 * HEAVIX — read-only Preview audit for the machine taxonomy / technical-form dependency.
 *
 * Parses canonical TREE and templates from source files, verifies the exact
 * dedicated App Preview database, then inspects it inside a PostgreSQL READ ONLY
 * transaction. No application rows are written.
 */
import { PrismaClient } from "@prisma/client";
import ts from "typescript";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const db = new PrismaClient();
const reportPath = resolve(
  process.env.HEAVIX_TAXONOMY_AUDIT_REPORT ?? "artifacts/taxonomy-preview-audit.json",
);
const taxonomyPath = resolve("prisma/seed-machine-taxonomy.ts");
const formsPath = resolve("prisma/seed-category-specific-attributes.ts");
const legacyL1Slugs = [
  "forestry-machinery", "conveying", "drilling-rigs", "crushing-screening",
  "forklift-warehouse", "recycling", "port-machinery", "industrial-machinery",
  "special-machinery",
];

type CategoryRow = {
  id: string; parentId: string | null; slug: string; active: boolean;
  layer: string | null; domain: string | null; level: number | null; taxPath: string | null;
};

function extractSlugProperties(filePath: string, variableName: string): string[] {
  const sourceText = readFileSync(filePath, "utf8");
  const source = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let initializer: ts.Expression | undefined;
  const findVariable = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === variableName) {
      initializer = node.initializer;
      return;
    }
    if (!initializer) ts.forEachChild(node, findVariable);
  };
  findVariable(source);
  if (!initializer) throw new Error("Could not locate source declaration: " + variableName);

  const slugs = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (
      ts.isPropertyAssignment(node) &&
      ((ts.isIdentifier(node.name) && node.name.text === "slug") ||
        (ts.isStringLiteral(node.name) && node.name.text === "slug")) &&
      ts.isStringLiteralLike(node.initializer)
    ) slugs.add(node.initializer.text);
    ts.forEachChild(node, visit);
  };
  visit(initializer);
  return [...slugs].sort();
}

async function collectSubtree(tx: any, rootId: string): Promise<CategoryRow[]> {
  const rows: CategoryRow[] = [];
  let frontier = [rootId];
  const visited = new Set<string>(frontier);
  while (frontier.length) {
    const children: CategoryRow[] = await tx.category.findMany({
      where: { parentId: { in: frontier } },
      select: { id: true, parentId: true, slug: true, active: true, layer: true, domain: true, level: true, taxPath: true },
    });
    rows.push(...children);
    frontier = children.map((row) => row.id).filter((id) => !visited.has(id));
    frontier.forEach((id) => visited.add(id));
  }
  return rows;
}

function classifyCategory(row: CategoryRow | undefined, inMachinery: boolean): string {
  if (!row) return "missing";
  if (!row.active) return "inactive";
  if (row.layer !== "CATALOG") return "active_wrong_layer";
  return inMachinery ? "active_catalog_in_machinery" : "active_catalog_outside_machinery";
}

async function main() {
  const taxonomySlugs = extractSlugProperties(taxonomyPath, "TREE");
  const formSlugs = extractSlugProperties(formsPath, "templates");
  const taxonomySet = new Set(taxonomySlugs);
  const sharedSlugs = taxonomySlugs.filter((slug) => formSlugs.includes(slug));
  const formsOnly = formSlugs.filter((slug) => !taxonomySet.has(slug));
  const taxonomyOnly = taxonomySlugs.filter((slug) => !formSlugs.includes(slug));
  const report: Record<string, any> = {
    format: "heavix-preview-machine-taxonomy-audit-v1",
    generatedAt: new Date().toISOString(),
    status: "starting",
    readOnly: true,
    execution: {
      databaseTransaction: "PostgreSQL SET TRANSACTION READ ONLY",
      scriptMode: "audit-only",
      taxonomyApplyFlagUsed: false,
      categoryOrListingWrites: false,
      attributeWrites: false,
    },
    sourceCounts: {
      taxonomyTreeSlugs: taxonomySlugs.length,
      technicalFormTemplateSlugs: formSlugs.length,
      sharedSlugs: sharedSlugs.length,
      formsOnly: formsOnly.length,
      taxonomyOnly: taxonomyOnly.length,
    },
    sourceCrossReference: { sharedSlugs, formsOnly, taxonomyOnly },
  };

  try {
    const expectedSystem = process.env.HEAVIX_EXPECTED_PREVIEW_SYSTEM_IDENTIFIER;
    const expectedOid = process.env.HEAVIX_EXPECTED_PREVIEW_DATABASE_OID;
    if (!expectedSystem || !expectedOid || !/^[1-9][0-9]{0,9}$/.test(expectedOid)) {
      throw new Error("Exact Preview database identity secrets are required.");
    }

    const result = await db.$transaction(async (tx) => {
      // First statement: PostgreSQL rejects all writes for this transaction.
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      const identity = await tx.$queryRawUnsafe<Array<{
        database_name: string; database_oid: string; system_identifier: string;
      }>>(
        "SELECT current_database() AS database_name, " +
        "(SELECT oid::text FROM pg_database WHERE datname=current_database()) AS database_oid, " +
        "(SELECT system_identifier::text FROM pg_control_system()) AS system_identifier",
      );
      const actual = identity[0];
      if (!actual || actual.database_name !== "postgres" ||
          actual.database_oid !== expectedOid || actual.system_identifier !== expectedSystem) {
        throw new Error("Exact App Preview database identity mismatch; audit stopped.");
      }

      const root = await tx.category.findUnique({
        where: { slug: "machinery" },
        select: { id: true, parentId: true, slug: true, active: true, layer: true, domain: true, level: true, taxPath: true },
      }) as CategoryRow | null;
      const subtree = root ? await collectSubtree(tx, root.id) : [];
      const machineryIds = new Set([...(root ? [root.id] : []), ...subtree.map((row) => row.id)]);
      const allTargetSlugs = [...new Set([...taxonomySlugs, ...formSlugs])];
      const targetRows = await tx.category.findMany({
        where: { slug: { in: allTargetSlugs } },
        select: { id: true, parentId: true, slug: true, active: true, layer: true, domain: true, level: true, taxPath: true },
      }) as CategoryRow[];
      const categoryBySlug = new Map(targetRows.map((row) => [row.slug, row]));

      const toStatus = (slug: string) => {
        const row = categoryBySlug.get(slug);
        const inMachinery = !!row && machineryIds.has(row.id);
        const parentSlug = row?.parentId
          ? (targetRows.find((candidate) => candidate.id === row.parentId)?.slug ?? null)
          : null;
        return {
          slug,
          status: classifyCategory(row, inMachinery),
          inMachinerySubtree: inMachinery,
          ...(row ? {
            active: row.active, layer: row.layer, domain: row.domain,
            level: row.level, taxPath: row.taxPath, parentSlug,
          } : {}),
        };
      };

      const taxonomyStatus = taxonomySlugs.map(toStatus);
      const formStatus = formSlugs.map(toStatus);
      const externalCollisions = taxonomyStatus.filter((item) =>
        !!categoryBySlug.get(item.slug) && !machineryIds.has(categoryBySlug.get(item.slug)!.id),
      );
      const machineryListings = root
        ? await tx.listing.count({ where: { categoryId: { in: [...machineryIds] } } })
        : 0;

      const legacyRoots = await tx.category.findMany({
        where: { slug: { in: legacyL1Slugs } },
        select: { id: true, parentId: true, slug: true, active: true, layer: true, domain: true, level: true, taxPath: true },
      }) as CategoryRow[];
      const legacyBranches = [];
      for (const legacy of legacyRoots) {
        const descendants = await collectSubtree(tx, legacy.id);
        const branchIds = [legacy.id, ...descendants.map((row) => row.id)];
        const listings = await tx.listing.findMany({
          where: { categoryId: { in: branchIds } },
          select: { categoryId: true },
        });
        const slugById = new Map([legacy, ...descendants].map((row) => [row.id, row.slug]));
        const directListings = listings.filter((listing: { categoryId: string | null }) =>
          listing.categoryId === legacy.id).length;
        const unmappedCategorySlugs = [...new Set(
          listings
            .map((listing: { categoryId: string | null }) =>
              listing.categoryId ? slugById.get(listing.categoryId) : undefined)
            .filter((slug: string | undefined): slug is string => !!slug && !taxonomySet.has(slug)),
        )].sort();
        legacyBranches.push({
          slug: legacy.slug, active: legacy.active, totalListings: listings.length,
          directListings, unmappedCategorySlugs,
          safeForDeactivationPreflight: directListings === 0 && unmappedCategorySlugs.length === 0,
        });
      }

      const countStatuses = (items: Array<{ status: string }>) => items.reduce<Record<string, number>>(
        (counts, item) => {
          counts[item.status] = (counts[item.status] ?? 0) + 1;
          return counts;
        }, {},
      );
      return {
        databaseIdentity: {
          verified: true, databaseName: actual.database_name,
          databaseOidMatched: true, systemIdentifierMatched: true,
        },
        machineryRoot: root ? {
          found: true, active: root.active, layer: root.layer, domain: root.domain, level: root.level,
        } : { found: false },
        machinerySubtreeCategoryCount: machineryIds.size,
        listingsUnderMachinery: machineryListings,
        taxonomy: { countsByStatus: countStatuses(taxonomyStatus), categories: taxonomyStatus },
        technicalForms: { countsByStatus: countStatuses(formStatus), categories: formStatus },
        crossRootSlugCollisions: externalCollisions,
        legacyBranches,
        legacyBranchesWithDirectListings: legacyBranches.filter((item) => item.directListings > 0),
        legacyBranchesWithUnmappedListings: legacyBranches.filter((item) => item.unmappedCategorySlugs.length > 0),
      };
    }, { timeout: 120000, maxWait: 15000 });

    report.status = "completed";
    report.database = result;
    report.summary = {
      taxonomyMissingOrInactive: result.taxonomy.categories.filter(
        (item: { status: string }) => item.status === "missing" || item.status === "inactive").length,
      technicalFormsMissingOrInactive: result.technicalForms.categories.filter(
        (item: { status: string }) => item.status === "missing" || item.status === "inactive").length,
      technicalFormsReadyActiveCatalog: result.technicalForms.categories.filter(
        (item: { status: string }) => item.status.startsWith("active_catalog")).length,
      crossRootSlugCollisions: result.crossRootSlugCollisions.length,
      legacyBranchesWithListings: result.legacyBranches.filter(
        (item: { totalListings: number }) => item.totalListings > 0).length,
    };
    console.log(JSON.stringify(report.summary, null, 2));
    console.log("PASS: audit completed in a PostgreSQL READ ONLY transaction.");
  } catch (error) {
    report.status = "error";
    report.error = error instanceof Error ? error.message : String(error);
    console.error("FAIL: Preview taxonomy audit:", report.error);
    process.exitCode = 1;
  } finally {
    try {
      mkdirSync(dirname(reportPath), { recursive: true });
      writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n", { mode: 0o600 });
      console.log("Audit report written to " + reportPath);
    } catch (writeError) {
      console.error("Could not write audit report:", writeError);
      process.exitCode = 1;
    }
    await db.$disconnect();
  }
}

void main();
