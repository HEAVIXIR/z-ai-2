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

const expected = target === "node" ? ["generated/store-node-client", "generated/node-client"] : ["generated/store-client", "generated/client"];
const forbidden = target === "node" ? ["generated/store-client", "generated/client"] : ["generated/store-node-client", "generated/node-client"];
const textExtensions = new Set([".js", ".mjs", ".cjs", ".json", ".map", ".txt", ".wasm", ".html"]);
const files = [];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.isFile()) files.push(full);
  }
}
walk(outputRoot);

const expectedHits = Object.fromEntries(expected.map((marker) => [marker, 0]));
const forbiddenHits = [];
const wasmFiles = [];
const inspected = [];
for (const file of files) {
  const relative = path.relative(outputRoot, file).split(path.sep).join("/");
  if (file.endsWith(".wasm")) wasmFiles.push(relative);
  if (!textExtensions.has(path.extname(file)) && !file.endsWith(".nft.json")) continue;
  const stat = fs.statSync(file);
  if (stat.size > 64 * 1024 * 1024) continue;
  const content = fs.readFileSync(file);
  if (content.includes(0)) continue;
  const text = content.toString("utf8");
  inspected.push(relative);
  for (const marker of expected) if (text.includes(marker)) expectedHits[marker]++;
  for (const marker of forbidden) if (text.includes(marker)) forbiddenHits.push({ file: relative, marker });
}

const failures = [];
for (const marker of expected) if (expectedHits[marker] === 0) failures.push(`expected generated client marker not found: ${marker}`);
if (forbiddenHits.length) failures.push(`forbidden generated client markers found: ${JSON.stringify(forbiddenHits)}`);
if (target === "node" && wasmFiles.length) failures.push(`Node server artifact contains WASM files: ${wasmFiles.join(", ")}`);

const report = {
  target,
  artifactDirectory: outputRoot,
  totalFiles: files.length,
  inspectedTextFiles: inspected.length,
  expectedClientMarkers: expected,
  expectedMarkerHits: expectedHits,
  forbiddenClientMarkers: forbidden,
  forbiddenMarkerFiles: forbiddenHits,
  wasmFiles,
  result: failures.length ? "FAIL" : "PASS",
};
console.log(JSON.stringify(report, null, 2));
if (failures.length) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  process.exit(1);
}
