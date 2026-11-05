import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { extname, relative, resolve, sep } from "node:path";

const root = process.cwd();
const outputRoot = resolve(root, ".open-next");
const workerEntry = resolve(outputRoot, "worker.js");
const reportPath = resolve(outputRoot, "audit/worker-bundle-audit.json");
const codeExtensions = new Set([".js", ".mjs", ".cjs"]);
const sourceExtensions = new Set([...codeExtensions, ".map"]);

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      // Browser assets are not part of the Worker server execution graph.
      if (relative(outputRoot, fullPath).split(sep)[0] !== "assets") {
        files.push(...await walk(fullPath));
      }
    } else if (entry.isFile() && sourceExtensions.has(extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

const forbiddenPatterns = [
  { id: "node-net-import", pattern: /(?:from\s*|import\s*\(|require\s*\()\s*["'](?:node:)?net["']/g },
  { id: "node-tls-import", pattern: /(?:from\s*|import\s*\(|require\s*\()\s*["'](?:node:)?tls["']/g },
  { id: "node-dgram-import", pattern: /(?:from\s*|import\s*\(|require\s*\()\s*["'](?:node:)?dgram["']/g },
  { id: "node-tcp-module-marker", pattern: /node:(?:net|tls|dgram)\b/g },
  { id: "node-postgres-adapter", pattern: /@prisma\/adapter-pg/g },
  { id: "node-postgres-package-path", pattern: /node_modules\/(?:pg|pg-pool|pg-protocol|pg-native|pgpass)(?:\/|["'])/g },
  { id: "node-postgres-package-marker", pattern: /\b(?:pg-protocol|pg-pool|pg-native|pgpass)\b/g },
  { id: "tcp-api-symbol", pattern: /\b(?:net\.connect|tls\.connect|new\s+net\.Socket)\b/g },
];
const expectedPpgPatterns = [
  { id: "prisma-ppg-adapter", pattern: /@prisma\/adapter-ppg/g },
  { id: "prisma-ppg-driver", pattern: /@prisma\/ppg/g },
];

const workerStat = await stat(workerEntry).catch(() => null);
if (!workerStat?.isFile()) {
  throw new Error("OpenNext Worker entry .open-next/worker.js was not generated.");
}

const files = (await walk(outputRoot)).sort();
const scanned = [];
const totals = new Map(forbiddenPatterns.map(({ id }) => [id, 0]));
const expectedTotals = new Map(expectedPpgPatterns.map(({ id }) => [id, 0]));

for (const file of files) {
  const content = await readFile(file, "utf8").catch(() => "");
  const matches = [];
  for (const item of forbiddenPatterns) {
    const count = [...content.matchAll(item.pattern)].length;
    if (count) {
      totals.set(item.id, totals.get(item.id) + count);
      matches.push({ marker: item.id, count });
    }
  }
  const expected = [];
  for (const item of expectedPpgPatterns) {
    const count = [...content.matchAll(item.pattern)].length;
    if (count) {
      expectedTotals.set(item.id, expectedTotals.get(item.id) + count);
      expected.push({ marker: item.id, count });
    }
  }
  scanned.push({
    file: relative(root, file),
    bytes: (await stat(file)).size,
    sha256: createHash("sha256").update(content).digest("hex"),
    forbiddenMatches: matches,
    expectedPpgMatches: expected,
  });
}

const jsFiles = scanned.filter((file) => codeExtensions.has(extname(file.file)));
const forbiddenSummary = [...totals].map(([marker, count]) => ({ marker, count }));
const expectedSummary = [...expectedTotals].map(([marker, count]) => ({ marker, count }));
const totalJsBytes = jsFiles.reduce((sum, file) => sum + file.bytes, 0);
const forbiddenCount = forbiddenSummary.reduce((sum, item) => sum + item.count, 0);

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  method: "heuristic scan of generated OpenNext Worker JavaScript and source maps; not a complete bundler dependency-graph proof",
  verdict: forbiddenCount ? "REVIEW_REQUIRED" : "NO_FORBIDDEN_MARKERS_FOUND",
  workerEntry: {
    file: relative(root, workerEntry),
    bytes: workerStat.size,
    sha256: createHash("sha256").update(await readFile(workerEntry)).digest("hex"),
  },
  totals: {
    scannedFiles: scanned.length,
    javascriptFiles: jsFiles.length,
    javascriptBytes: totalJsBytes,
    forbiddenMarkerCount: forbiddenCount,
  },
  forbiddenMarkers: forbiddenSummary,
  expectedPpgMarkers: expectedSummary,
  files: scanned,
};

await mkdir(resolve(outputRoot, "audit"), { recursive: true });
await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n", { mode: 0o600 });
console.log(JSON.stringify({
  result: report.verdict,
  report: relative(root, reportPath),
  workerEntryBytes: report.workerEntry.bytes,
  javascriptFiles: report.totals.javascriptFiles,
  javascriptBytes: report.totals.javascriptBytes,
  forbiddenMarkers: report.forbiddenMarkers,
  expectedPpgMarkers: report.expectedPpgMarkers,
  note: report.method,
}, null, 2));
