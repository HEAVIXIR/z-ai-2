/**
 * HEAVIX — isolated Chromium acceptance test for BuyRequest media.
 *
 * This is a real Chromium browser journey against a local Next.js server and
 * disposable PostgreSQL database. It exercises the same-origin HTTP APIs and
 * actual <img> rendering; it does not claim to automate the disabled WANTED
 * wizard image control. No production/Preview endpoint is used.
 *
 * Authentication fixtures are canonical hashed Session rows in the disposable
 * test database. No test-only auth bypass route is added to the application.
 */
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import { deflateSync } from "node:zlib";
import { PrismaClient } from "@prisma/client";
import { deleteAsset, getAsset } from "../../src/lib/media-service";

type PageLike = {
  goto(url: string, options?: { waitUntil?: string }): Promise<{ status(): number } | null>;
  evaluate<Arg, Result>(fn: ((arg: Arg) => Result | Promise<Result>) | string, arg: Arg): Promise<Awaited<Result>>;
};
type APIResponseLike = {
  status(): number;
  headers(): Promise<Record<string, string>>;
};
type ContextLike = {
  addCookies(cookies: Array<{ name: string; value: string; url: string; httpOnly: boolean; sameSite: "Lax" }>): Promise<void>;
  request: {
    get(url: string, options: { maxRedirects: number }): Promise<APIResponseLike>;
  };
  newPage(): Promise<PageLike>;
  close(): Promise<void>;
};
type BrowserLike = {
  newContext(): Promise<ContextLike>;
  close(): Promise<void>;
};
type ChromiumLike = {
  launch(options: { headless: boolean }): Promise<BrowserLike>;
};

const databaseUrl = process.env.DATABASE_URL ?? "";
const baseUrl = process.env.HEAVIX_E2E_BASE_URL ?? "http://127.0.0.1:3000";
const adminMobile = process.env.ADMIN_USERNAME ?? "";
const playwrightRoot = process.env.PLAYWRIGHT_INSTALL_DIR ?? "";
const prisma = new PrismaClient();

function assertIsolatedEnvironment(): void {
  assert.equal(process.env.HEAVIX_ENV, "preview", "HEAVIX_ENV must explicitly identify the isolated preview/test runtime");
  assert.notEqual(process.env.NODE_ENV, "production", "production runtime is forbidden");
  assert.ok(adminMobile, "ADMIN_USERNAME is required");
  assert.ok(playwrightRoot, "PLAYWRIGHT_INSTALL_DIR is required");
  const parsed = new URL(databaseUrl);
  assert.ok(["localhost", "127.0.0.1", "::1"].includes(parsed.hostname.replace(/^\[|\]$/g, "")), "database must be loopback-only");
  assert.match(decodeURIComponent(parsed.pathname), /_test$/i, "database name must end in _test");
  assert.equal(new URL(baseUrl).origin, "http://127.0.0.1:3000", "browser test may only target the local disposable app");
  assert.equal(process.env.B2_BUCKET_NAME, "heavix-dev-assets");
  assert.equal(process.env.B2_MEDIA_PREFIX, "heavix-media/");
  assert.equal(process.env.B2_REGION, "us-east-005");
  assert.equal(process.env.B2_S3_ENDPOINT, "https://s3.us-east-005.backblazeb2.com");
}

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBytes = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
  return Buffer.concat([length, typeBytes, data, checksum]);
}

