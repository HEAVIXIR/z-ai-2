import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve("src/app/api/admin");
const routes = [];
async function walk(dir) {
  let entries = [];
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) await walk(p);
    else if (/^route\.(ts|tsx)$/.test(e.name)) routes.push(p);
  }
}
await walk(root);

const missing = [];
for (const p of routes) {
  const text = await readFile(p, "utf8");
  if (!/requirePermission\s*\(/.test(text)) missing.push(p);
}
console.log(`Admin routes: ${routes.length}`);
console.log(`Routes with explicit requirePermission(): ${routes.length - missing.length}`);
if (missing.length) {
  console.log("\nRoutes requiring permission review:");
  for (const p of missing) console.log(` - ${path.relative(process.cwd(), p)}`);
  process.exitCode = 2;
}
