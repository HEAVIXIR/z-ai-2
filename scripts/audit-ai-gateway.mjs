#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const args = new Set(process.argv.slice(2));
if (args.has("--help")) {
  console.log("Usage: node scripts/audit-ai-gateway.mjs [--strict]");
  console.log("Scans API route handlers and src/lib modules. Report-only by default; --strict exits 2 when direct provider SDK use exists outside the canonical gateway route.");
  process.exit(0);
}

// The API gateway route is the only currently approved direct provider entry
// point. A library module that imports the SDK is not automatically trusted:
// it must be reviewed for policy, budget, timeout, audit, and output controls.
const approvedProviderFiles = new Set([
  path.normalize("src/app/api/ai-gateway/route.ts"),
]);
const roots = [
  { dir: path.resolve("src/app/api"), kind: "route" },
  { dir: path.resolve("src/lib"), kind: "module" },
];
const providerPatterns = [
  /\bfrom\s*["']z-ai-web-dev-sdk["']/,
  /\bimport\s*\(\s*["']z-ai-web-dev-sdk["']\s*\)/,
  /\bZAI\s*\.\s*create\s*\(/,
];
const findings = new Map();

async function walk(dir, kind) {
  let entries = [];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(absolute, kind);
      continue;
    }
    const isApiRoute = kind === "route" && /^route\.(ts|tsx)$/.test(entry.name);
    const isLibraryModule = kind === "module" && /\.(ts|tsx)$/.test(entry.name);
    if (!isApiRoute && !isLibraryModule) continue;
    const relative = path.normalize(path.relative(process.cwd(), absolute));
    if (approvedProviderFiles.has(relative)) continue;
    const source = await readFile(absolute, "utf8");
    const matches = providerPatterns
      .map((pattern, index) => (pattern.test(source) ? index : -1))
      .filter((index) => index !== -1);
    if (matches.length) findings.set(relative, matches);
  }
}

for (const root of roots) await walk(root.dir, root.kind);
const sorted = [...findings.keys()].sort();
console.log("AI provider boundary audit (heuristic; review findings manually).");
console.log("Scope: API route handlers and src/lib TypeScript modules.");
console.log("Approved direct provider entry point: src/app/api/ai-gateway/route.ts");
console.log(`Direct provider SDK candidates outside the allowlist: ${sorted.length}`);
for (const file of sorted) console.log(` - ${file}`);

if (args.has("--strict") && sorted.length > 0) {
  console.error("STRICT FAIL: direct provider SDK candidates remain outside the approved entry point.");
  process.exitCode = 2;
}