function createPngFixture(): Buffer {
  const width = 64;
  const height = 64;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 4 + 1);
    raw[row] = 0; // PNG filter: None
    for (let x = 0; x < width; x++) {
      const offset = row + 1 + x * 4;
      raw[offset] = 30 + (x % 180);
      raw[offset + 1] = 70 + (y % 150);
      raw[offset + 2] = 120;
      raw[offset + 3] = 255;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

async function createSession(userId: string): Promise<string> {
  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(rawToken, "utf8").digest("hex");
  await prisma.session.create({
    data: {
      userId,
      token: tokenHash,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    },
  });
  return rawToken;
}

async function browserContext(browser: BrowserLike, rawToken?: string): Promise<{ context: ContextLike; page: PageLike }> {
  const context = await browser.newContext();
  if (rawToken) {
    await context.addCookies([{
      name: "heavix-user",
      value: rawToken,
      url: baseUrl,
      httpOnly: true,
      sameSite: "Lax",
    }]);
  }
  const page = await context.newPage();
  const response = await page.goto(`${baseUrl}/api/media/staging`, { waitUntil: "domcontentloaded" });
  assert.ok(response, "local Next.js app must respond");
  assert.equal(response.status(), rawToken ? 200 : 401, "browser context must resolve its canonical session state");
  return { context, page };
}

type FetchResult = {
  status: number;
  body: Record<string, unknown> | null;
  cacheControl: string | null;
  location: string | null;
};

async function browserFetch(page: PageLike, input: { path: string; method?: string; body?: Record<string, unknown>; fileBase64?: string; redirect?: "follow" | "manual" }): Promise<FetchResult> {
  const browserScript = `(async () => {
    const request = ${JSON.stringify(input)};
    const headers = new Headers();
    let body;
    if (request.fileBase64) {
      const binary = atob(request.fileBase64);
      const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
      const form = new FormData();
      form.append("file", new Blob([bytes], { type: "image/png" }), "wanted-media-browser-e2e.png");
      form.append("entityType", "BuyRequest");
      body = form;
    } else if (request.body) {
      headers.set("Content-Type", "application/json");
      body = JSON.stringify(request.body);
    }
    if (request.path === "/api/wanted" && request.method === "POST") headers.set("Idempotency-Key", String(request.body?.__idempotencyKey ?? ""));
    const response = await fetch(request.path, { method: request.method ?? "GET", headers, body, cache: "no-store", redirect: request.redirect ?? "follow" });
    let payload = null;
    if ((response.headers.get("content-type") ?? "").includes("application/json")) payload = await response.json();
    return { status: response.status, body: payload, cacheControl: response.headers.get("cache-control"), location: response.headers.get("location") };
  })()`;
  return page.evaluate<null, FetchResult>(browserScript, null);
}

async function browserRedirectFetch(context: ContextLike, mediaPath: string): Promise<FetchResult> {
  // Browser fetch() intentionally exposes manual redirects as opaqueredirect
  // (status 0, no headers). Use the context-bound API client instead; it shares
  // this browser context's cookie jar and can inspect the actual 302/404.
  const response = await context.request.get(`${baseUrl}${mediaPath}`, { maxRedirects: 0 });
  const headers = await response.headers();
  return {
    status: response.status(),
    body: null,
    cacheControl: headers["cache-control"] ?? null,
    location: headers.location ?? null,
  };
}

async function loadImage(page: PageLike, mediaUrl: string): Promise<{ width: number; height: number }> {
  const browserScript = `(async () => {
    const image = new Image();
    await new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error("image load timed out")), 20000);
      image.onload = () => { window.clearTimeout(timeout); resolve(); };
      image.onerror = () => { window.clearTimeout(timeout); reject(new Error("browser could not render the media URL")); };
      image.src = ${JSON.stringify(mediaUrl)};
    });
    return { width: image.naturalWidth, height: image.naturalHeight };
  })()`;
  return page.evaluate<null, { width: number; height: number }>(browserScript, null);
}

// WANTED_MEDIA_BROWSER_E2E: exercise the real seven-step wizard's demand taxonomy entry path.
async function runWantedWizardUiSmoke(page: PageLike): Promise<{ ok: boolean; detail: string }> {
  await page.goto(`${baseUrl}/listings/new`, { waitUntil: "domcontentloaded" });
  const browserScript = `(async () => {
    const pause = () => new Promise(resolve => window.setTimeout(resolve, 80));
    const waitFor = async (predicate, label) => {
      for (let attempt = 0; attempt < 50; attempt++) {
        if (predicate()) return;
        await pause();
      }
      throw new Error("Timed out waiting for " + label);
    };
    const button = label => Array.from(document.querySelectorAll("button")).find(item => (item.textContent || "").replace(/\\s+/g, " ").trim().includes(label));
    const click = async label => {
      await waitFor(() => { const candidate = button(label); return !!candidate && !candidate.disabled; }, "enabled button: " + label);
      button(label).click();
      await pause();
    };
    try {
      const typeResponse = await fetch("/api/transaction-types", { cache: "no-store" });
      if (!typeResponse.ok) throw new Error("transaction types API failed");
      const typePayload = await typeResponse.json();
      const wantedType = typePayload.types && typePayload.types.find(item => item.key === "WANTED");
      if (!wantedType) throw new Error("WANTED transaction type is not configured");
      await waitFor(() => !!button(wantedType.nameFa), "WANTED transaction card");
      await click(wantedType.nameFa);
      await click("خرید");
      await click("مرحله بعد");
      await waitFor(() => document.body.innerText.includes("دسته‌بندی موضوع آگهی"), "marketplace category step");
      const taxonomyResponse = await fetch("/api/taxonomy", { cache: "no-store" });
      if (!taxonomyResponse.ok) throw new Error("taxonomy API failed");
      const taxonomy = await taxonomyResponse.json();
      const marketplaceRoot = taxonomy.marketplaceRoots && taxonomy.marketplaceRoots.find(item => item.name === "HEAVIX Browser E2E Machine");
      const serviceRoot = taxonomy.serviceRoots && taxonomy.serviceRoots.find(item => item.name === "HEAVIX Browser E2E Service");
      if (!marketplaceRoot || !serviceRoot) throw new Error("isolated marketplace/service taxonomy fixtures are missing");
      await click(marketplaceRoot.name);
      await click("مرحله بعد");
      await waitFor(() => document.body.innerText.includes("اطلاعات پایه"), "base information step");
      await click("مرحله قبل");
      await click("مرحله قبل");
      await click("خدمات");
      await click("مرحله بعد");
      await waitFor(() => document.body.innerText.includes("دسته‌بندی خدمات"), "service category step");
      if (document.body.innerText.includes(marketplaceRoot.name)) throw new Error("marketplace category leaked into service taxonomy after intent switch");
      await click(serviceRoot.name);
      await waitFor(() => { const next = button("مرحله بعد"); return !!next && !next.disabled; }, "terminal service category selection");
      return { ok: true, detail: "WANTED buy → marketplace category → back → service intent → service taxonomy → terminal category" };
    } catch (error) {
      return { ok: false, detail: error && error.message ? error.message : String(error) };
    }
  })()`;
  return page.evaluate<null, { ok: boolean; detail: string }>(browserScript, null);
}

async function main(): Promise<void> {
  assertIsolatedEnvironment();
  // This isolated DB intentionally does not run the broad production taxonomy seed.
  // Provision only the public WANTED transaction option required by the real wizard.
  await prisma.transactionType.upsert({
    where: { key: "WANTED" },
    update: { active: true },
    create: {
      key: "WANTED",
      nameFa: "درخواست خرید",
      nameEn: "Wanted",
      active: true,
      sortOrder: 3,
    },
  });
  const requireFromPlaywright = createRequire(path.join(playwrightRoot, "package.json"));
  const chromium = requireFromPlaywright("playwright").chromium as ChromiumLike;

  const buyer = await prisma.user.findUnique({ where: { email: "test-fixture-buyer-1@heavix.local" } });
  const admin = await prisma.user.findUnique({ where: { mobile: adminMobile } });
  assert.ok(buyer && buyer.status === "ACTIVE", "active buyer fixture must exist");
  assert.ok(admin && admin.status === "ACTIVE", "active CI admin fixture must exist");

  const reviewerRole = await prisma.role.findUnique({ where: { key: "MODERATOR" } });
  assert.ok(reviewerRole, "MODERATOR role must be seeded");
  const reviewer = await prisma.user.upsert({
    where: { mobile: "09129999991" },
    update: { status: "ACTIVE" },
    create: {
      firstName: "Browser",
      lastName: "Reviewer",
      email: "test-fixture-media-reviewer@heavix.local",
      mobile: "09129999991",
      passwordHash: "browser-e2e-session-only",
      role: "BUYER",
      status: "ACTIVE",
      emailVerified: true,
      mobileVerified: true,
    },
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: reviewer.id, roleId: reviewerRole.id } },
    update: {},
    create: { userId: reviewer.id, roleId: reviewerRole.id },
  });

  const country = await prisma.country.upsert({
    where: { name: "HEAVIX Browser E2E Country" },
    update: {},
    create: { name: "HEAVIX Browser E2E Country", nameEn: "HEAVIX Browser E2E Country" },
  });
  const province = await prisma.province.upsert({
    where: { countryId_name: { countryId: country.id, name: "HEAVIX Browser E2E Province" } },
    update: {},
    create: { countryId: country.id, name: "HEAVIX Browser E2E Province", nameEn: "HEAVIX Browser E2E Province" },
  });
  const category = await prisma.category.upsert({
    where: { slug: "heavix-browser-e2e-machine" },
    update: { active: true, layer: "MARKETPLACE", domain: "MACHINE" },
    create: {
      name: "HEAVIX Browser E2E Machine",
      nameEn: "HEAVIX Browser E2E Machine",
      slug: "heavix-browser-e2e-machine",
      layer: "MARKETPLACE",
      domain: "MACHINE",
      active: true,
    },
  });
  await prisma.category.upsert({
    where: { slug: "heavix-browser-e2e-service" },
    update: { active: true, layer: "SERVICE", domain: "MACHINE" },
    create: {
      name: "HEAVIX Browser E2E Service",
      nameEn: "HEAVIX Browser E2E Service",
      slug: "heavix-browser-e2e-service",
      layer: "SERVICE",
      domain: "MACHINE",
      active: true,
    },
  });
  const buyerToken = await createSession(buyer.id);
  const reviewerToken = await createSession(reviewer.id);

  const browser = await chromium.launch({ headless: true });
  const contexts: ContextLike[] = [];
  let requestId: string | null = null;
  let assetId: string | null = null;
  try {
    const buyerBrowser = await browserContext(browser, buyerToken);
    contexts.push(buyerBrowser.context);
    const reviewerBrowser = await browserContext(browser, reviewerToken);
    contexts.push(reviewerBrowser.context);
    const publicBrowser = await browserContext(browser);
    contexts.push(publicBrowser.context);

    const wizardUi = await runWantedWizardUiSmoke(buyerBrowser.page);
    assert.equal(wizardUi.ok, true, `WANTED wizard UI flow failed: ${wizardUi.detail}`);

    const policy = await browserFetch(buyerBrowser.page, { path: "/api/media/staging" });
    assert.equal(policy.status, 200, "authenticated staging policy must be available");
    assert.ok(Number((policy.body?.policy as Record<string, unknown> | undefined)?.maxImages ?? 0) >= 1);

    const imageBytes = createPngFixture();
    const upload = await browserFetch(buyerBrowser.page, {
      path: "/api/media/staging",
      method: "POST",
      fileBase64: imageBytes.toString("base64"),
    });
    assert.equal(upload.status, 200, `private B2 staging upload failed: ${JSON.stringify(upload.body)}`);
    assetId = String(upload.body?.assetId ?? "");
    assert.match(assetId, /^[a-f0-9]{24}$/);
    assert.equal(upload.body?.url, `/api/media/${assetId}`);

    const idempotencyKey = randomUUID();
    const createBody: Record<string, unknown> = {
      title: "HEAVIX isolated browser media acceptance request",
      description: "Disposable browser acceptance fixture; safe to remove after this run.",
      quantity: 1,
      intent: "SALE",
      categoryId: category.id,
      countryId: country.id,
      provinceId: province.id,
      assetIds: [assetId],
      __idempotencyKey: idempotencyKey,
    };
    const created = await browserFetch(buyerBrowser.page, {
      path: "/api/wanted",
      method: "POST",
      body: createBody,
    });
    assert.ok([200, 201].includes(created.status), `BuyRequest create failed: ${JSON.stringify(created.body)}`);
    requestId = String(created.body?.id ?? "");
    assert.ok(requestId, "BuyRequest response must include its id");
    assert.equal(created.body?.status, "PENDING", "new request must remain pending moderation");
    assert.equal(created.body?.mediaStatus, "ATTACHED", "request media must reconcile to ATTACHED");
    assert.equal(created.body?.mediaPendingCount, 0);

    const persisted = await prisma.buyRequest.findUnique({
      where: { id: requestId },
      include: { images: { orderBy: { sortOrder: "asc" } } },
    });
    assert.ok(persisted, "BuyRequest row must be persisted");
    assert.equal(persisted.status, "PENDING");
    assert.equal(persisted.publishedAt, null);
    assert.equal(persisted.images.length, 1);
    assert.equal(persisted.images[0].assetId, assetId);

    const attachedAsset = await getAsset(assetId);
    assert.ok(attachedAsset, "B2 sidecar must be readable after create");
    assert.equal(attachedAsset.status, "ATTACHED");
    assert.equal(attachedAsset.visibility, "PRIVATE");
    assert.equal(attachedAsset.entityType, "BuyRequest");
    assert.equal(attachedAsset.entityId, requestId);
    assert.equal(attachedAsset.uploadedBy, buyer.id);

    const ownerRead = await browserRedirectFetch(buyerBrowser.context, `/api/media/${assetId}`);
    assert.equal(ownerRead.status, 302, "owner must receive a private signed redirect before moderation");
    assert.match(ownerRead.cacheControl ?? "", /private,\s*no-store/i);
    const ownerImage = await loadImage(buyerBrowser.page, `/api/media/${assetId}`);
    assert.ok(ownerImage.width > 0 && ownerImage.height > 0, "owner browser must render the pending private image");

    const reviewerQueue = await browserFetch(reviewerBrowser.page, {
      path: "/api/admin/requests?status=PENDING&limit=100",
    });
    assert.equal(reviewerQueue.status, 200, "request.read reviewer must access the moderation queue");
    const queueRows = Array.isArray(reviewerQueue.body?.data) ? reviewerQueue.body.data as Array<Record<string, unknown>> : [];
    const reviewRow = queueRows.find((row) => row.id === requestId);
    assert.ok(reviewRow, "moderation queue must include the pending request");
    const reviewImages = Array.isArray(reviewRow.images) ? reviewRow.images as Array<Record<string, unknown>> : [];
    assert.equal(reviewImages.length, 1);
    assert.equal(reviewImages[0].url, `/api/media/${assetId}`);

    const reviewerRead = await browserRedirectFetch(reviewerBrowser.context, `/api/media/${assetId}`);
    assert.equal(reviewerRead.status, 302, "request.read reviewer must receive a private signed redirect");
    assert.match(reviewerRead.cacheControl ?? "", /private,\s*no-store/i);
    const reviewerImage = await loadImage(reviewerBrowser.page, `/api/media/${assetId}`);
    assert.ok(reviewerImage.width > 0 && reviewerImage.height > 0, "reviewer browser must render the pending private image");

    const anonymousBeforePublish = await browserRedirectFetch(publicBrowser.context, `/api/media/${assetId}`);
    assert.equal(anonymousBeforePublish.status, 404, "anonymous users must not read pending BuyRequest media");
    const publicListBefore = await browserFetch(publicBrowser.page, { path: "/api/wanted?limit=100" });
    const publicRowsBefore = Array.isArray(publicListBefore.body?.data) ? publicListBefore.body.data as Array<Record<string, unknown>> : [];
    assert.ok(!publicRowsBefore.some((row) => row.id === requestId), "pending request must not appear in public feed");

    const approved = await browserFetch(reviewerBrowser.page, {
      path: `/api/admin/requests/${requestId}`,
      method: "PATCH",
      body: { action: "approve" },
    });
    assert.equal(approved.status, 200, `moderation approval failed: ${JSON.stringify(approved.body)}`);
    assert.equal((approved.body?.request as Record<string, unknown> | undefined)?.status, "ACTIVE");

    const published = await prisma.buyRequest.findUnique({ where: { id: requestId } });
    assert.equal(published?.status, "ACTIVE");
    assert.ok(published?.publishedAt instanceof Date && published.publishedAt.getTime() <= Date.now());

    const publicListAfter = await browserFetch(publicBrowser.page, { path: "/api/wanted?limit=100" });
    const publicRowsAfter = Array.isArray(publicListAfter.body?.data) ? publicListAfter.body.data as Array<Record<string, unknown>> : [];
    assert.ok(publicRowsAfter.some((row) => row.id === requestId), "published request must appear in public feed");

    const publicMediaRead = await browserRedirectFetch(publicBrowser.context, `/api/media/${assetId}`);
    assert.equal(publicMediaRead.status, 302, "public media route must issue a signed redirect after moderation");
    assert.match(publicMediaRead.cacheControl ?? "", /private,\s*no-store/i);
    const publicImage = await loadImage(publicBrowser.page, `/api/media/${assetId}`);
    assert.ok(publicImage.width > 0 && publicImage.height > 0, "anonymous browser must render the published image");

    const replay = await browserFetch(buyerBrowser.page, {
      path: "/api/wanted",
      method: "POST",
      body: createBody,
    });
    assert.equal(replay.status, 200, `idempotent replay failed: ${JSON.stringify(replay.body)}`);
    assert.equal(replay.body?.id, requestId);
    assert.equal(replay.body?.idempotentReplay, true);

    for (let attempt = 0; attempt < 2; attempt++) {
      const retry = await browserFetch(buyerBrowser.page, {
        path: `/api/wanted/${requestId}/media`,
        method: "POST",
        body: {},
      });
      assert.equal(retry.status, 200, `media retry attempt ${attempt + 1} failed: ${JSON.stringify(retry.body)}`);
      assert.equal(retry.body?.attachedCount, 1);
      assert.equal(retry.body?.pendingCount, 0);
    }

    const finalImageCount = await prisma.buyRequestImage.count({ where: { buyRequestId: requestId } });
    assert.equal(finalImageCount, 1, "idempotent create/retry must not duplicate relational image rows");
    const finalAsset = await getAsset(assetId);
    assert.equal(finalAsset?.status, "ATTACHED");
    assert.equal(finalAsset?.entityId, requestId);

    console.log(JSON.stringify({
      result: "PASS",
      browser: "Chromium",
      database: "disposable PostgreSQL *_test",
      storage: "isolated Backblaze B2 bucket/prefix",
      checks: [
        "real Chromium WANTED wizard: buy → marketplace taxonomy → service intent switch → service taxonomy",
        "authenticated private staging upload",
        "BuyRequest + relational image manifest persistence",
        "B2 sidecar attachment and owner-private rendering",
        "request.read reviewer queue and private image rendering",
        "pending request/image hidden from anonymous users",
        "moderation approval and published request visibility",
        "anonymous browser rendering after publication",
        "idempotent create replay and repeated media retry",
        "single canonical BuyRequestImage row after retries",
      ],
      requestId,
      assetId,
    }, null, 2));
  } finally {
    for (const context of contexts) await context.close().catch(() => {});
    await browser.close().catch(() => {});
    if (assetId) {
      const deleted = await deleteAsset(assetId, admin.id);
      if (!deleted.ok) throw new Error(`E2E cleanup could not delete B2 asset ${assetId}: ${deleted.error ?? "unknown"}`);
    }
    if (requestId) {
      await prisma.buyRequest.deleteMany({ where: { id: requestId } });
    }
  }
}

main()
  .catch((error) => {
    console.error("[wanted-media-browser-e2e] FAIL", error instanceof Error ? error.stack ?? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
