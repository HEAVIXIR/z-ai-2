import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const TYPES = { country: 0, province: 1, county: 2, district: 3, ruralDistrict: 4, city: 5, village: 6, urbanZone: 7 };

function parseCsv(text) {
  const input = text.replace(/^\uFEFF/, "");
  const firstLine = input.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = [",", ";", "\t"].map((d) => ({ d, n: [...firstLine].filter((c) => c === d).length }))
    .sort((a, b) => b.n - a.n)[0]?.d ?? ",";
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (quoted) {
      if (c === '"' && input[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field.length === 0) quoted = true;
    else if (c === delimiter) { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = ""; }
    else field += c;
  }
  if (quoted) throw new Error("CSV contains an unterminated quoted field");
  if (field.length || row.length) { row.push(field.replace(/\r$/, "")); rows.push(row); }
  const headers = (rows.shift() ?? []).map((x) => x.trim());
  if (!headers.length || new Set(headers).size !== headers.length) throw new Error("CSV headers are missing or duplicated");
  return rows.filter((r) => r.some((v) => v !== "")).map((values, index) => {
    if (values.length !== headers.length) throw new Error(`CSV row ${index + 2} has ${values.length} fields; expected ${headers.length}`);
    return Object.fromEntries(headers.map((h, i) => [h, values[i]]));
  });
}

const requiredHeaders = ["Id", "ParentCountryDivisionId", "Name", "Code", "DivisionType"];
const nonempty = (v) => String(v ?? "").trim();

export function convertIranDivisionsCsv(csvText) {
  const rows = parseCsv(csvText);
  if (!rows.length) throw new Error("CSV contains no data rows");
  for (const header of requiredHeaders) {
    if (!(header in rows[0])) throw new Error(`Required CSV column is missing: ${header}`);
  }
  const byId = new Map();
  for (const row of rows) {
    const id = nonempty(row.Id);
    if (!id) throw new Error("A source row has an empty Id");
    if (byId.has(id)) throw new Error(`Duplicate source Id: ${id}`);
    const type = Number(row.DivisionType);
    if (!Number.isInteger(type) || !Object.values(TYPES).includes(type)) throw new Error(`Invalid DivisionType for source Id ${id}`);
    if (!nonempty(row.Name) || !nonempty(row.Code)) throw new Error(`Missing Name or Code for source Id ${id}`);
    byId.set(id, { ...row, Id: id, DivisionType: type });
  }

  const expectedParentType = new Map([[1, 0], [2, 1], [3, 2], [4, 3], [5, 3], [6, 4], [7, 5]]);
  for (const row of byId.values()) {
    if (row.DivisionType === TYPES.country) {
      if (nonempty(row.ParentCountryDivisionId)) throw new Error(`Country ${row.Id} must not have a parent`);
      continue;
    }
    const parentId = nonempty(row.ParentCountryDivisionId);
    const parent = byId.get(parentId);
    if (!parent) throw new Error(`Source row ${row.Id} has missing parent ${parentId || "(empty)"}`);
    if (parent.DivisionType !== expectedParentType.get(row.DivisionType)) {
      throw new Error(`Source row ${row.Id} has invalid parent type ${parent.DivisionType} for DivisionType ${row.DivisionType}`);
    }
  }

  const countries = [], provinces = [], cities = [];
  const countryById = new Map(), provinceById = new Map();
  for (const row of byId.values()) {
    if (row.DivisionType === TYPES.country) {
      const item = { sourceCode: `country:${row.Code}`, sourceId: row.Id, sourceDivisionType: 0, sourceParentId: null, sourceCodeRaw: row.Code, name: row.Name };
      countries.push(item); countryById.set(row.Id, item);
    }
  }
  if (countries.length !== 1) throw new Error(`Expected exactly one country row; found ${countries.length}`);

  for (const row of byId.values()) {
    if (row.DivisionType !== TYPES.province) continue;
    const parent = byId.get(nonempty(row.ParentCountryDivisionId));
    if (!parent || parent.DivisionType !== TYPES.country) throw new Error(`Province ${row.Id} does not reference a country`);
    const item = { sourceCode: `province:${row.Code}`, sourceId: row.Id, sourceDivisionType: 1, sourceParentId: parent.Id, sourceCodeRaw: row.Code, name: row.Name, countryCode: countryById.get(parent.Id).sourceCode };
    provinces.push(item); provinceById.set(row.Id, item);
  }

  for (const row of byId.values()) {
    if (row.DivisionType !== TYPES.city) continue;
    let parent = byId.get(nonempty(row.ParentCountryDivisionId));
    const lineage = [];
    const visited = new Set([row.Id]);
    let province = null;
    while (parent) {
      if (visited.has(parent.Id)) throw new Error(`Cycle in parent chain at source Id ${parent.Id}`);
      visited.add(parent.Id);
      lineage.push({ id: parent.Id, code: parent.Code, divisionType: parent.DivisionType, name: parent.Name });
      if (parent.DivisionType === TYPES.province) { province = provinceById.get(parent.Id); break; }
      if (![TYPES.district, TYPES.county, TYPES.country].includes(parent.DivisionType)) {
        throw new Error(`Unexpected parent type ${parent.DivisionType} in city ancestry for ${row.Id}`);
      }
      parent = byId.get(nonempty(parent.ParentCountryDivisionId));
    }
    if (!province) throw new Error(`City ${row.Id} has no resolvable province ancestor`);
    cities.push({
      sourceCode: `city:${row.Code}`, sourceId: row.Id, sourceDivisionType: 5,
      sourceParentId: nonempty(row.ParentCountryDivisionId), sourceCodeRaw: row.Code,
      sourceAncestry: lineage, name: row.Name, provinceCode: province.sourceCode,
    });
  }

  const assertUnique = (items, level) => {
    const seen = new Set();
    for (const item of items) {
      if (seen.has(item.sourceCode)) throw new Error(`Duplicate canonical ${level} sourceCode: ${item.sourceCode}`);
      seen.add(item.sourceCode);
    }
  };
  assertUnique(countries, "country"); assertUnique(provinces, "province"); assertUnique(cities, "city");
  if (provinces.length !== 31) throw new Error(`Expected 31 provinces; found ${provinces.length}`);
  if (cities.length !== 1481) throw new Error(`Expected 1,481 cities; found ${cities.length}`);

  return {
    dataset: { countries, provinces, cities },
    sourceCounts: Object.fromEntries(Object.entries(TYPES).map(([name, type]) => [name, rows.filter((r) => Number(r.DivisionType) === type).length])),
    totalSourceRows: rows.length,
  };
}

async function main() {
  const [inputPath, outputDir, sourceDate] = process.argv.slice(2);
  if (!inputPath || !outputDir || !/^\d{4}-\d{2}-\d{2}$/.test(sourceDate ?? "")) {
    throw new Error("Usage: node scripts/geospatial/convert-iran-divisions.mjs <iran.csv> <output-dir> <source-date-YYYY-MM-DD>");
  }
  const raw = await readFile(inputPath);
  const sourceSha256 = createHash("sha256").update(raw).digest("hex");
  const converted = convertIranDivisionsCsv(raw.toString("utf8"));
  const datasetBytes = Buffer.from(JSON.stringify(converted.dataset, null, 2) + "\n", "utf8");
  const manifest = {
    sourceUrl: "https://github.com/Hameds/IranCountryDivisions",
    sourceName: "Iran administrative divisions, derived from Statistical Center of Iran annual geographic file",
    sourceVersion: "1404",
    sourceDate,
    sourceWorkbook: "source/1404/geo_1404.xlsx",
    sourceSha256,
    sourceCounts: converted.sourceCounts,
    totalSourceRows: converted.totalSourceRows,
    repositoryLicense: "MIT (repository declaration; original publisher provenance recorded separately)",
    license: "MIT (repository declaration; original publisher provenance recorded separately)",
    rightsReviewStatus: "PENDING",
    commercialUseAllowed: false,
    sha256: createHash("sha256").update(datasetBytes).digest("hex"),
  };
  await mkdir(outputDir, { recursive: true });
  await Promise.all([
    writeFile(join(outputDir, "dataset.json"), datasetBytes),
    writeFile(join(outputDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n"),
  ]);
  process.stdout.write(JSON.stringify({ mode: "CONVERT_ONLY_NO_IMPORT", outputDir, counts: { countries: converted.dataset.countries.length, provinces: converted.dataset.provinces.length, cities: converted.dataset.cities.length }, sourceSha256, datasetSha256: manifest.sha256, rightsReviewStatus: manifest.rightsReviewStatus }, null, 2) + "\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { process.stderr.write(`Conversion failed: ${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
}
