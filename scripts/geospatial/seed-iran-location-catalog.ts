import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";

type CountryRow = {
  sourceCode: string;
  name: string;
  nameEn: string | null;
  phoneCode: string | null;
  sortOrder: number;
};
type ProvinceRow = {
  sourceCode: string;
  sourceId: number | string;
  name: string;
  nameEn: string | null;
  countryCode: string;
  sortOrder: number;
};
type CityRow = {
  sourceCode: string;
  name: string;
  nameEn: string | null;
  provinceCode: string;
  sortOrder: number;
};
type LocationDataset = {
  schemaVersion: number;
  countries: CountryRow[];
  provinces: ProvinceRow[];
  cities: CityRow[];
  metadata: {
    sourceCityRecordCount: number;
    distinctCityCount: number;
    duplicateNamesCollapsed: number;
  };
};
type LocationManifest = {
  sha256: string;
  countries: number;
  provinces: number;
  distinctCities: number;
  rightsReviewStatus: string;
  commercialUseAllowed: boolean;
};

export type LocationSeedPlan = {
  datasetSha256: string;
  countryCount: number;
  provinceCount: number;
  cityCount: number;
  sourceCityRecordCount: number;
  duplicateNamesCollapsed: number;
  seedAllowed: boolean;
  rightsReviewStatus: string;
  commercialUseAllowed: boolean;
  destructiveOperations: false;
};

export function buildIranLocationSeedPlan(
  dataset: LocationDataset,
  manifest: LocationManifest,
  datasetBytes: Uint8Array,
): LocationSeedPlan {
  const actualSha256 = createHash("sha256").update(datasetBytes).digest("hex");
  if (actualSha256 !== manifest.sha256) {
    throw new Error("Location dataset SHA-256 does not match the committed manifest.");
  }
  if (dataset.schemaVersion !== 1) throw new Error("Unsupported location dataset schemaVersion.");
  if (dataset.countries.length !== 1 || manifest.countries !== 1) {
    throw new Error("Iran location seed requires exactly one country.");
  }
  if (dataset.provinces.length !== 31 || manifest.provinces !== 31) {
    throw new Error("Iran location seed requires exactly 31 provinces.");
  }
  if (dataset.cities.length !== 1479 || manifest.distinctCities !== 1479) {
    throw new Error("Iran location seed requires exactly 1,479 distinct cities.");
  }
  if (dataset.metadata.sourceCityRecordCount !== 1481 ||
      dataset.metadata.distinctCityCount !== 1479 ||
      dataset.metadata.duplicateNamesCollapsed !== 2) {
    throw new Error("Location dataset source-count metadata is inconsistent.");
  }

  const country = dataset.countries[0];
  if (country.sourceCode !== "IR" || country.name !== "ایران") {
    throw new Error("The canonical country row must be Iran (IR).");
  }
  const countryCodes = new Set(dataset.countries.map((row) => row.sourceCode));
  if (countryCodes.size !== dataset.countries.length) throw new Error("Duplicate country sourceCode.");

  const provinceCodes = new Set<string>();
  for (const province of dataset.provinces) {
    if (!province.sourceCode || !province.name || !countryCodes.has(province.countryCode)) {
      throw new Error(`Invalid province row: ${province.sourceCode || province.name}`);
    }
    if (provinceCodes.has(province.sourceCode)) {
      throw new Error(`Duplicate province sourceCode: ${province.sourceCode}`);
    }
    provinceCodes.add(province.sourceCode);
  }

  const cityCodes = new Set<string>();
  const cityNames = new Set<string>();
  for (const city of dataset.cities) {
    if (!city.sourceCode || !city.name.trim() || !provinceCodes.has(city.provinceCode)) {
      throw new Error(`Invalid city row or missing province reference: ${city.sourceCode || city.name}`);
    }
    if (cityCodes.has(city.sourceCode)) throw new Error(`Duplicate city sourceCode: ${city.sourceCode}`);
    cityCodes.add(city.sourceCode);
    const composite = `${city.provinceCode}\u0000${city.name}`;
    if (cityNames.has(composite)) throw new Error(`Duplicate city name in province: ${city.name}`);
    cityNames.add(composite);
  }

  return {
    datasetSha256: actualSha256,
    countryCount: dataset.countries.length,
    provinceCount: dataset.provinces.length,
    cityCount: dataset.cities.length,
    sourceCityRecordCount: dataset.metadata.sourceCityRecordCount,
    duplicateNamesCollapsed: dataset.metadata.duplicateNamesCollapsed,
    seedAllowed: manifest.rightsReviewStatus === "APPROVED" && manifest.commercialUseAllowed === true,
    rightsReviewStatus: manifest.rightsReviewStatus,
    commercialUseAllowed: manifest.commercialUseAllowed,
    destructiveOperations: false,
  };
}

