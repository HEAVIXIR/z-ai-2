import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const routePath = "/api/_internal/opennext-runtime-proof";
const timeoutMs = 90_000;

function isolatedEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  for (const key of [
    "DATABASE_URL",
    "STORE_DATABASE_URL",
    "HEAVIX_APP_PREVIEW_PPG_URL",
    "HEAVIX_STORE_PREVIEW_PPG_URL",
    "HEAVIX_OPENNEXT_PROOF_TOKEN",
    "CLOUDFLARE_API_TOKEN",
    "CLOUDFLARE_API_KEY",
  ]) delete env[key];
  return env;
}

async function reservePort() {
  const server = createServer();
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Could not reserve a local port.");
  await new Promise((resolveClose, reject) =>
    server.close((error) => error ? reject(error) : resolveClose()),
  );
  return address.port;
}

function start(command, args, options) {
  const child = spawn(command, args, { ...options, stdio: ["ignore", "inherit", "inherit"] });
  let exit;
  child.once("exit", (code, signal) => { exit = { code, signal }; });
  return { child, get exit() { return exit; } };
}

async function waitForExit(processRef, label) {
  if (processRef.exit) return processRef.exit;
  return await new Promise((resolveExit) => {
    processRef.child.once("exit", (code, signal) => resolveExit({ code, signal, label }));
  });
}

function stop(processRef) {
  if (!processRef || processRef.exit) return;
  try {
    if (process.platform !== "win32" && processRef.child.pid) {
      process.kill(-processRef.child.pid, "SIGTERM");
    } else {
      processRef.child.kill("SIGTERM");
    }
  } catch {}
}

const build = start("bun", ["run", "build:cloudflare"], {
  cwd: root,
  env: isolatedEnv({ HEAVIX_BUILD_TARGET: "cloudflare" }),
});
const buildResult = await waitForExit(build, "cloudflare-build");
assert.equal(buildResult.code, 0, "Cloudflare/OpenNext build failed.");

const tempRoot = await mkdtemp(resolve(tmpdir(), "heavix-opennext-proof-"));
let preview;
try {
  const port = await reservePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const configPath = resolve(tempRoot, "wrangler.jsonc");
  await writeFile(configPath, JSON.stringify({
    $schema: "https://raw.githubusercontent.com/cloudflare/workers-sdk/main/packages/wrangler/config-schema.json",
    name: `heavix-opennext-proof-${process.pid}`,
    main: resolve(root, ".open-next/worker.js"),
    compatibility_date: "2026-10-28",
    compatibility_flags: ["nodejs_compat", "nodejs_compat_populate_process_env"],
    assets: { directory: resolve(root, ".open-next/assets"), binding: "ASSETS" },
    vars: { HEAVIX_OPENNEXT_PROOF_MODE: "SMOKE_ONLY", NODE_ENV: "production" },
    workers_dev: false,
    observability: { enabled: false },
  }, null, 2), { mode: 0o600 });

  preview = start("bunx", [
    "opennextjs-cloudflare", "preview",
    "--config", configPath,
    "--ip", "127.0.0.1",
    "--port", String(port),
  ], {
    cwd: tempRoot,
    detached: process.platform !== "win32",
    env: isolatedEnv({ NODE_ENV: "production" }),
  });

  let response;
  let lastError;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (preview.exit) {
      throw new Error(`OpenNext preview exited before readiness (code=${preview.exit.code}, signal=${preview.exit.signal}).`);
    }
    try {
      response = await fetch(new URL(routePath, baseUrl), {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(3_000),
      });
      break;
    } catch (error) {
      lastError = error;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
    }
  }
  if (!response) throw new Error(`OpenNext preview did not become ready: ${lastError?.name ?? "timeout"}`);
  const body = await response.json();
  assert.equal(response.status, 200, `Proof route returned HTTP ${response.status}: ${JSON.stringify(body)}`);
  assert.equal(body.result, "PASS");
  assert.equal(body.mode, "SMOKE_ONLY");
  assert.equal(body.realApplicationAliasesImported, true);
  assert.equal(body.appFailsClosedWithoutBinding, true);
  assert.equal(body.storeFailsClosedWithoutBinding, true);
  assert.equal(body.databaseConnectionsAttempted, false);
  assert.equal(body.writesPerformed, false);

  console.log(JSON.stringify({
    result: "PASS",
    commit: process.env.GITHUB_SHA ?? "local",
    runtime: "OpenNext-generated Worker via local Wrangler/workerd preview",
    checks: [
      "Cloudflare build generated .open-next/worker.js",
      "actual App Router route imported @/lib/db and @/lib/store-db",
      "route executed in OpenNext Worker request context",
      "both production-path proxies failed closed without DB bindings",
      "no database connection or write was attempted",
    ],
    databaseMode: "SMOKE_ONLY",
    productionCredentialsProvided: false,
    remoteCloudflareCredentialsProvided: false,
  }, null, 2));
} finally {
  stop(preview);
  if (preview) await waitForExit(preview, "preview-shutdown").catch(() => {});
  await rm(tempRoot, { recursive: true, force: true });
}
