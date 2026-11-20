/**
 * HEAVIX — Active listing quota concurrency proof (real PostgreSQL).
 *
 * Exercises the real POST /api/listings handler against PostgreSQL. Three
 * pending SERVICE_OFFER supply listings fill a four-listing policy to 3/4.
 * Two requests are then held after their independent preflight counts so both
 * observe 3 active listings before either enters its Serializable write
 * transaction. Exactly one may commit; the other must fail closed (403 quota
 * reached after the in-transaction recheck, or 409 on P2034 serialization).
 *
 * This is deliberately an HTTP-handler + real-DB test, not a source-contract
 * assertion and not a synthetic transaction-only test.
 *
 * CI: bunx vitest run --config vitest.integration.config.ts
 *     tests/integration/listing-quota-concurrency-real.test.ts
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));
vi.mock("@/lib/csrf", () => ({
  checkCsrf: vi.fn(() => true),
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(() => ({ ok: true, resetAt: Date.now() + 60_000 })),
  retryAfterSeconds: vi.fn(() => 1),
}));
vi.mock("@/lib/listing-image-policy", () => ({
  getListingImagePolicy: vi.fn(async () => ({
    maxListings: 4,
    maxImages: 4,
    maxImageBytes: 1024 * 1024,
  })),
}));
vi.mock("@/lib/audit", () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/analytics", () => ({
  trackEvent: vi.fn(),
}));
vi.mock("@/lib/error-tracking", () => ({
  trackError: vi.fn(),
}));
vi.mock("@/lib/media-service", () => ({
  getAsset: vi.fn(),
  attachAsset: vi.fn(),
}));

const RUN =
  process.env.DATABASE_URL?.startsWith("postgresql://") ||
  process.env.DATABASE_URL?.startsWith("postgres://");

async function independentCleanup(ops: Array<() => Promise<unknown>>) {
  const errors: Error[] = [];
  for (const op of ops) {
    try {
      await op();
    } catch (error) {
      errors.push(error as Error);
    }
  }
  if (errors.length) {
    throw new AggregateError(errors, "Listing quota integration cleanup failed");
  }
}

describe.skipIf(!RUN)("Listing quota — concurrent HTTP creates (real PostgreSQL)", () => {
  const suffix = Date.now().toString(36);
  const slugPrefix = `quota-${suffix}-`;
  let sellerId: string | undefined;
  let categoryId: string | undefined;
  let serviceTypeId: string | undefined;
  let transactionTypeId: string | undefined;
  let countryId: string | undefined;
  let provinceId: string | undefined;
  let createdTransactionType = false;
  let postListing: ((label: string) => Promise<Response>) | undefined;

  beforeAll(async () => {
    const user = await db.user.create({
      data: {
        firstName: "Quota",
        lastName: "Concurrency",
        email: `quota-concurrency-${suffix}@example.test`,
        mobile: `09${Date.now().toString().slice(-9)}`,
        passwordHash: "integration-test-only",
      },
      select: { id: true },
    });
    sellerId = user.id;
    mocks.getCurrentUser.mockResolvedValue({ id: sellerId });

    // Listing creation now enforces canonical country/province selection at
    // the HTTP boundary. Keep this real-PostgreSQL fixture aligned with that
    // contract rather than weakening the production validation.
    const country = await db.country.create({
      data: {
        name: `Quota Test Country ${suffix}`,
        nameEn: `Quota Test Country ${suffix}`,
        code: `QT${suffix.toUpperCase()}`,
      },
      select: { id: true },
    });
    countryId = country.id;
    const province = await db.province.create({
      data: {
        countryId,
        name: `Quota Test Province ${suffix}`,
        nameEn: `Quota Test Province ${suffix}`,
      },
      select: { id: true },
    });
    provinceId = province.id;

    let transactionType = await db.transactionType.findUnique({
      where: { key: "SERVICE_OFFER" },
      select: { id: true, active: true },
    });
    if (!transactionType) {
      transactionType = await db.transactionType.create({
        data: {
          key: "SERVICE_OFFER",
          nameFa: "ارائه خدمت (تست سهمیه)",
          nameEn: "Service offer (quota test)",
          active: true,
        },
        select: { id: true, active: true },
      });
      createdTransactionType = true;
    }
    if (!transactionType.active) {
      throw new Error("SERVICE_OFFER transaction type is inactive in the integration database");
    }
    transactionTypeId = transactionType.id;

    const serviceType = await db.serviceType.create({
      data: {
        key: `QUOTA_TEST_${suffix.toUpperCase()}`,
        nameFa: "خدمت آزمایشی سهمیه",
        nameEn: "Quota test service",
        active: true,
      },
      select: { id: true },
    });
    serviceTypeId = serviceType.id;

    const category = await db.category.create({
      data: {
        name: "دسته آزمایشی خدمات سهمیه",
        nameEn: "Quota test service category",
        slug: `quota-service-${suffix}`,
        layer: "SERVICE",
        active: true,
      },
      select: { id: true },
    });
    categoryId = category.id;

    postListing = async (label: string) => {
      const { POST } = await import("@/app/api/listings/route");
      return POST(
        new Request("http://localhost/api/listings", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            transactionType: "SERVICE_OFFER",
            categoryId,
            serviceTypeId,
            countryId,
            provinceId,
            title: `Quota concurrency ${label} ${suffix}`,
            slug: `${slugPrefix}${label}`,
            description: "Disposable PostgreSQL integration fixture",
            shortDesc: "Quota concurrency fixture",
            sellerName: "Quota integration test",
          }),
        }),
      );
    };
  });

  afterAll(async () => {
    await independentCleanup([
      () =>
        sellerId
          ? db.listing.deleteMany({
              where: { sellerId, slug: { startsWith: slugPrefix } },
            })
          : Promise.resolve(),
      () =>
        categoryId
          ? db.category.delete({ where: { id: categoryId } })
          : Promise.resolve(),
      () =>
        provinceId
          ? db.province.delete({ where: { id: provinceId } })
          : Promise.resolve(),
      () =>
        countryId
          ? db.country.delete({ where: { id: countryId } })
          : Promise.resolve(),
      () =>
        serviceTypeId
          ? db.serviceType.delete({ where: { id: serviceTypeId } })
          : Promise.resolve(),
      () =>
        createdTransactionType && transactionTypeId
          ? db.transactionType.delete({ where: { id: transactionTypeId } })
          : Promise.resolve(),
      () =>
        sellerId
          ? db.user.delete({ where: { id: sellerId } })
          : Promise.resolve(),
    ]);
  });

  it("allows only one of two simultaneous creates when both preflight at 3/4", async () => {
    if (!postListing || !sellerId) throw new Error("Integration fixtures were not initialized");

    // Fill the seller's quota to one slot remaining using the real API.
    for (const label of ["baseline-1", "baseline-2", "baseline-3"]) {
      const response = await postListing(label);
      expect(response.status, `baseline ${label}: ${await response.clone().text()}`).toBe(200);
    }

    const activeWhere = {
      sellerId,
      listingType: { in: ["SALE", "RENT", "AUCTION", "SERVICE_OFFER"] },
      status: { in: ["PENDING", "PUBLISHED", "SCHEDULED"] },
    };
    expect(await db.listing.count({ where: activeWhere })).toBe(3);

    // Hold both global preflight count calls until both have independently
    // observed the same count. Transaction-client counts are intentionally not
    // intercepted: the real Serializable transaction must perform its recheck.
    const originalCount = db.listing.count.bind(db.listing);
    const preflightSnapshots: number[] = [];
    let releaseBarrier!: () => void;
    const barrier = new Promise<void>((resolve) => {
      releaseBarrier = resolve;
    });
    const timeout = setTimeout(releaseBarrier, 5_000);
    const countSpy = vi.spyOn(db.listing, "count").mockImplementation(async (args) => {
      const count = await originalCount(args);
      const where = (args as { where?: Record<string, unknown> }).where as
        | Record<string, any>
        | undefined;
      const isQuotaPreflight =
        where?.sellerId === sellerId &&
        where?.listingType?.in?.includes("SERVICE_OFFER") &&
        where?.status?.in?.includes("PENDING");
      if (isQuotaPreflight && preflightSnapshots.length < 2) {
        preflightSnapshots.push(count);
        if (preflightSnapshots.length === 2) releaseBarrier();
        await barrier;
      }
      return count;
    });

    let responses: Response[];
    try {
      responses = await Promise.all([
        postListing("race-a"),
        postListing("race-b"),
      ]);
    } finally {
      clearTimeout(timeout);
      releaseBarrier();
      countSpy.mockRestore();
    }

    expect(preflightSnapshots).toEqual([3, 3]);
    const statuses = responses.map((response) => response.status).sort((a, b) => a - b);
    expect(statuses.filter((status) => status === 200)).toHaveLength(1);
    expect(statuses.filter((status) => status === 403 || status === 409)).toHaveLength(1);

    // Independent read after both HTTP handlers settle: no oversubscription.
    expect(await db.listing.count({ where: activeWhere })).toBe(4);
  });
});
