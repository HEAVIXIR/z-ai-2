import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const LEVELS = ["countries", "provinces", "cities"];

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}
function key(value) {
  return clean(value).normalize("NFKC").toLocaleLowerCase("fa").replace(/[\u200c\s]+/g, " ");
}
function validCoordinatePair(record) {
  const hasLat = record.latitude !== null && record.latitude !== undefined && record.latitude !== "";
  const hasLon = record.longitude !== null && record.longitude !== undefined && record.longitude !== "";
  if (hasLat !== hasLon) return "latitude and longitude must be supplied together";
  if (!hasLat) return null;
  const lat = Number(record.latitude);
  const lon = Number(record.longitude);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) return "latitude must be a finite number in [-90, 90]";
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) return "longitude must be a finite number in [-180, 180]";
  return null;
}

/**
 * Validate a reviewed, normalized administrative dataset without connecting
 * to Prisma or any database. This module intentionally has no import/write path.
 * A checksum computed from the exact source bytes is mandatory for eligibility.
 */
export function validateLocationDataset(dataset, manifest, actualSha256) {
  const errors = [];
  const warnings = [];
  const counts = {};
  const seen = { countries: new Set(), provinces: new Set(), cities: new Set() };
  const names = { countries: new Set(), provinces: new Set(), cities: new Set() };
  const add = (path, message) => errors.push({ path, message });

  if (!dataset || typeof dataset !== "object" || Array.isArray(dataset)) {
    return { structurallyValid: false, importEligible: false, errors: [{ path: "$", message: "dataset must be an object" }], warnings, counts };
  }
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    add("manifest", "manifest must be an object");
  } else {
    if (!/^https:\/\//i.test(clean(manifest.sourceUrl))) add("manifest.sourceUrl", "an HTTPS source URL is required");
    for (const field of ["sourceName", "license", "sourceVersion", "sourceDate", "rightsReviewStatus"]) {
      if (!clean(manifest[field])) add(`manifest.${field}`, "required provenance field is missing");
    }
    if (clean(manifest.sourceDate) && !/^\d{4}-\d{2}-\d{2}$/.test(clean(manifest.sourceDate))) {
      add("manifest.sourceDate", "sourceDate must use YYYY-MM-DD format");
    }
    if (!/^[a-f0-9]{64}$/i.test(clean(manifest.sha256))) add("manifest.sha256", "expected SHA-256 must be 64 hexadecimal characters");
    if (!/^[a-f0-9]{64}$/i.test(clean(actualSha256))) {
      add("manifest.sha256", "actual SHA-256 of the exact dataset file bytes is required");
    } else if (clean(manifest.sha256).toLowerCase() !== actualSha256.toLowerCase()) {
      add("manifest.sha256", "dataset file checksum does not match the manifest");
    }
  }

  for (const level of LEVELS) {
    const rows = dataset[level];
    if (!Array.isArray(rows)) {
      add(level, "must be an array");
      counts[level] = 0;
      continue;
    }
    counts[level] = rows.length;
    if (rows.length === 0) add(level, "must contain at least one record");
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const path = `${level}[${i}]`;
      if (!row || typeof row !== "object" || Array.isArray(row)) {
        add(path, "record must be an object");
        continue;
      }
      const code = clean(row.sourceCode);
      const name = clean(row.name);
      if (!code) add(`${path}.sourceCode`, "stable sourceCode is required");
      if (!name) add(`${path}.name`, "name is required");
      if (code) {
        if (seen[level].has(code)) add(`${path}.sourceCode`, `duplicate sourceCode: ${code}`);
        seen[level].add(code);
      }
      if (name) {
        const parent = level === "countries" ? "" : clean(level === "provinces" ? row.countryCode : row.provinceCode);
        const nameKey = `${parent}::${key(name)}`;
        if (names[level].has(nameKey)) add(`${path}.name`, "duplicate normalized name under the same parent");
        names[level].add(nameKey);
      }
      if (level === "provinces") {
        if (!clean(row.countryCode)) add(`${path}.countryCode`, "countryCode is required");
        else if (!seen.countries.has(clean(row.countryCode))) add(`${path}.countryCode`, "countryCode does not reference a country in this dataset");
      }
      if (level === "cities") {
        if (!clean(row.provinceCode)) add(`${path}.provinceCode`, "provinceCode is required");
        else if (!seen.provinces.has(clean(row.provinceCode))) add(`${path}.provinceCode`, "provinceCode does not reference a province in this dataset");
      }
      if (level === "cities" || level === "provinces") {
        const coordinateError = validCoordinatePair(row);
        if (coordinateError) add(path, coordinateError);
      }
    }
  }

  if (dataset.counties !== undefined || dataset.districts !== undefined) {
    warnings.push("county/district records are intentionally not accepted as City records; model them as separate levels in a future schema change");
  }
  if (manifest && manifest.rightsReviewStatus !== "APPROVED") {
    warnings.push("rights review is not APPROVED; import eligibility remains false");
  }
  if (manifest && manifest.commercialUseAllowed !== true) {
    warnings.push("commercialUseAllowed must be explicitly true before import eligibility");
  }

  const structurallyValid = errors.length === 0;
  const importEligible = structurallyValid &&
    manifest?.rightsReviewStatus === "APPROVED" &&
    manifest?.commercialUseAllowed === true &&
    /^[a-f0-9]{64}$/i.test(clean(actualSha256)) &&
    clean(manifest?.sha256).toLowerCase() === actualSha256.toLowerCase();
  return { structurallyValid, importEligible, errors, warnings, counts };
}

export async function validateLocationDatasetFiles(datasetPath, manifestPath) {
  const [raw, manifestRaw] = await Promise.all([
    readFile(datasetPath),
    readFile(manifestPath, "utf8"),
  ]);
  const dataset = JSON.parse(raw.toString("utf8"));
  const manifest = JSON.parse(manifestRaw);
  const actualSha256 = createHash("sha256").update(raw).digest("hex");
  return validateLocationDataset(dataset, manifest, actualSha256);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args.some((arg) => arg.startsWith("-"))) {
    process.stderr.write("Usage: node scripts/geospatial/validate-location-dataset.mjs <dataset.json> <manifest.json>\n");
    process.exitCode = 2;
  } else {
    try {
      const report = await validateLocationDatasetFiles(args[0], args[1]);
      process.stdout.write(JSON.stringify({ mode: "DRY_RUN_ONLY", ...report }, null, 2) + "\n");
      if (!report.structurallyValid) process.exitCode = 1;
    } catch (error) {
      process.stderr.write(`Validation failed: ${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    }
  }
}
