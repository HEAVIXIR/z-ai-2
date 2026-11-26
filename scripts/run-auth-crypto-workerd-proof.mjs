import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";

const configPath = "tests/workers/auth-crypto-test.wrangler.jsonc";
let worker;
let workerExit;

async function reservePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Could not reserve a local Workerd port.");
  }
  await new Promise((resolve, reject) =>
    server.close((error) => error ? reject(error) : resolve()),
  );
  return address.port;
}

async function requestJson(baseUrl, path, body) {
  const response = await fetch(new URL(path, baseUrl), {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await response.json();
  return { status: response.status, payload };
}

try {
  const port = await reservePort();
  const baseUrl = `http://127.0.0.1:${port}`;

  worker = spawn("bunx", [
    "wrangler", "dev", "--local", "--config", configPath,
    "--ip", "127.0.0.1", "--port", String(port),
    "--var", "HEAVIX_AUTH_CRYPTO_TEST_MODE:1",
    "--log-level", "error",
  ], {
    stdio: ["ignore", "ignore", "ignore"],
    env: process.env,
  });
  worker.once("exit", (code, signal) => {
    workerExit = { code, signal };
  });

  let ready = false;
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline && !ready) {
    if (workerExit) {
      throw new Error("Local Workerd test harness exited before readiness.");
    }
    try {
      const health = await requestJson(baseUrl, "/health");
      ready = health.status === 200 &&
        health.payload?.ok === true &&
        health.payload?.runtime === "workerd";
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
  assert.equal(ready, true, "Local Auth Crypto Workerd harness did not become ready.");

  const hashed = await requestJson(baseUrl, "/rpc/hash", {
    password: "heavix-workerd-rpc-password",
  });
  assert.equal(hashed.status, 200, "Durable Object hash RPC did not succeed.");
  assert.equal(
    typeof hashed.payload?.hash === "string" &&
      /^\$2[aby]\$10\$[./A-Za-z0-9]{53}$/.test(hashed.payload.hash),
    true,
    "Durable Object RPC did not return a valid bcrypt cost-10 hash.",
  );

  const valid = await requestJson(baseUrl, "/rpc/verify", {
    password: "heavix-workerd-rpc-password",
    hash: hashed.payload.hash,
  });
  assert.equal(valid.status, 200, "Durable Object verify RPC failed.");
  assert.equal(valid.payload?.valid, true, "Durable Object RPC rejected the correct password.");

  const invalid = await requestJson(baseUrl, "/rpc/verify", {
    password: "incorrect-workerd-password",
    hash: hashed.payload.hash,
  });
  assert.equal(invalid.status, 200, "Wrong-password verification RPC failed unexpectedly.");
  assert.equal(invalid.payload?.valid, false, "Durable Object RPC accepted an incorrect password.");

  const malformed = await requestJson(baseUrl, "/rpc/verify", {
    password: "anything",
    hash: "not-a-bcrypt-hash",
  });
  assert.equal(malformed.status, 200, "Malformed hash should be rejected as a normal false result.");
  assert.equal(malformed.payload?.valid, false, "Malformed hash did not fail closed.");

  const oversized = await requestJson(baseUrl, "/rpc/hash", {
    password: "x".repeat(1025),
  });
  assert.equal(oversized.status, 400, "Oversized password input was not rejected before bcrypt.");

  const bcryptBoundary = await requestJson(baseUrl, "/rpc/hash", {
    password: "x".repeat(73),
  });
  assert.equal(bcryptBoundary.status, 400, "New bcrypt hashes must reject inputs over 72 UTF-8 bytes.");

  const legacyPrefix = "x".repeat(72);
  const legacyHashResponse = await requestJson(baseUrl, "/rpc/hash", {
    password: legacyPrefix,
  });
  assert.equal(legacyHashResponse.status, 200, "A 72-byte bcrypt boundary password should hash.");
  const legacyVerify = await requestJson(baseUrl, "/rpc/verify", {
    password: legacyPrefix + "-legacy-suffix",
    hash: legacyHashResponse.payload.hash,
  });
  assert.equal(legacyVerify.status, 200, "Legacy long-password verification RPC failed.");
  assert.equal(legacyVerify.payload?.valid, true, "Legacy bcrypt verification semantics were not preserved.");

  const concurrency = await requestJson(baseUrl, "/rpc/concurrency", {});
  assert.equal(concurrency.status, 200, "Durable Object concurrency proof failed.");
  assert.equal(concurrency.payload?.fulfilled, 1, "Exactly one concurrent operation must be admitted.");
  assert.equal(concurrency.payload?.busyRejected, 1, "The competing operation must fail closed as busy.");
  assert.equal(concurrency.payload?.recovered, true, "The operation lock was not released after completion.");

  console.log(JSON.stringify({
    result: "PASS",
    runtime: "Workerd via Wrangler local Durable Object RPC",
    checks: [
      "same-worker Durable Object RPC hash",
      "same-worker Durable Object RPC verify",
      "incorrect password rejected",
      "malformed hash fails closed",
      "oversized input rejected before bcrypt",\n      "new bcrypt hash rejects inputs over 72 UTF-8 bytes",\n      "legacy long-password verification semantics preserved",
      "single-operation concurrency guard",
      "operation lock recovers after completion",
    ],
    databaseConnectionsAttempted: false,
    externalNetworkCalls: false,
    deploymentPerformed: false,
    productionAccessed: false,
  }, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : "Auth Crypto Workerd proof failed.");
  if (workerExit) {
    console.error(`Workerd process exited (code=${workerExit.code}, signal=${workerExit.signal}).`);
  }
  process.exitCode = 1;
} finally {
  if (worker && !workerExit) {
    worker.kill("SIGTERM");
    await Promise.race([
      new Promise((resolve) => worker.once("exit", resolve)),
      new Promise((resolve) => setTimeout(resolve, 5_000)),
    ]);
    if (!workerExit) worker.kill("SIGKILL");
  }
}
