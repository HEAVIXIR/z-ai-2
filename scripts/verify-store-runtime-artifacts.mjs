import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const [target, outputArg] = process.argv.slice(2);
if (!["node", "worker"].includes(target) || !outputArg) {
  console.error("Usage: node scripts/verify-store-runtime-artifacts.mjs <node|worker> <artifact-directory>");
  process.exit(2);
}

const outputRoot = path.resolve(outputArg);
if (!fs.existsSync(outputRoot) || !fs.statSync(outputRoot).isDirectory()) {
  throw new Error(`Artifact directory does not exist: ${outputRoot}`);
}

const expected =
  target === "node"
    ? ["generated/store-node-client", "generated/node-client"]
    : ["generated/store-client", "generated/client"];
const forbidden =
  target === "node"
    ? ["generated/store-client", "generated/client"]
    : ["generated/store-node-client", "generated/node-client"];
const allMarkers = [...expected, ...forbidden];

const files = [];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.isFile()) files.push(full);
  }
}
walk(outputRoot);

const relativePath = (file) =>
  path.relative(outputRoot, file).split(path.sep).join("/");
const markerHits = (value) =>
  allMarkers.filter((marker) => value.replace(/\\/g, "/").includes(marker));

const expectedCompiledSources = new Set();
const forbiddenCompiledSources = new Set();
const sourceMapFiles = [];
const invalidSourceMaps = [];
const sourceMapByJavaScript = new Map();
const wasmFiles = [];
const traceMetadata = [];
const unmappedMarkerChunks = [];
const inspectedJavaScript = [];

// Source maps describe which source modules produced an executable chunk.
// Only the "sources" path list is used as compilation provenance. The
// "sourcesContent" field is source text and is deliberately not treated as
// evidence of an import or runtime dependency.
for (const file of files) {
  const relative = relativePath(file);
  if (!relative.endsWith(".js.map") && !relative.endsWith(".mjs.map") && !relative.endsWith(".cjs.map")) {
    continue;
  }

  sourceMapFiles.push(relative);
  try {
    const sourceMap = JSON.parse(fs.readFileSync(file, "utf8"));
    const sources = Array.isArray(sourceMap.sources)
      ? sourceMap.sources.filter((source) => typeof source === "string")
      : [];
    const compiledMarkers = new Set(sources.flatMap(markerHits));

    for (const marker of compiledMarkers) {
      if (expected.includes(marker)) expectedCompiledSources.add(marker);
      if (forbidden.includes(marker)) forbiddenCompiledSources.add(marker);
    }

    const javascriptPath = relative.replace(/\\.map$/, "");
    sourceMapByJavaScript.set(javascriptPath, sources);
  } catch {
    invalidSourceMaps.push(relative);
  }
}

// JavaScript text is not scanned as a bag of forbidden strings: Prisma embeds
// generator output paths in inlineSchema strings. A marker in a JS chunk is
// actionable only when the corresponding source map identifies a forbidden
// generated-client source. If a marker-bearing JS chunk has no readable map,
// the artifact is unverifiable and fails closed.
for (const file of files) {
  const extension = path.extname(file);
  if (![".js", ".mjs", ".cjs"].includes(extension)) continue;

  const relative = relativePath(file);
  const stat = fs.statSync(file);
  if (stat.size > 64 * 1024 * 1024) continue;

  const text = fs.readFileSync(file, "utf8");
  inspectedJavaScript.push(relative);
  const markersInJavaScript = markerHits(text);
  if (markersInJavaScript.length === 0) continue;

  if (!sourceMapByJavaScript.has(relative)) {
    unmappedMarkerChunks.push(relative);
  }
}

// NFT files are tracing metadata, not executable JavaScript. Keep their
// references visible in the report, but never treat them as runtime imports.
for (const file of files) {
  if (!file.endsWith(".nft.json")) continue;
  const relative = relativePath(file);
  try {
    const trace = JSON.parse(fs.readFileSync(file, "utf8"));
    const tracedFiles = Array.isArray(trace.files)
      ? trace.files.filter((entry) => typeof entry === "string")
      : [];
    const references = new Set(tracedFiles.flatMap(markerHits));
    const forbiddenReferences = [...references].filter((marker) =>
      forbidden.includes(marker),
    );
    if (forbiddenReferences.length > 0) {
      traceMetadata.push({ file: relative, forbiddenReferences });
    }
  } catch {
    // Malformed trace metadata is not reclassified as executable code.
  }
}

for (const file of files) {
  if (file.endsWith(".wasm")) wasmFiles.push(relativePath(file));
}

const failures = [];
for (const marker of expected) {
  if (!expectedCompiledSources.has(marker)) {
    failures.push(`expected compiled generated-client source not found: ${marker}`);
  }
}
if (forbiddenCompiledSources.size > 0) {
  failures.push(
    `forbidden generated-client sources are compiled: ${[...forbiddenCompiledSources].join(", ")}`,
  );
}
if (unmappedMarkerChunks.length > 0) {
  failures.push(
    `generated-client marker appears in JavaScript without a readable source map: ${unmappedMarkerChunks.join(", ")}`,
  );
}
if (invalidSourceMaps.length > 0) {
  failures.push(`invalid JavaScript source maps: ${invalidSourceMaps.join(", ")}`);
}
if (target === "node" && wasmFiles.length > 0) {
  failures.push(`Node server artifact contains WASM files: ${wasmFiles.join(", ")}`);
}

const report = {
  target,
  artifactDirectory: outputRoot,
  totalFiles: files.length,
  inspectedJavaScriptChunks: inspectedJavaScript.length,
  sourceMapFiles: sourceMapFiles.length,
  expectedCompiledSources: [...expectedCompiledSources].sort(),
  forbiddenCompiledSources: [...forbiddenCompiledSources].sort(),
  traceMetadata,
  unmappedMarkerChunks,
  invalidSourceMaps,
  wasmFiles,
  result: failures.length ? "FAIL" : "PASS",
};
console.log(JSON.stringify(report, null, 2));
if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  process.exit(1);
}
