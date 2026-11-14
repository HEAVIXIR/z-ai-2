import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const [
    transactionTypes,
    serviceTypes,
    industries,
    categories,
    brands,
    models,
    attributes,
    categoryAttributeLinks,
    brandCategoryLinks,
    services,
    modelAttributeTable,
  ] = await Promise.all([
    db.transactionType.count(),
    db.serviceType.count(),
    db.applicationIndustry.count(),
    db.category.count(),
    db.brand.count(),
    db.productModel.count(),
    db.attributeDefinition.count(),
    db.categoryAttribute.count(),
    db.brandCategory.count(),
    db.service.count(),
    // This also proves the additive ProductModelAttribute migration is present.
    db.productModelAttribute.count(),
  ]);

  const counts = {
    transactionTypes,
    serviceTypes,
    industries,
    categories,
    brands,
    models,
    attributes,
    categoryAttributeLinks,
    brandCategoryLinks,
    services,
    modelAttributeTable,
  };
  console.log("HEAVIX taxonomy bootstrap counts:", JSON.stringify(counts, null, 2));

  const failures: string[] = [];
  if (transactionTypes < 6) failures.push("expected at least 6 transaction types");
  if (serviceTypes < 9) failures.push("expected at least 9 service types");
  if (industries < 16) failures.push("expected at least 16 application industries");
  if (categories < 539) failures.push("expected at least 539 categories to preserve the documented legacy taxonomy baseline");
  if (brands < 629) failures.push("expected at least 629 canonical brands; current demo/partial seeds are not a complete catalog");
  if (models < 35) failures.push("expected at least 35 seeded product models");
  if (attributes < 1) failures.push("expected dynamic attribute definitions");
  if (categoryAttributeLinks < 1) failures.push("expected category-specific attribute links");
  if (brandCategoryLinks < 1) failures.push("expected brand/category links");
  if (services < 12) failures.push("expected at least 12 service catalog entries");
  if (failures.length) {
    throw new Error("Taxonomy bootstrap verification failed: " + failures.join("; "));
  }
}

main()
  .catch((error) => {
    console.error("Taxonomy bootstrap verification failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