export function assertPreviewLocationSeedApproval(
  plan: LocationSeedPlan,
  env: Record<string, string | undefined>,
  args: string[],
): void {
  if (!args.includes("--apply")) throw new Error("Apply flag is required.");
  if (!args.includes("--confirm-preview-location-seed")) {
    throw new Error("Explicit --confirm-preview-location-seed confirmation is required.");
  }
  if (env.HEAVIX_ENV !== "preview") {
    throw new Error("Location catalog writes are restricted to HEAVIX_ENV=preview.");
  }
  if (env.HEAVIX_ALLOW_PREVIEW_LOCATION_SEED !== "1") {
    throw new Error("HEAVIX_ALLOW_PREVIEW_LOCATION_SEED=1 is required.");
  }
  if (!plan.seedAllowed) {
    throw new Error("Location catalog import is blocked until manifest rights review is APPROVED and commercialUseAllowed=true.");
  }
}

export async function applyIranLocationSeed(
  db: PrismaClient,
  dataset: LocationDataset,
): Promise<{ countriesUpdated: number; provincesCreated: number; provincesUpdated: number; citiesCreated: number; citiesUpdated: number }> {
  return db.$transaction(async (tx) => {
    const countryMatches = await tx.country.findMany({
      where: { OR: [{ code: "IR" }, { name: "ایران" }] },
      select: { id: true, code: true, name: true },
    });
    if (countryMatches.length > 1) {
      throw new Error("More than one existing country matches Iran by code/name; refusing ambiguous reconciliation.");
    }
    const countryData = dataset.countries[0];
    const country = countryMatches[0]
      ? await tx.country.update({
          where: { id: countryMatches[0].id },
          data: {
            name: countryData.name,
            nameEn: countryData.nameEn ?? undefined,
            code: "IR",
            phoneCode: countryData.phoneCode ?? undefined,
            sortOrder: countryData.sortOrder,
          },
        })
      : await tx.country.create({
          data: {
            name: countryData.name,
            nameEn: countryData.nameEn,
            code: "IR",
            phoneCode: countryData.phoneCode,
            sortOrder: countryData.sortOrder,
          },
        });

    const provinceCodes = dataset.provinces.map((row) => row.sourceCode);
    const existingProvinces = await tx.province.findMany({
      where: { OR: [{ countryId: country.id }, { sourceCode: { in: provinceCodes } }] },
      select: { id: true, countryId: true, name: true, sourceCode: true },
    });
    const provinceByCode = new Map(existingProvinces.filter((row) => row.sourceCode).map((row) => [row.sourceCode as string, row]));
    const provinceByName = new Map(existingProvinces.filter((row) => row.countryId === country.id).map((row) => [row.name, row]));
    const provinceIdByCode = new Map<string, string>();
    let provincesCreated = 0;
    let provincesUpdated = 0;

    for (const row of dataset.provinces) {
      const byCode = provinceByCode.get(row.sourceCode);
      const byName = provinceByName.get(row.name);
      if (byCode && byCode.countryId !== country.id) {
        throw new Error(`Province sourceCode ${row.sourceCode} is already attached to a different country.`);
      }
      if (byCode && byName && byCode.id !== byName.id) {
        throw new Error(`Province ${row.name} has conflicting sourceCode and name matches.`);
      }
      const existing = byCode ?? byName;
      const data = {
        countryId: country.id,
        name: row.name,
        ...(row.nameEn ? { nameEn: row.nameEn } : {}),
        sourceCode: row.sourceCode,
        sortOrder: row.sortOrder,
      };
      const province = existing
        ? await tx.province.update({ where: { id: existing.id }, data })
        : await tx.province.create({ data });
      if (existing) provincesUpdated += 1;
      else provincesCreated += 1;
      provinceIdByCode.set(row.sourceCode, province.id);
      provinceByCode.set(row.sourceCode, province);
      provinceByName.set(row.name, province);
    }

    const targetProvinceIds = [...provinceIdByCode.values()];
    const cityCodes = dataset.cities.map((row) => row.sourceCode);
    const existingCities = await tx.city.findMany({
      where: { OR: [{ provinceId: { in: targetProvinceIds } }, { sourceCode: { in: cityCodes } }] },
      select: { id: true, provinceId: true, name: true, sourceCode: true },
    });
    const cityByCode = new Map(existingCities.filter((row) => row.sourceCode).map((row) => [row.sourceCode as string, row]));
    const cityByProvinceAndName = new Map(
      existingCities.map((row) => [`${row.provinceId}\u0000${row.name}`, row]),
    );
    let citiesCreated = 0;
    let citiesUpdated = 0;

    for (const row of dataset.cities) {
      const provinceId = provinceIdByCode.get(row.provinceCode);
      if (!provinceId) throw new Error(`Missing resolved province id for ${row.provinceCode}`);
      const byCode = cityByCode.get(row.sourceCode);
      const byName = cityByProvinceAndName.get(`${provinceId}\u0000${row.name}`);
      if (byCode && byCode.provinceId !== provinceId) {
        throw new Error(`City sourceCode ${row.sourceCode} is already attached to a different province.`);
      }
      if (byCode && byName && byCode.id !== byName.id) {
        throw new Error(`City ${row.name} has conflicting sourceCode and province/name matches.`);
      }
      const existing = byCode ?? byName;
      const data = {
        provinceId,
        name: row.name,
        ...(row.nameEn ? { nameEn: row.nameEn } : {}),
        sourceCode: row.sourceCode,
        sortOrder: row.sortOrder,
      };
      const city = existing
        ? await tx.city.update({ where: { id: existing.id }, data })
        : await tx.city.create({ data: { ...data, latitude: null, longitude: null } });
      if (existing) citiesUpdated += 1;
      else citiesCreated += 1;
      cityByCode.set(row.sourceCode, city);
      cityByProvinceAndName.set(`${provinceId}\u0000${row.name}`, city);
    }

    return {
      countriesUpdated: countryMatches.length ? 1 : 0,
      provincesCreated,
      provincesUpdated,
      citiesCreated,
      citiesUpdated,
    };
  }, { maxWait: 10_000, timeout: 120_000 });
}

async function main() {
  const datasetPath = resolve(process.cwd(), "prisma/data/iran-locations-1404.json");
  const manifestPath = resolve(process.cwd(), "prisma/data/iran-locations-1404.manifest.json");
  const datasetBytes = readFileSync(datasetPath);
  const dataset = JSON.parse(datasetBytes.toString("utf8")) as LocationDataset;
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as LocationManifest;
  const plan = buildIranLocationSeedPlan(dataset, manifest, datasetBytes);
  const args = process.argv.slice(2);

  if (!args.includes("--apply")) {
    console.log(JSON.stringify({
      mode: "DRY_RUN",
      plan,
      databaseConnected: false,
      writesPerformed: false,
      note: "No database connection was opened. Apply is disabled by default.",
    }, null, 2));
    return;
  }

  assertPreviewLocationSeedApproval(plan, process.env, args);
  const db = new PrismaClient();
  try {
    const result = await applyIranLocationSeed(db, dataset);
    console.log(JSON.stringify({
      mode: "PREVIEW_APPLIED",
      plan,
      result,
      deletesPerformed: 0,
    }, null, 2));
  } finally {
    await db.$disconnect();
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
