import { spawn } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const nextCli = require.resolve("next/dist/bin/next");
const nextBundler = process.env.HEAVIX_NEXT_BUNDLER === "webpack" ? "--webpack" : "--turbopack";
process.stdout.write(`HEAVIX_NEXT_BUNDLER_SELECTED=${nextBundler}\n`);
const child = spawn(process.execPath, [nextCli, "build", nextBundler], {
  stdio: "inherit",
  env: process.env,
});

const peakByPid = new Map();
let sampling = false;

async function sampleProcessTree() {
  if (!child.pid) return;
  const entries = await readdir("/proc").catch(() => []);
  const pids = entries.filter((entry) => /^\d+$/.test(entry));
  const parentByPid = new Map();

  await Promise.all(pids.map(async (pid) => {
    const stat = await readFile(`/proc/${pid}/stat`, "utf8").catch(() => "");
    if (!stat) return;
    const close = stat.lastIndexOf(")");
    const fields = stat.slice(close + 2).split(" ");
    parentByPid.set(Number(pid), Number(fields[1]));
  }));

  const descendants = new Set([child.pid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [pid, parent] of parentByPid) {
      if (!descendants.has(pid) && descendants.has(parent)) {
        descendants.add(pid);
        changed = true;
      }
    }
  }

  await Promise.all([...descendants].map(async (pid) => {
    const fds = await readdir(`/proc/${pid}/fd`).catch(() => null);
    if (!fds) return;
    const previous = peakByPid.get(pid) || 0;
    if (fds.length > previous) {
      peakByPid.set(pid, fds.length);
      if (fds.length >= 128 && (fds.length - previous >= 64 || fds.length >= 900)) {
        process.stdout.write(`HEAVIX_FD_SAMPLE pid=${pid} open_fds=${fds.length}\n`);
      }
    }
  }));
}

process.stdout.write(`HEAVIX_FD_DIAGNOSTICS next_pid=${child.pid} nofile=${process.env.HEAVIX_NOFILE_SOFT || "see build log"}\n`);
const timer = setInterval(() => {
  if (sampling) return;
  sampling = true;
  sampleProcessTree().catch((error) => {
    process.stdout.write(`HEAVIX_FD_SAMPLE_ERROR ${String(error)}\n`);
  }).finally(() => {
    sampling = false;
  });
}, 500);

child.on("error", (error) => {
  clearInterval(timer);
  process.stderr.write(`Failed to start Next.js build: ${error.message}\n`);
  process.exitCode = 1;
});

child.on("exit", async (code, signal) => {
  clearInterval(timer);
  await sampleProcessTree();
  const peaks = [...peakByPid.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([pid, openFds]) => ({ pid, openFds }));
  process.stdout.write(`HEAVIX_FD_PEAK ${JSON.stringify({ peaks, code, signal })}\n`);
  process.exitCode = code ?? (signal ? 1 : 0);
});
