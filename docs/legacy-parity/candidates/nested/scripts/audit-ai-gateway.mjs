import { readdir } from "node:fs/promises";
import path from "node:path";

const root = path.resolve("src/app/api");
const direct = [];
async function walk(dir) {
  let entries = [];
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) await walk(p);
    else if (e.name === "route.ts" || e.name === "route.tsx") {
      const text = await import("node:fs/promises").then(m => m.readFile(p, "utf8"));
      if (/ZAI\.create|from\s+["']z-ai-web-dev-sdk["']/.test(text)) direct.push(p);
    }
  }
}
await walk(root);
console.log(`Direct AI SDK routes found: ${direct.length}`);
for (const p of direct) console.log(` - ${path.relative(process.cwd(), p)}`);
if (direct.length) process.exitCode = 2;
