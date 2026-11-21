import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const SOURCE_PATH = resolve(ROOT, "prisma/data/iran-cities-1404.json");
const DATASET_PATH = resolve(ROOT, "prisma/data/iran-locations-1404.json");
const MANIFEST_PATH = resolve(ROOT, "prisma/data/iran-locations-1404.manifest.json");

const EXPECTED = { provinces: 31, sourceCityRecords: 1481, distinctCities: 1479, duplicatesCollapsed: 2 };

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const gitBlobSha = (bytes) => createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
const cityCode = (provinceSourceId, name) =>
  `IR-CITY-${provinceSourceId}-${Array.from(name).map((char) => char.codePointAt(0).toString(16)).join("-")}`;

export function buildIranLocationCatalog(sourceBytes) {
  const raw = Buffer.from(sourceBytes);
  const source = JSON.parse(raw.toString("utf8"));
  if (source.source !== "sajaddp/list-of-cities-in-Iran") throw new Error("Unexpected Iran city catalog source");
  if (source.datasetVersion !== "3.1.2" || source.officialSourceYear !== 1404) {
    throw new Error("Unexpected Iran city catalog version/year");
  }
  if (!Array.isArray(source.provinces) || source.provinces.length !== EXPECTED.provinces) {
    throw new Error(`Expected ${EXPECTED.provinces} provinces`);
  }
  if (source.sourceCityRecordCount !== EXPECTED.sourceCityRecords ||
      source.cityCount !== EXPECTED.distinctCities ||
      source.duplicateNamesCollapsed !== EXPECTED.duplicatesCollapsed) {
    throw new Error("Source city counts changed; review the source update before regeneration");
  }

  const provinceIds = new Set();
  const provinceCodes = new Set();
  const provinces = source.provinces.map((province, index) => {
    if (!Number.isInteger(province.sourceId) || provinceIds.has(province.sourceId)) {
      throw new Error(`Missing or duplicate province sourceId at index ${index}`);
    }
    if (typeof province.name !== "string" || !province.name.trim() || !Array.isArray(province.cities)) {
      throw new Error(`Malformed province record at index ${index}`);
    }
    provinceIds.add(province.sourceId);
    const sourceCode = `IR-PROV-${province.sourceId}`;
    provinceCodes.add(sourceCode);
    return {
      sourceCode,
      sourceId: province.sourceId,
      name: province.name,
      nameEn: null,
      countryCode: "IR",
      sortOrder: index + 1,
      cityCount: province.cities.length,
    };
  });

  const cities = [];
  const cityCodes = new Set();
  for (const province of source.provinces) {
    for (let index = 0; index < province.cities.length; index++) {
      const name = province.cities[index];
      if (typeof name !== "string" || !name.trim()) {
        throw new Error(`Empty city name in province sourceId ${province.sourceId}`);
      }
      const sourceCode = cityCode(province.sourceId, name);
      if (cityCodes.has(sourceCode)) throw new Error(`Duplicate deterministic city sourceCode: ${sourceCode}`);
      cityCodes.add(sourceCode);
      cities.push({
        sourceCode,
        name,
        nameEn: null,
        provinceCode: `IR-PROV-${province.sourceId}`,
        sourceProvinceId: province.sourceId,
        sortOrder: index + 1,
      });
    }
  }
  if (cities.length !== EXPECTED.distinctCities) {
    throw new Error(`Expected ${EXPECTED.distinctCities} distinct cities; found ${cities.length}`);
  }
  if (provinces.some((province) => !provinceCodes.has(province.sourceCode)) ||
      cities.some((city) => !provinceCodes.has(city.provinceCode))) {
    throw new Error("Orphaned province reference in normalized city catalog");
  }

  const dataset = {
    schemaVersion: 1,
    countries: [{
      sourceCode: "IR",
      sourceId: "IR",
      name: "ایران",
      nameEn: "Iran",
      phoneCode: "+98",
      sortOrder: 1,
    }],
    provinces,
    cities,
    metadata: {
      source: source.source,
      sourceUrl: source.sourceUrl,
      sourceVersion: source.datasetVersion,
      officialSourceYear: source.officialSourceYear,
      sourceCityRecordCount: source.sourceCityRecordCount,
      distinctCityCount: source.cityCount,
      duplicateNamesCollapsed: source.duplicateNamesCollapsed,
      provinceCount: provinces.length,
      generatedFrom: "prisma/data/iran-cities-1404.json",
      excludedLevels: ["county", "district", "ruralDistrict", "village", "urbanZone"],
      sourceLicense: "GPL-3.0",
    },
  };

  const datasetBytes = Buffer.from(JSON.stringify(dataset, null, 2) + "\n", "utf8");
  const manifest = {
    datasetFile: "iran-locations-1404.json",
    sha256: sha256(datasetBytes),
    sourceFile: "prisma/data/iran-cities-1404.json",
    sourceBlobSha: gitBlobSha(raw),
    sourceUrl: source.sourceUrl,
    sourceVersion: source.datasetVersion,
    officialSourceYear: source.officialSourceYear,
    sourceLicense: "GPL-3.0",
    sourceRecords: source.sourceCityRecordCount,
    distinctCities: cities.length,
    provinces: provinces.length,
    countries: 1,
    normalization: "Country → Province → City; county/district/village records are not modeled or exposed",
    duplicatePolicy: "Two same-name records in the same province were collapsed by the source snapshot to fit the existing province/name unique key.",
    rightsReviewStatus: "PENDING",
    commercialUseAllowed: false,
  };
  const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2) + "\n", "utf8");
  return { dataset, manifest, datasetBytes, manifestBytes };
}

async function main() {
  const mode = process.argv[2];
  if (mode !== "--check" && mode !== "--write") {
    throw new Error("Usage: node scripts/geospatial/build-iran-location-catalog.mjs --check|--write");
  }
  const sourceBytes = await readFile(SOURCE_PATH);
  const generated = buildIranLocationCatalog(sourceBytes);
  if (mode === "--check") {
    const [currentDataset, currentManifest] = await Promise.all([
      readFile(DATASET_PATH),
      readFile(MANIFEST_PATH),
    ]);
    if (!currentDataset.equals(generated.datasetBytes) || !currentManifest.equals(generated.manifestBytes)) {
      throw new Error("Canonical Iran location catalog is stale; run with --write and review the diff");
    }
    process.stdout.write("OK: canonical Iran location catalog and manifest are deterministic and current.\n");
    return;
  }
  await Promise.all([
    writeFile(DATASET_PATH, generated.datasetBytes),
    writeFile(MANIFEST_PATH, generated.manifestBytes),
  ]);
  process.stdout.write(JSON.stringify({
    mode: "FILE_GENERATION_ONLY_NO_DATABASE_WRITE",
    countries: generated.dataset.countries.length,
    provinces: generated.dataset.provinces.length,
    cities: generated.dataset.cities.length,
    sha256: generated.manifest.sha256,
    rightsReviewStatus: generated.manifest.rightsReviewStatus,
  }, null, 2) + "\n");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    process.stderr.write(`Location catalog generation failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
