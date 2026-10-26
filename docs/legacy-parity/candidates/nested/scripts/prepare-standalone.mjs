import { cp, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";

const root = process.cwd();
const standalone = `${root}/.next/standalone`;

if (!existsSync(standalone)) {
  throw new Error("Missing .next/standalone. Run `npm run build` first.");
}

await mkdir(`${standalone}/.next`, { recursive: true });

const copyIfExists = async (src, dest) => {
  if (existsSync(src)) await cp(src, dest, { recursive: true, force: true });
};

await copyIfExists(`${root}/.next/static`, `${standalone}/.next/static`);
await copyIfExists(`${root}/public`, `${standalone}/public`);

console.log("[HEAVIX] standalone runtime prepared.");
