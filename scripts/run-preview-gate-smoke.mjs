import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const loginPath = "/__heavix_preview/login";
const logoutPath = "/__heavix_preview/logout";
const proofPath = "/api/opennext-runtime-proof";
const timeoutMs = 90_000;
const password = randomBytes(48).toString("base64url");
const signingKey = randomBytes(48).toString("base64url");

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

async function waitForExit(processRef) {
  if (processRef.exit) return processRef.exit;
  return await new Promise((resolveExit) => {
    processRef.child.once("exit", (code, signal) => resolveExit({ code, signal }));
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

const tempRoot = await mkdtemp(resolve(tmpdir(), "heavix-preview-gate-smoke-"));
let preview;
try {
  const port = await reservePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const configPath = resolve(tempRoot, "wrangler.jsonc");
  await writeFile(configPath, JSON.stringify({
    $schema: "https://raw.githubusercontent.com/cloudflare/workers-sdk/main/packages/wrangler/config-schema.json",
    name: `heavix-preview-gate-smoke-${process.pid}`,
    main: resolve(root, "scripts/preview-gated-worker.mjs"),
    compatibility_date: "2026-10-28",
    compatibility_flags: ["nodejs_compat", "nodejs_compat_populate_process_env"],
    assets: { directory: resolve(root, ".open-next/assets"), binding: "ASSETS" },
    vars: {
      HEAVIX_ENV: "preview",
      HEAVIX_PREVIEW_GATE_PASSWORD: password,
      HEAVIX_PREVIEW_GATE_SIGNING_KEY: signingKey,
      HEAVIX_OPENNEXT_PROOF_MODE: "SMOKE_ONLY",
      NODE_ENV: "production",
      HEAVIX_BACKUP_EXECUTION_ENABLED: "false",
    },
    workers_dev: false,
    observability: { enabled: false },
  }, null, 2), { mode: 0o600 });

  const childEnv = { ...process.env, NODE_ENV: "production" };
  for (const key of [
    "DATABASE_URL",
    "STORE_DATABASE_URL",
    "HEAVIX_APP_PREVIEW_PPG_URL",
    "HEAVIX_STORE_PREVIEW_PPG_URL",
    "CLOUDFLARE_API_TOKEN",
    "CLOUDFLARE_API_KEY",
  ]) delete childEnv[key];

  preview = start(resolve(root, "node_modules/.bin/opennextjs-cloudflare"), [
    "preview",
    "--config", configPath,
    "--ip", "127.0.0.1",
    "--port", String(port),
  ], {
    cwd: root,
    detached: process.platform !== "win32",
    env: {
      ...childEnv,
    },
  });

  let ready = false;
  let lastError;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (preview.exit) {
      throw new Error(`Preview gate Worker exited before readiness (code=${preview.exit.code}, signal=${preview.exit.signal}).`);
    }
    try {
      const response = await fetch(new URL(loginPath, baseUrl), {
        headers: { accept: "text/html", "sec-fetch-mode": "navigate" },
        signal: AbortSignal.timeout(3_000),
      });
      if (response.status === 200) {
        ready = true;
        break;
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
  }
  assert.equal(ready, true, `Preview gate Worker did not become ready: ${lastError?.name ?? "timeout"}`);

  const unauthenticatedPage = await fetch(new URL("/", baseUrl), {
    headers: { accept: "text/html", "sec-fetch-mode": "navigate" },
    redirect: "manual",
  });
  assert.equal(unauthenticatedPage.status, 303, "Unauthenticated page navigation must redirect to the login form.");
  assert.equal(new URL(unauthenticatedPage.headers.get("location"), baseUrl).pathname, loginPath);

  const unauthenticatedProof = await fetch(new URL(proofPath, baseUrl), {
    headers: { accept: "application/json" },
  });
  assert.equal(unauthenticatedProof.status, 401, "Unauthenticated API access must be denied.");

  const login = await fetch(new URL(loginPath, baseUrl), {
    method: "POST",
    headers: {
      origin: baseUrl,
      "sec-fetch-site": "same-origin",
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ password }),
    redirect: "manual",
  });
  assert.equal(login.status, 303, "Valid Preview password must create a session.");
  const setCookie = login.headers.get("set-cookie") ?? "";
  assert.match(setCookie, /__Host-heavix_preview_session=/);
  assert.match(setCookie, /Secure/);
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Strict/);
  const cookie = setCookie.split(";")[0];
  assert.ok(cookie, "Login response must issue a session cookie.");

  const authenticatedProof = await fetch(new URL(proofPath, baseUrl), {
    headers: { accept: "application/json", cookie },
  });
  const proofBody = await authenticatedProof.json();
  assert.equal(authenticatedProof.status, 200, `Authenticated OpenNext proof failed: ${JSON.stringify(proofBody)}`);
  assert.equal(proofBody.result, "PASS");
  assert.equal(proofBody.mode, "SMOKE_ONLY");
  assert.equal(proofBody.databaseConnectionsAttempted, false);
  assert.equal(proofBody.writesPerformed, false);

  const crossOriginMutation = await fetch(new URL("/api/admin/backup", baseUrl), {
    method: "POST",
    headers: {
      cookie,
      origin: "https://attacker.invalid",
      "sec-fetch-site": "cross-site",
      "content-type": "application/json",
    },
    body: "{}",
  });
  assert.equal(crossOriginMutation.status, 403, "Authenticated cross-origin mutation must be rejected before OpenNext.");

  const logout = await fetch(new URL(logoutPath, baseUrl), {
    method: "POST",
    headers: {
      cookie,
      origin: baseUrl,
      "sec-fetch-site": "same-origin",
    },
    redirect: "manual",
  });
  assert.equal(logout.status, 303);
  assert.match(logout.headers.get("set-cookie") ?? "", /Max-Age=0/);

  // Model the browser applying the Max-Age=0 Set-Cookie response: the next
  // request must no longer carry the session cookie. A copied bearer cookie
  // remains valid until expiry because this gate intentionally has no server store.
  const afterLogout = await fetch(new URL(proofPath, baseUrl), {
    headers: { accept: "application/json" },
  });
  assert.equal(afterLogout.status, 401, "Logged-out session must no longer authorize requests.");

  console.log(JSON.stringify({
    result: "PASS",
    runtime: "OpenNext-generated Worker behind scripts/preview-gated-worker.mjs",
    checks: [
      "unauthenticated page redirect",
      "unauthenticated API denial",
      "valid password login and host-only secure session cookie",
      "authenticated request reached the real OpenNext App Router proof route",
      "SMOKE_ONLY remained database-free and write-free",
      "authenticated cross-origin mutation rejected before OpenNext",
      "logout cleared the session and subsequent request was denied",
    ],
    productionCredentialsProvided: false,
    remoteCloudflareCredentialsProvided: false,
  }, null, 2));
} finally {
  stop(preview);
  if (preview) await waitForExit(preview).catch(() => {});
  await rm(tempRoot, { recursive: true, force: true });
}
