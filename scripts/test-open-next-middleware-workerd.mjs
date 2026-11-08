import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { request as httpRequest } from "node:http";
import { rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();

if (process.env.HEAVIX_BUILD_TARGET !== "cloudflare") {
  throw new Error("Workerd Edge Middleware proof must run with HEAVIX_BUILD_TARGET=cloudflare.");
}
const configPath = resolve(root, ".heavix-middleware-smoke.wrangler.jsonc");
let worker;
let workerExit;
let workerOutput = "";

async function reservePort() {
  const server = createServer();
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Could not reserve a local Workerd port.");
  }
  await new Promise((resolveClose, reject) =>
    server.close((error) => (error ? reject(error) : resolveClose())),
  );
  return address.port;
}

async function request(baseUrl, path, host = "heavix-preview.heavixir.workers.dev") {
  const target = new URL(path, baseUrl);
  return new Promise((resolveRequest, rejectRequest) => {
    const req = httpRequest(
      {
        hostname: "127.0.0.1",
        port: Number(target.port),
        path: target.pathname + target.search,
        method: "GET",
        headers: { host },
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const headers = new Headers();
          for (const [name, value] of Object.entries(res.headers)) {
            if (value !== undefined) {
              headers.set(name, Array.isArray(value) ? value.join(", ") : value);
            }
          }
          resolveRequest(
            new Response(Buffer.concat(chunks), {
              status: res.statusCode ?? 500,
              headers,
            }),
          );
        });
      },
    );
    req.once("error", rejectRequest);
    req.setTimeout(10_000, () => req.destroy(new Error("Workerd request timed out.")));
    req.end();
  });
}

try {
  const port = await reservePort();
  const baseUrl = `http://127.0.0.1:${port}`;

  // This temporary config runs the generated OpenNext Worker locally in
  // Workerd. It intentionally has no database secrets, remote bindings,
  // custom domains, or deploy command.
  await writeFile(
    configPath,
    JSON.stringify(
      {
        $schema:
          "https://raw.githubusercontent.com/cloudflare/workers-sdk/main/packages/wrangler/config-schema.json",
        name: `heavix-middleware-workerd-smoke-${process.pid}`,
        main: ".open-next/worker.js",
        compatibility_date: "2026-10-28",
        compatibility_flags: ["nodejs_compat"],
        assets: { directory: ".open-next/assets", binding: "ASSETS" },
        workers_dev: false,
        observability: { enabled: false },
        vars: {
          NODE_ENV: "production",
          NEXT_PUBLIC_SITE_URL: "https://heavix.ir",
          HEAVIX_BACKUP_EXECUTION_ENABLED: "false",
        },
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );

  worker = spawn(
    "bunx",
    [
      "wrangler",
      "dev",
      "--local",
      "--config",
      configPath,
      "--ip",
      "127.0.0.1",
      "--port",
      String(port),
      "--log-level",
      "error",
    ],
    {
      cwd: root,
      env: (() => {
        const env = { ...process.env, NODE_ENV: "production" };
        // This proof must identify Preview solely from the incoming Host.
        delete env.HEAVIX_ENV;
        delete env.NEXT_PUBLIC_SITE_URL;
        delete env.VERCEL_ENV;
        return env;
      })(),
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  worker.stdout?.on("data", (chunk) => {
    workerOutput = (workerOutput + chunk.toString()).slice(-20_000);
  });
  worker.stderr?.on("data", (chunk) => {
    workerOutput = (workerOutput + chunk.toString()).slice(-20_000);
  });
  worker.once("exit", (code, signal) => {
    workerExit = { code, signal };
  });

  let ready = false;
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline && !ready) {
    if (workerExit) {
      throw new Error(
        `Wrangler exited before readiness (code=${workerExit.code}, signal=${workerExit.signal}).`,
      );
    }
    try {
      await request(baseUrl, "/__heavix_middleware_smoke_ready");
      ready = true;
    } catch {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 300));
    }
  }
  assert.equal(ready, true, "Local Workerd Worker did not become ready.");

  const publicPage = await request(baseUrl, "/login");
  assert.equal(publicPage.status, 200, "Preview HTML page must return HTTP 200.");
  assert.equal(
    publicPage.headers.get("X-Robots-Tag"),
    "noindex, nofollow, noarchive",
    "Edge Middleware must add one noindex directive set to Preview HTML responses.",
  );

  const robots = await request(baseUrl, "/robots.txt");
  assert.equal(robots.status, 200, "Preview robots.txt must return HTTP 200.");
  assert.equal(
    robots.headers.get("X-Robots-Tag"),
    "noindex, nofollow, noarchive",
    "Edge Middleware must add noindex to public Preview responses.",
  );
  const previewRobotsBody = await robots.text();
  assert.match(previewRobotsBody, /User-agent: \*/);
  assert.match(previewRobotsBody, /Disallow: \//);
  assert.doesNotMatch(previewRobotsBody, /Sitemap:/i);

  const previewSitemap = await request(baseUrl, "/sitemap.xml");
  assert.equal(
    previewSitemap.status,
    404,
    "Preview must not expose a sitemap route with production canonical URLs.",
  );
  assert.doesNotMatch(await previewSitemap.text(), /https:\/\/heavix\.ir/i);

  const productionRobots = await request(baseUrl, "/robots.txt", "heavix.ir");
  assert.equal(productionRobots.status, 200);
  assert.match(await productionRobots.text(), /Sitemap:\s*https:\/\/heavix\.ir\/sitemap\.xml/i);

  const productionSitemap = await request(baseUrl, "/sitemap.xml", "heavix.ir");
  assert.equal(productionSitemap.status, 200);
  assert.match(await productionSitemap.text(), /https:\/\/heavix\.ir\//);

  const adminApi = await request(baseUrl, "/api/admin/users");
  assert.equal(
    adminApi.status,
    401,
    "Anonymous admin API requests must remain unauthorized.",
  );
  assert.equal(
    adminApi.headers.get("X-Robots-Tag"),
    "noindex, nofollow, noarchive",
    "Edge Middleware must add noindex to anonymous admin API responses.",
  );

  const adminPage = await request(
    baseUrl,
    "/admin/users?tab=roles",
  );
  assert.equal(
    adminPage.status,
    307,
    "Anonymous admin page requests must redirect to login.",
  );
  assert.equal(
    adminPage.headers.get("X-Robots-Tag"),
    "noindex, nofollow, noarchive",
    "Edge Middleware must add noindex to admin page redirects.",
  );
  const location = adminPage.headers.get("Location");
  assert.ok(location, "Admin redirect must include a Location header.");
  const redirect = new URL(location, baseUrl);
  assert.equal(redirect.pathname, "/login");
  assert.equal(
    redirect.searchParams.get("redirect"),
    "/admin/users?tab=roles",
  );

  console.log(
    JSON.stringify(
      {
        result: "PASS",
        runtime: "local Workerd via Wrangler",
        checks: [
          "Next.js 16 Edge Middleware executed in generated Cloudflare Worker",
          "Preview HTML page carries one X-Robots-Tag noindex directive set",
          "Preview robots response carries X-Robots-Tag noindex",
          "anonymous admin API remains 401 and noindex",
          "anonymous admin page redirects to login and preserves return URL",
        ],
        databaseCredentialsProvided: false,
        databaseConnectionsAttempted: false,
        workerUploaded: false,
        workerDeployed: false,
        productionAccessed: false,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : "Workerd Edge Middleware smoke failed.");
  if (workerOutput) console.error(workerOutput);
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
  await rm(configPath, { force: true });
}
