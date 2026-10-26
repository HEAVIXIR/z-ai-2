#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve("src/app/api");
const args = new Set(process.argv.slice(2));
if (args.has("--help")) {
  console.log("Usage: node scripts/audit-ai-gateway.mjs [--strict]");
  console.log("Report-only by default. --strict exits 2 when direct provider SDK use is found outside the canonical gateway.");
  process.exit(0);
}

// Only this route owns the provider SDK until a separately reviewed adapter is
// explicitly added to this allowlist. Do not widen it to silence audit output.
const approvedProviderFiles = new Set([
  path.normalize("src/app/api/ai-gateway/route.ts"),
]);
const providerPatterns = [
  /\bfrom\s*["']z-ai-web-dev-sdk["']/,
  /\bimport\s*\(\s*["']z-ai-web-dev-sdk["']\s*\)/,
  /\bZAI\s*\.\s*create\s*\(/,
];
const findings = [];

async function walk(dir) {
  let entries = [];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(absolute);
      continue;
    }
    if (!/^route\.(ts|tsx)$/.test(entry.name)) continue;
    const relative = path.relative(process.cwd(), absolute);
    if (approvedProviderFiles.has(path.normalize(relative))) continue;
    const source = await readFile(absolute, "utf8");
    const matches = providerPatterns
      .map((pattern, index) => (pattern.test(source) ? index : -1))
      .filter((index) => index !== -1);
    if (matches.length) findings.push({ path: relative, matches });
  }
}

await walk(root);
console.log("AI provider boundary audit (heuristic; review findings manually).");
console.log("Approved provider entry point: src/app/api/ai-gateway/route.ts");
console.log(`Direct provider SDK candidates outside the allowlist: ${findings.length}`);
for (const finding of findings) console.log(` - ${finding.path}`);

if (args.has("--strict") && findings.length > 0) {
  console.error("STRICT FAIL: direct provider SDK candidates remain outside the approved entry point.");
  process.exitCode = 2;
}
