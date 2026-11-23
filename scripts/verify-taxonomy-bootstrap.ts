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
    countries,
    provinces,
    cities,
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
    db.country.count(),
    db.province.count(),
    db.city.count(),
  ]);
  const activeTransactionKeys = new Set(
    (await db.transactionType.findMany({ where: { active: true }, select: { key: true } })).map((row) => row.key),
  );
  const excavator = await db.category.findUnique({
    where: { slug: "excavator" },
    select: { id: true, active: true },
  });
  const excavatorAttributeLinks = excavator
    ? await db.categoryAttribute.count({ where: { categoryId: excavator.id, active: true } })
    : 0;

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
    countries,
    provinces,
    cities,
    excavatorAttributeLinks,
  };
  console.log("HEAVIX taxonomy bootstrap counts:", JSON.stringify(counts, null, 2));

  const failures: string[] = [];
  const requiredTransactionKeys = ["SALE", "RENT", "WANTED", "QUOTE", "AUCTION", "SERVICE_REQUEST", "SERVICE_OFFER"];
  const missingTransactionKeys = requiredTransactionKeys.filter((key) => !activeTransactionKeys.has(key));
  if (missingTransactionKeys.length) failures.push(`missing active transaction types: ${missingTransactionKeys.join(", ")}`);
  if (transactionTypes < 7) failures.push("expected all 7 canonical transaction types");
  if (serviceTypes < 9) failures.push("expected at least 9 service types");
  if (industries < 16) failures.push("expected at least 16 application industries");
  if (categories < 539) failures.push("expected at least 539 categories to preserve the documented legacy taxonomy baseline");
  if (brands < 629) failures.push("expected at least 629 canonical brands; current demo/partial seeds are not a complete catalog");
  if (models < 35) failures.push("expected at least 35 seeded product models");
  if (attributes < 1) failures.push("expected dynamic attribute definitions");
  if (categoryAttributeLinks < 1) failures.push("expected category-specific attribute links");
  if (!countries) failures.push("expected at least 1 country");
  if (provinces < 31) failures.push("expected at least 31 seeded provinces");
  if (cities < 100) failures.push("expected at least 100 seeded cities");
  if (!excavator?.active) failures.push("expected an active excavator category");
  if (excavatorAttributeLinks < 5) failures.push("expected at least 5 active direct attribute links for excavator");
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
