import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { extname, relative, resolve, sep } from "node:path";

const root = process.cwd();
const outputRoot = resolve(root, ".open-next");
const workerEntry = resolve(outputRoot, "worker.js");
const auditRoot = resolve(outputRoot, "audit");
const reportPath = resolve(auditRoot, "worker-bundle-audit.json");
const dryRunConfigPath = resolve(auditRoot, "wrangler.audit.jsonc");
const dryRunOutDir = resolve(auditRoot, "wrangler-dry-run");
const codeExtensions = new Set([".js", ".mjs", ".cjs"]);
const sourceExtensions = new Set([...codeExtensions, ".map"]);
const workerLimitBytes = 64 * 1024 * 1024;

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      if (relative(outputRoot, fullPath).split(sep)[0] !== "assets" &&
          relative(auditRoot, fullPath).split(sep)[0] !== "wrangler-dry-run") {
        files.push(...await walk(fullPath));
      }
    } else if (entry.isFile() && sourceExtensions.has(extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

function isolatedEnv() {
  const env = { ...process.env };
  for (const key of [
    "DATABASE_URL",
    "STORE_DATABASE_URL",
    "HEAVIX_APP_PREVIEW_PPG_URL",
    "HEAVIX_STORE_PREVIEW_PPG_URL",
    "HEAVIX_OPENNEXT_PROOF_TOKEN",
    "CLOUDFLARE_API_TOKEN",
    "CLOUDFLARE_API_KEY",
    "CLOUDFLARE_ACCOUNT_ID",
  ]) delete env[key];
  return env;
}

function run(command, args, cwd = root) {
  return new Promise((resolveRun) => {
    const child = spawn(command, args, {
      cwd,
      env: isolatedEnv(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.once("error", (error) => resolveRun({ code: null, signal: null, stdout, stderr, error: error.message }));
    child.once("close", (code, signal) => resolveRun({ code, signal, stdout, stderr, error: null }));
  });
}

function parseSize(text) {
  const match = text.match(/Total Upload:\s*([\d.]+)\s*(B|bytes|KiB|MiB|GiB)\s*\/\s*gzip:\s*([\d.]+)\s*(B|bytes|KiB|MiB|GiB)/i);
  if (!match) return null;
  const factor = (unit) => {
    switch (unit.toLowerCase()) {
      case "b":
      case "bytes": return 1;
      case "kib": return 1024;
      case "mib": return 1024 ** 2;
      case "gib": return 1024 ** 3;
      default: return null;
    }
  };
  return {
    totalUploadBytes: Math.round(Number(match[1]) * factor(match[2])),
    gzipBytes: Math.round(Number(match[3]) * factor(match[4])),
    display: match[0],
  };
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
await mkdir(auditRoot, { recursive: true });

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

const diagnosticPaths = [
  ".open-next/server-functions/default/handler.mjs",
  ".open-next/server-functions/default/node_modules/next/dist/compiled/@edge-runtime/primitives/load.js",
  ".open-next/server-functions/default/node_modules/next/dist/compiled/@mswjs/interceptors/ClientRequest/index.js",
  ".open-next/server-functions/default/node_modules/next/dist/compiled/http-proxy-agent/index.js",
  ".open-next/server-functions/default/node_modules/next/dist/compiled/https-proxy-agent/index.js",
  ".open-next/server-functions/default/node_modules/next/dist/compiled/httpxy/index.js",
  ".open-next/server-functions/default/node_modules/next/dist/compiled/ws/index.js",
];
const diagnostics = [];
for (const path of diagnosticPaths) {
  const fullPath = resolve(root, path);
  const content = await readFile(fullPath, "utf8").catch(() => null);
  if (content === null) continue;
  const samples = [];
  for (const item of forbiddenPatterns) {
    const found = [...content.matchAll(item.pattern)].slice(0, 3);
    for (const match of found) {
      const start = Math.max(0, match.index - 90);
      const end = Math.min(content.length, match.index + match[0].length + 90);
      samples.push({
        marker: item.id,
        excerpt: content.slice(start, end).replace(/\s+/g, " ").slice(0, 220),
      });
    }
  }
  diagnostics.push({ file: path, samples });
}

const dryRunConfig = {
  $schema: "https://raw.githubusercontent.com/cloudflare/workers-sdk/main/packages/wrangler/config-schema.json",
  name: "heavix-opennext-bundle-audit",
  main: workerEntry,
  compatibility_date: "2026-10-28",
  compatibility_flags: ["nodejs_compat", "nodejs_compat_populate_process_env"],
  assets: { directory: resolve(outputRoot, "assets"), binding: "ASSETS" },
  vars: { HEAVIX_OPENNEXT_PROOF_MODE: "SMOKE_ONLY", NODE_ENV: "production" },
  workers_dev: false,
  observability: { enabled: false },
};
await writeFile(dryRunConfigPath, JSON.stringify(dryRunConfig, null, 2), { mode: 0o600 });

const wranglerBin = resolve(root, "node_modules/.bin/wrangler");
const dryRunResult = await run(wranglerBin, [
  "deploy",
  "--dry-run",
  "--outdir",
  dryRunOutDir,
  "--config",
  dryRunConfigPath,
  "--metafile",
  resolve(auditRoot, "wrangler-bundle-meta.json"),
], auditRoot);
const dryRunOutput = dryRunResult.stdout + "\n" + dryRunResult.stderr;
const parsedSize = parseSize(dryRunOutput);
const dryRunStatus = dryRunResult.code === 0 ? "SUCCESS" : "FAILED";
const sizeGate = parsedSize
  ? (parsedSize.totalUploadBytes <= workerLimitBytes ? "WITHIN_LIMIT" : "OVER_LIMIT")
  : "UNKNOWN";

const metafilePath = resolve(auditRoot, "wrangler-bundle-meta.json");
let metafile = null;
try {
  metafile = JSON.parse(await readFile(metafilePath, "utf8"));
} catch {}
const metaInputs = Object.keys(metafile?.inputs ?? {});
const metaOutputs = Object.entries(metafile?.outputs ?? {});
const externalImports = [...new Set(metaOutputs.flatMap(([, output]) =>
  (output.imports ?? []).filter((item) => item.external).map((item) => item.path),
))].sort();
const forbiddenPackageInputs = metaInputs.filter((path) =>
  /node_modules\/(?:pg|pg-pool|pg-protocol|pg-native|pgpass)\//.test(path) ||
  /node_modules\/@prisma\/adapter-pg(?:\/|$)/.test(path),
);
const ppgPackageInputs = metaInputs.filter((path) =>
  /node_modules\/@prisma\/(?:adapter-ppg|ppg)(?:\/|$)/.test(path),
);
const externalNodeTcpImports = externalImports.filter((path) =>
  /^(?:node:)?(?:net|tls|dgram)$/.test(path),
);
const outputBytes = metaOutputs.reduce((sum, [, output]) => sum + (output.bytes ?? 0), 0);
const bundleMetaAudit = {
  status: metafile ? "AVAILABLE" : "NOT_AVAILABLE",
  inputCount: metaInputs.length,
  outputCount: metaOutputs.length,
  outputBytes,
  forbiddenPackageInputs,
  ppgPackageInputs,
  externalNodeTcpImports,
  largestOutputs: metaOutputs
    .map(([path, output]) => ({ path, bytes: output.bytes ?? 0 }))
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 15),
};

const reviewRequired = forbiddenCount > 0 ||
  dryRunStatus !== "SUCCESS" ||
  sizeGate !== "WITHIN_LIMIT" ||
  forbiddenPackageInputs.length > 0 ||
  externalNodeTcpImports.length > 0;
const verdict = reviewRequired ? "REVIEW_REQUIRED" : "NO_FORBIDDEN_MARKERS_FOUND";

const report = {
  schemaVersion: 2,
  generatedAt: new Date().toISOString(),
  method: "heuristic scan of generated OpenNext Worker JavaScript plus Wrangler deploy --dry-run bundle; source-marker scan is not a complete dependency-graph proof",
  verdict,
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
  diagnostics,
  wranglerDryRun: {
    status: dryRunStatus,
    sizeGate,
    workerLimitBytes,
    parsedSize,
    metafile: bundleMetaAudit,
    command: "wrangler deploy --dry-run --outdir <audit-dir> --config <secret-free-audit-config> --metafile <audit-meta>",
    exitCode: dryRunResult.code,
    signal: dryRunResult.signal,
    error: dryRunResult.error,
    outputTail: dryRunOutput.slice(-12000),
  },
  files: scanned,
};

await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n", { mode: 0o600 });
console.log(JSON.stringify({
  result: report.verdict,
  report: relative(root, reportPath),
  workerEntryBytes: report.workerEntry.bytes,
  javascriptFiles: report.totals.javascriptFiles,
  javascriptBytes: report.totals.javascriptBytes,
  forbiddenMarkers: report.forbiddenMarkers,
  expectedPpgMarkers: report.expectedPpgMarkers,
  wranglerDryRun: report.wranglerDryRun,
  note: report.method,
}, null, 2));
