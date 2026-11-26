import { PrismaClient } from "@prisma/client";
import { assertPreviewReadOnlyTarget } from "../prisma/seed-preview-guard";

const db = new PrismaClient();

type ListingRow = {
  id: string;
  title: string;
  brandId: string | null;
  categoryId: string | null;
  modelId: string | null;
  modelName: string | null;
  model: { id: string; name: string; nameEn: string | null } | null;
};

type ProductRow = {
  id: string;
  canonicalName: string;
  brandId: string | null;
  categoryId: string;
  modelId: string | null;
  model: { id: string; name: string; nameEn: string | null } | null;
};

async function main() {
  await assertPreviewReadOnlyTarget(db);

  const [listings, products] = await Promise.all([
    db.listing.findMany({
      where: { productId: null },
      select: {
        id: true, title: true, brandId: true, categoryId: true,
        modelId: true, modelName: true,
        model: { select: { id: true, name: true, nameEn: true } },
      },
    }),
    db.product.findMany({
      where: { status: "ACTIVE" },
      select: {
        id: true, canonicalName: true, brandId: true, categoryId: true,
        modelId: true,
        model: { select: { id: true, name: true, nameEn: true } },
      },
    }),
  ]);

  const report = listings.map((listing: ListingRow) => {
    const candidates = products.filter((product: ProductRow) => {
      if (!listing.brandId || product.brandId !== listing.brandId) return false;
      if (listing.categoryId && product.categoryId !== listing.categoryId) return false;

      // Strongest evidence: both records point to the same canonical ProductModel.
      if (listing.modelId) return product.modelId === listing.modelId;

      // Fallback is exact model text only. Do not strip suffixes or punctuation.
      const entered = listing.modelName?.trim().toLocaleLowerCase();
      if (!entered || !product.model) return false;
      return entered === product.model.name.trim().toLocaleLowerCase() ||
        (!!product.model.nameEn && entered === product.model.nameEn.trim().toLocaleLowerCase());
    });

    return {
      listingId: listing.id,
      title: listing.title,
      brandId: listing.brandId,
      modelId: listing.modelId,
      modelName: listing.modelName,
      candidateProductIds: candidates.map((candidate: ProductRow) => candidate.id),
      disposition: candidates.length === 1 ? "UNIQUE_EXACT_CANDIDATE_REVIEW_ONLY" :
        candidates.length > 1 ? "AMBIGUOUS_REVIEW_REQUIRED" : "NO_EXACT_MATCH",
    };
  });

  const summary = {
    mode: "READ_ONLY_NO_LINKS_WRITTEN",
    listingCount: listings.length,
    uniqueExactCandidates: report.filter((row) => row.disposition === "UNIQUE_EXACT_CANDIDATE_REVIEW_ONLY").length,
    ambiguous: report.filter((row) => row.disposition === "AMBIGUOUS_REVIEW_REQUIRED").length,
    noExactMatch: report.filter((row) => row.disposition === "NO_EXACT_MATCH").length,
    rows: report,
  };
  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((error) => {
    console.error("Catalog listing-link audit failed:", error instanceof Error ? error.message : "unknown error");
    process.exitCode = 1;
  })
  .finally(async () => db.$disconnect());
