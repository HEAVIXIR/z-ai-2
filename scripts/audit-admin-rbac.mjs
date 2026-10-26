#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve("src/app/api/admin");
const args = new Set(process.argv.slice(2));
if (args.has("--help")) {
  console.log("Usage: node scripts/audit-admin-rbac.mjs [--strict]");
  console.log("Report-only by default. --strict exits 2 when a route has no recognized guard marker.");
  process.exit(0);
}

const permissionMarker = /\b(?:requirePermission|assertPermission|hasPermission|checkPermission)\s*\(/;
const authMarker = /\b(?:requireAdmin|getCurrentUser|getCurrentUserId|getServerSession|getCurrentSession|withAuth|withAdmin|requireRole|requireAuthenticatedUser|assertAuthenticated|checkAdminAccess)\s*\(/;
const routes = [];

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
    } else if (/^route\.(ts|tsx)$/.test(entry.name)) {
      routes.push(absolute);
    }
  }
}

await walk(root);
routes.sort();
const permission = [];
const otherGuard = [];
const review = [];
for (const absolute of routes) {
  const source = await readFile(absolute, "utf8");
  const relative = path.relative(process.cwd(), absolute);
  if (permissionMarker.test(source)) permission.push(relative);
  else if (authMarker.test(source)) otherGuard.push(relative);
  else review.push(relative);
}

console.log("Admin API guard inventory (heuristic; not a vulnerability verdict).");
console.log(`Admin route files: ${routes.length}`);
console.log(`Explicit permission marker: ${permission.length}`);
console.log(`Other recognized auth/guard marker: ${otherGuard.length}`);
console.log(`Manual source review required: ${review.length}`);
if (review.length) {
  console.log("\nRoutes with no recognized marker:");
  for (const route of review) console.log(` - ${route}`);
}
console.log("\nA recognized marker is not proof of correct permission, ownership, or tenant scoping.");
console.log("A missing marker is not proof of a vulnerability; review the route and its imported helpers.");

if (args.has("--strict") && review.length > 0) {
  console.error("STRICT FAIL: routes need manual classification before this heuristic can pass.");
  process.exitCode = 2;
}
