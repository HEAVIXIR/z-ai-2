import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const routePath = "/api/opennext-runtime-proof";
const timeoutMs = 90_000;
const proofGateToken = randomBytes(32).toString("base64url");

function isolatedEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  for (const key of [
    "DATABASE_URL",
    "STORE_DATABASE_URL",
    "HEAVIX_APP_PREVIEW_PPG_URL",
    "HEAVIX_STORE_PREVIEW_PPG_URL",
    "HEAVIX_OPENNEXT_PROOF_TOKEN",
    "HEAVIX_BACKUP_EXECUTION_ENABLED",
    "CLOUDFLARE_API_TOKEN",
    "CLOUDFLARE_API_KEY",
    "B2_KEY_ID",
    "B2_APPLICATION_KEY",
    "B2_BUCKET_NAME",
    "B2_MEDIA_PREFIX",
    "B2_REGION",
    "B2_S3_ENDPOINT",
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

if (process.env.HEAVIX_SKIP_OPENNEXT_BUILD === "1") {
  await access(resolve(root, ".open-next/worker.js"));
} else {
  const build = start("bun", ["run", "build:cloudflare"], {
    cwd: root,
    env: isolatedEnv({ HEAVIX_BUILD_TARGET: "cloudflare" }),
  });
  const buildResult = await waitForExit(build, "cloudflare-build");
  assert.equal(buildResult.code, 0, "Cloudflare/OpenNext build failed.");
}

const tempRoot = await mkdtemp(resolve(tmpdir(), "heavix-opennext-proof-"));
let preview;
try {
  const port = await reservePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const configPath = resolve(tempRoot, "wrangler.jsonc");
  await writeFile(configPath, JSON.stringify({
    $schema: "https://raw.githubusercontent.com/cloudflare/workers-sdk/main/packages/wrangler/config-schema.json",
    name: `heavix-opennext-proof-${process.pid}`,
    main: resolve(root, "scripts/preview-version-worker.mjs"),
    compatibility_date: "2026-10-28",
    compatibility_flags: ["nodejs_compat", "nodejs_compat_populate_process_env"],
    assets: { directory: resolve(root, ".open-next/assets"), binding: "ASSETS" },
    vars: {
      HEAVIX_OPENNEXT_PROOF_MODE: "SMOKE_ONLY",
      HEAVIX_PREVIEW_PROOF_GATE_TOKEN: proofGateToken,
      NODE_ENV: "production",
      HEAVIX_BACKUP_EXECUTION_ENABLED: "false",
      B2_KEY_ID: "0055d132b1dcc410000000004",
      B2_APPLICATION_KEY: "ci-only-dummy-application-key-material",
      B2_BUCKET_NAME: "heavix-dev-assets",
      B2_MEDIA_PREFIX: "heavix-media/",
      B2_REGION: "us-east-005",
      B2_S3_ENDPOINT: "https://s3.us-east-005.backblazeb2.com",
    },
    workers_dev: false,
    observability: { enabled: false },
  }, null, 2), { mode: 0o600 });

  preview = start(resolve(root, "node_modules/.bin/opennextjs-cloudflare"), [
    "preview",
    "--config", configPath,
    "--ip", "127.0.0.1",
    "--port", String(port),
  ], {
    // OpenNext resolves its generated .open-next/config relative to the project root.
    // Keep the Wrangler config isolated in tempRoot, but run the CLI from root.
    cwd: root,
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
        headers: {
          accept: "application/json",
          authorization: `Bearer ${proofGateToken}`,
        },
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
  assert.equal(body.mediaServiceModuleLoaded, true);
  assert.equal(body.b2MediaConfigWorks, true);
  assert.equal(body.mediaReadGateRejectsInvalidId, true);
  assert.equal(body.mediaImageOptimizerWorks, true);
  assert.equal(body.databaseConnectionsAttempted, false);
  assert.equal(body.writesPerformed, false);

  // The outer wrapper must reject every other route before invoking OpenNext.
  // This matters for a public Version URL: the proof version must not expose
  // the rest of the application, including the legacy host-process backup route.
  const [unauthenticatedProof, appRoot, authenticatedRoot, backupResponse, postProof] = await Promise.all([
    fetch(new URL(routePath, baseUrl), { headers: { accept: "application/json" } }),
    fetch(new URL("/", baseUrl), { headers: { authorization: `Bearer ${proofGateToken}` } }),
    fetch(new URL("/", baseUrl), { headers: { authorization: `Bearer ${proofGateToken}` } }),
    fetch(new URL("/api/admin/backup", baseUrl), {
      method: "POST",
      headers: { authorization: `Bearer ${proofGateToken}`, cookie: "heavix-user=smoke-invalid" },
    }),
    fetch(new URL(routePath, baseUrl), {
      method: "POST",
      headers: { authorization: `Bearer ${proofGateToken}` },
    }),
  ]);
  assert.equal(unauthenticatedProof.status, 404, "Proof route must reject a missing outer token.");
  assert.equal(appRoot.status, 404, "Application root must be inaccessible through the proof-only wrapper.");
  assert.equal(authenticatedRoot.status, 404, "A valid token must not expose the application root.");
  assert.equal(backupResponse.status, 404, "Proof-only wrapper must not expose the legacy backup route.");
  assert.equal(postProof.status, 404, "Proof-only wrapper must reject non-GET methods.");

  console.log(JSON.stringify({
    result: "PASS",
    commit: process.env.GITHUB_SHA ?? "local",
    runtime: "OpenNext-generated Worker via local Wrangler/workerd preview",
    checks: [
      "Cloudflare build generated .open-next/worker.js",
      "actual App Router route imported @/lib/db and @/lib/store-db",
      "route executed in OpenNext Worker request context",
      "both production-path proxies failed closed without DB bindings",
      "B2 media service and optimizer imported with CI-only dummy bindings; no remote storage request was made",
      "invalid media IDs rejected before any B2 request",
      "jSquash WebAssembly image decode/optimization executes in Workerd without native host dependencies",
      "B2 runtime bindings populate process.env and match the fixed bucket/prefix scope without making a network request",
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
