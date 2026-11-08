import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const appUrl = process.env.HEAVIX_APP_PREVIEW_PPG_URL;
const storeUrl = process.env.HEAVIX_STORE_PREVIEW_PPG_URL;
const target = process.env.HEAVIX_RUNTIME_PROOF_TARGET;
const smokeOnly = target === "SMOKE_ONLY";

if (target !== "PREVIEW_ONLY" && !smokeOnly) {
  throw new Error("Blocked: choose SMOKE_ONLY or explicitly confirm PREVIEW_ONLY.");
}
if (smokeOnly && (appUrl || storeUrl)) {
  throw new Error("Blocked: SMOKE_ONLY must not receive database connection strings.");
}
if (!smokeOnly && (!appUrl || !storeUrl || appUrl === storeUrl)) {
  throw new Error("Blocked: two distinct Preview-only PPG connection strings are required.");
}
if (!smokeOnly && (!appUrl.includes("://") || !storeUrl.includes("://"))) {
  throw new Error("Blocked: one or both Preview connection inputs are malformed.");
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

async function getJson(baseUrl, path) {
  const response = await fetch(new URL(path, baseUrl), {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  const body = await response.json();
  assert.equal(response.status, 200, `${path} returned HTTP ${response.status}: ${JSON.stringify(body)}`);
  return body;
}

// Prisma Postgres reports the internal database name "postgres" for every
// resource, so database_name is not a unique resource identifier. The stable
// PostgreSQL system_identifier is independently inventoried per Preview
// resource and is the primary fail-closed resource allowlist below; exact
// migration-name sets are a second, schema-level fingerprint.
const expected = {
  app: {
    databaseName: "postgres",
    systemIdentifier: "7701427422680793119",
    migrations: ["20261025081255_init_postgresql_baseline", "20261025193000_add_auditlog_idempotency_key"],
  },
  store: {
    databaseName: "postgres",
    systemIdentifier: "7701425043360235551",
    migrations: ["0001_init_store_baseline", "0002_add_audit_outbox"],
  },
};
const configDir = await mkdtemp(resolve(root, ".heavix-workerd-proof-"));
const configPath = resolve(configDir, "wrangler.jsonc");
const varsPath = resolve(configDir, ".dev.vars");
let worker;
let workerExit;

try {
  const port = await reservePort();
  const baseUrl = `http://127.0.0.1:${port}`;

  if (!smokeOnly) {
    await writeFile(
      varsPath,
      `DATABASE_URL=${JSON.stringify(appUrl)}\nSTORE_DATABASE_URL=${JSON.stringify(storeUrl)}\n`,
      { mode: 0o600 },
    );
  }
  await writeFile(configPath, JSON.stringify({
    $schema: "https://raw.githubusercontent.com/cloudflare/workers-sdk/main/packages/wrangler/config-schema.json",
    name: `heavix-prisma-workerd-proof-${process.pid}`,
    main: "../tests/workerd/worker.ts",
    compatibility_date: "2026-10-28",
    compatibility_flags: ["nodejs_compat", "nodejs_compat_populate_process_env"],
    workers_dev: false,
    logpush: false,
    observability: { enabled: false },
  }, null, 2));

  worker = spawn("bunx", [
    "wrangler", "dev", "--local", "--config", configPath,
    "--ip", "127.0.0.1", "--port", String(port), "--log-level", "error",
  ], { cwd: root, env: process.env, stdio: ["ignore", "ignore", "ignore"] });
  worker.once("exit", (code, signal) => { workerExit = { code, signal }; });

  let ready = false;
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline && !ready) {
    if (workerExit) {
      throw new Error(`Wrangler exited before readiness (code=${workerExit.code}, signal=${workerExit.signal}).`);
    }
    try {
      const response = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(1_500) });
      if (response.ok) {
        const body = await response.json();
        ready = body.ok === true && body.runtime === "workerd";
      }
    } catch {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 300));
    }
  }
  assert.equal(ready, true, "Local Workerd Worker did not become ready within 45 seconds.");

  if (smokeOnly) {
    const [missingApp, missingStore, lifecycle] = await Promise.all([
      getJson(baseUrl, "/failure/missing-app-secret"),
      getJson(baseUrl, "/failure/missing-store-secret"),
      getJson(baseUrl, "/resolver/lifecycle"),
    ]);
    assert.equal(missingApp.expectedFailure, true, "App client did not fail closed without its secret.");
    assert.equal(missingStore.expectedFailure, true, "Store client did not fail closed without its secret.");
    assert.equal(lifecycle.sameRequestClientReused, true, "Worker client was not reused within one request.");
    assert.equal(lifecycle.isolatedAcrossRequests, true, "Worker client was shared across requests.");
    assert.equal(lifecycle.distinctClientIds, true, "Different requests received the same synthetic client.");
    console.log(JSON.stringify({
      result: "PASS",
      mode: "SMOKE_ONLY",
      runtime: "workerd via Wrangler/Miniflare",
      checks: [
        "Worker module graph loaded in workerd",
        "App and Store generated Prisma clients imported",
        "PPG adapter imported in workerd",
        "missing App/Store secrets fail closed",
        "request-scoped client reuse and cross-request isolation",
      ],
      databaseConnectionsAttempted: false,
      writesPerformed: false,
      productionAccessed: false,
    }, null, 2));
  } else {
  const appFirst = await getJson(baseUrl, "/app/fingerprint");
  const appSecond = await getJson(baseUrl, "/app/fingerprint");
  const storeFirst = await getJson(baseUrl, "/store/fingerprint");
  const storeSecond = await getJson(baseUrl, "/store/fingerprint");

  for (const [label, result, target] of [
    ["App", appFirst, expected.app],
    ["App repeated", appSecond, expected.app],
    ["Store", storeFirst, expected.store],
    ["Store repeated", storeSecond, expected.store],
  ]) {
    assert.equal(result.sameRequestClientReused, true, `${label}: client was not reused within one request`);
    assert.equal(result.identity?.database_name, target.databaseName,
      `${label}: unexpected internal database name`);
    assert.equal(result.identity?.system_identifier, target.systemIdentifier,
      `${label}: PostgreSQL system identifier does not match the exact Preview resource`);
    assert.equal(result.identity?.schema_name, "public", `${label}: unexpected schema`);
    assert.match(result.identity?.server_version ?? "", /^17\./, `${label}: expected PostgreSQL 17`);
    assert.deepEqual(result.migrationNames, target.migrations, `${label}: Preview migration fingerprint mismatch`);
  }
  assert.notEqual(appFirst.clientId, appSecond.clientId, "App client leaked across sequential requests.");
  assert.notEqual(storeFirst.clientId, storeSecond.clientId, "Store client leaked across sequential requests.");

  const concurrent = await Promise.all([
    getJson(baseUrl, "/app/fingerprint"),
    getJson(baseUrl, "/app/fingerprint"),
    getJson(baseUrl, "/store/fingerprint"),
    getJson(baseUrl, "/store/fingerprint"),
  ]);
  assert.equal(new Set(concurrent.map((item) => item.clientId)).size, 4,
    "Concurrent requests shared a Prisma client.");
  for (const [index, result] of concurrent.entries()) {
    assert.equal(result.sameRequestClientReused, true);
    const target = index < 2 ? expected.app : expected.store;
    assert.equal(result.identity?.database_name, target.databaseName,
      `Concurrent request ${index + 1}: unexpected internal database name`);
    assert.equal(result.identity?.system_identifier, target.systemIdentifier,
      `Concurrent request ${index + 1}: unexpected Preview resource identity`);
  }

  const [appTx, storeTx] = await Promise.all([
    getJson(baseUrl, "/app/transaction"),
    getJson(baseUrl, "/store/transaction"),
  ]);
  assert.equal(appTx.transactionOk, true, "App transaction failed (connection check SELECT 1).");
  assert.equal(storeTx.transactionOk, true, "Store transaction failed (connection check SELECT 1).");
  // STEP 18.2.7.3.10 (Finding T-1, revised per review #6657226686):
  // The previous approach attempted CREATE TEMP TABLE and expected SQLSTATE
  // 25006. Per PostgreSQL docs, CREATE TEMP TABLE is ALLOWED in read-only
  // transactions, so that test was invalid. The correct approach is to read
  // the runtime GUC directly via current_setting('transaction_read_only')::boolean.
  // No write is attempted. readOnlyProven=true means the GUC returned true.
  assert.equal(appTx.readOnlyRoleEvidence?.proven, true,
    `App role ${appTx.readOnlyRoleEvidence?.roleName ?? "unknown"} has elevated attributes, inherited write roles, or effective write privileges.`);
  assert.equal(storeTx.readOnlyRoleEvidence?.proven, true,
    `Store role ${storeTx.readOnlyRoleEvidence?.roleName ?? "unknown"} has elevated attributes, inherited write roles, or effective write privileges.`);
  assert.equal(appTx.readOnlyProven, true,
    `App transaction_read_only is NOT on (setting=${appTx.transactionReadOnlySetting}) or role is not least privilege.`);
  assert.equal(storeTx.readOnlyProven, true,
    `Store transaction_read_only is NOT on (setting=${storeTx.transactionReadOnlySetting}) or role is not least privilege.`);
  assert.equal(appTx.writesPerformed, false, "App transaction must not perform any writes.");
  assert.equal(storeTx.writesPerformed, false, "Store transaction must not perform any writes.");

  const [missingApp, missingStore] = await Promise.all([
    getJson(baseUrl, "/failure/missing-app-secret"),
    getJson(baseUrl, "/failure/missing-store-secret"),
  ]);
  assert.equal(missingApp.expectedFailure, true, "App client did not fail closed without its secret.");
  assert.equal(missingStore.expectedFailure, true, "Store client did not fail closed without its secret.");

  console.log(JSON.stringify({
    result: "PASS",
    runtime: "workerd via Wrangler/Miniflare",
    databases: {
      app: { database: appFirst.identity.database_name, systemIdentifier: appFirst.identity.system_identifier, server: appFirst.identity.server_version, schema: appFirst.identity.schema_name, migrations: appFirst.migrationNames },
      store: { database: storeFirst.identity.database_name, systemIdentifier: storeFirst.identity.system_identifier, server: storeFirst.identity.server_version, schema: storeFirst.identity.schema_name, migrations: storeFirst.migrationNames },
    },
    checks: [
      "exact App and Store Preview migration fingerprints",
      "same-request client reuse",
      "sequential request isolation",
      "concurrent request isolation",
      "read-only transaction proven (current_setting('transaction_read_only')::boolean = true)",
      "least-privilege role attributes, memberships, and effective table/sequence/schema/database privileges",
      "fail-closed missing-secret behavior",
    ],
    writesPerformed: false,
    productionAccessed: false,
    readOnlyProven: {
      app: {
        method: appTx.readOnlyCheckMethod,
        setting: appTx.transactionReadOnlySetting,
        role: appTx.readOnlyRoleEvidence,
        proven: appTx.readOnlyProven,
      },
      store: {
        method: storeTx.readOnlyCheckMethod,
        setting: storeTx.transactionReadOnlySetting,
        role: storeTx.readOnlyRoleEvidence,
        proven: storeTx.readOnlyProven,
      },
    },
  }, null, 2));
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "Workerd proof failed.");
  if (workerExit) console.error(`Worker exit: code=${workerExit.code}, signal=${workerExit.signal}`);
  process.exitCode = 1;
} finally {
  if (worker && !workerExit) {
    worker.kill("SIGTERM");
    await Promise.race([
      new Promise((resolveExit) => worker.once("exit", resolveExit)),
      new Promise((resolveDelay) => setTimeout(resolveDelay, 5_000)),
    ]);
    if (!workerExit) worker.kill("SIGKILL");
  }
  await rm(configDir, { recursive: true, force: true });
}
