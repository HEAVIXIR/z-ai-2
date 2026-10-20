import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";

/* ============================================================
   STEP 14.67 — RFQ Quote Visibility Integration Test (REAL PostgreSQL)
   ------------------------------------------------------------
   Tests getRFQ() against a REAL PostgreSQL database (not mock).
   Verifies the access matrix:
   - Buyer: sees ALL quotes + full PII
   - Seller who quoted: sees ONLY own quote + own sellerId
   - Unrelated seller: sees NO quotes, no PII
   - null/invalid viewerUserId: throws RFQServiceError(400)
   ============================================================ */

const RUN_TESTS = process.env.DATABASE_URL?.includes("localhost") ?? false;

describe.skipIf(!RUN_TESTS)("RFQ Quote Visibility — Real PostgreSQL Integration", () => {
  let testRunId: string;
  const createdUserIds: string[] = [];
  let buyerId: string | undefined;
  let sellerAId: string | undefined;
  let sellerBId: string | undefined;
  let sellerCId: string | undefined;
  let rfqId: string | undefined;

  beforeAll(async () => {
    const { db } = await import("@/lib/db");
    testRunId = `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    
    // Create test users
    const buyer = await db.user.create({
      data: {
        firstName: "TestBuyer",
        lastName: testRunId,
        email: `buyer-${testRunId}@test.example`,
        mobile: `09${testRunId.slice(-8)}`,
        passwordHash: "test-hash",
        role: "BUYER",
        status: "ACTIVE",
        emailVerified: true,
        mobileVerified: true,
      },
    });
    buyerId = buyer.id;
    createdUserIds.push(buyerId);

    const sellerA = await db.user.create({
      data: {
        firstName: "SellerA",
        lastName: testRunId,
        email: `sellerA-${testRunId}@test.example`,
        mobile: `11${testRunId.slice(-8)}`,
        passwordHash: "test-hash",
        role: "SELLER",
        status: "ACTIVE",
        emailVerified: true,
        mobileVerified: true,
      },
    });
    sellerAId = sellerA.id;
    createdUserIds.push(sellerAId);

    const sellerB = await db.user.create({
      data: {
        firstName: "SellerB",
        lastName: testRunId,
        email: `sellerB-${testRunId}@test.example`,
        mobile: `12${testRunId.slice(-8)}`,
        passwordHash: "test-hash",
        role: "SELLER",
        status: "ACTIVE",
        emailVerified: true,
        mobileVerified: true,
      },
    });
    sellerBId = sellerB.id;
    createdUserIds.push(sellerBId);

    const sellerC = await db.user.create({
      data: {
        firstName: "SellerC",
        lastName: testRunId,
        email: `sellerC-${testRunId}@test.example`,
        mobile: `13${testRunId.slice(-8)}`,
        passwordHash: "test-hash",
        role: "SELLER",
        status: "ACTIVE",
        emailVerified: true,
        mobileVerified: true,
      },
    });
    sellerCId = sellerC.id;
    createdUserIds.push(sellerCId);

    // Create RFQ
    const rfq = await db.rFQ.create({
      data: {
        title: `Test RFQ ${testRunId}`,
        description: "Test description",
        buyerId,
        buyerName: "TestBuyer",
        buyerPhone: "+98-9000-1111",
        buyerEmail: `buyer-${testRunId}@test.example`,
        status: "OPEN",
        quantity: 1,
        deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
    rfqId = rfq.id;

    // Create 2 quotes from sellerA and sellerB
    const quoteA = await db.rFQQuote.create({
      data: {
        rfqId,
        sellerId: sellerAId,
        sellerName: "SellerA",
        sellerPhone: "+98-9100-aaaa",
        sellerEmail: `sellerA-${testRunId}@test.example`,
        unitPrice: 1500,
        totalPrice: 1500,
        deliveryTime: "7",
        notes: "Quote from A",
        status: "PENDING",
      },
    });

    const quoteB = await db.rFQQuote.create({
      data: {
        rfqId,
        sellerId: sellerBId,
        sellerName: "SellerB",
        sellerPhone: "+98-9200-bbbb",
        sellerEmail: `sellerB-${testRunId}@test.example`,
        unitPrice: 1600,
        totalPrice: 1600,
        deliveryTime: "5",
        notes: "Quote from B",
        status: "PENDING",
      },
    });
  });

  afterAll(async () => {
    // Attempt every applicable cleanup even if one operation fails. Cleanup
    // failures must fail the suite rather than being logged and swallowed.
    const cleanupErrors: unknown[] = [];
    const attemptCleanup = async (label: string, action: () => Promise<unknown>) => {
      try {
        await action();
      } catch (error) {
        cleanupErrors.push(new Error(`Cleanup failed for ${label}`, { cause: error }));
      }
    };

    if (rfqId || createdUserIds.length > 0) {
      const { db } = await import("@/lib/db");

      // Quotes depend on the RFQ, so remove them first. Only use IDs for
      // entities whose creation completed successfully.
      if (rfqId) {
        await attemptCleanup("RFQ quotes", () =>
          db.rFQQuote.deleteMany({ where: { rfqId } })
        );
        await attemptCleanup("RFQ", () =>
          db.rFQ.delete({ where: { id: rfqId } })
        );
      }

      if (createdUserIds.length > 0) {
        await attemptCleanup("test users", () =>
          db.user.deleteMany({ where: { id: { in: createdUserIds } } })
        );
      }
    }

    if (cleanupErrors.length > 0) {
      throw new AggregateError(cleanupErrors, "RFQ integration-test cleanup failed");
    }
  });

  it("Buyer sees ALL quotes with full PII", async () => {
    const { getRFQ } = await import("@/lib/rfq-service");
    const result = await getRFQ(rfqId, buyerId);
    
    expect(result.quotes).toHaveLength(2);
    expect(result.buyerPhone).toBe("+98-9000-1111");
    expect(result.buyerEmail).toContain("@test.example");
    expect(result.buyerId).toBe(buyerId);
    expect(result.quotes[0].sellerId).toBeTruthy();
    expect(result.quotes[0].sellerPhone).toBeTruthy();
    expect(result.quotes[0].sellerEmail).toBeTruthy();
    expect(result.quoteCount).toBe(2);
  });

  it("Seller who quoted (A) sees ONLY own quote + own sellerId", async () => {
    const { getRFQ } = await import("@/lib/rfq-service");
    const result = await getRFQ(rfqId, sellerAId);
    
    expect(result.quotes).toHaveLength(1);
    expect(result.quotes[0].sellerId).toBe(sellerAId);
    expect(result.quotes[0].sellerPhone).toBeNull();
    expect(result.quotes[0].sellerEmail).toBeNull();
    expect(result.buyerPhone).toBeNull();
    expect(result.buyerEmail).toBeNull();
    expect(result.buyerId).toBeNull();
    expect(result.buyerName).toBe("TestBuyer");
    expect(result.quoteCount).toBe(2);
  });

  it("Unrelated seller (C) sees NO quotes and no PII", async () => {
    const { getRFQ } = await import("@/lib/rfq-service");
    const result = await getRFQ(rfqId, sellerCId);
    
    expect(result.quotes).toHaveLength(0);
    expect(result.buyerPhone).toBeNull();
    expect(result.buyerEmail).toBeNull();
    expect(result.buyerId).toBeNull();
    expect(result.buyerName).toBe("TestBuyer");
    expect(result.quoteCount).toBe(2);
  });

  it("null viewerUserId throws RFQServiceError(400)", async () => {
    const { getRFQ, RFQServiceError } = await import("@/lib/rfq-service");
    
    await expect(
      getRFQ(rfqId, null as unknown as string)
    ).rejects.toThrow(RFQServiceError);
  });

  it("empty string viewerUserId throws RFQServiceError(400)", async () => {
    const { getRFQ, RFQServiceError } = await import("@/lib/rfq-service");
    
    await expect(
      getRFQ(rfqId, "")
    ).rejects.toThrow(RFQServiceError);
  });

  it("undefined viewerUserId throws RFQServiceError(400)", async () => {
    const { getRFQ, RFQServiceError } = await import("@/lib/rfq-service");
    
    await expect(
      getRFQ(rfqId, undefined as unknown as string)
    ).rejects.toThrow(RFQServiceError);
  });

  it("whitespace-only viewerUserId throws RFQServiceError(400)", async () => {
    const { getRFQ, RFQServiceError } = await import("@/lib/rfq-service");
    
    await expect(
      getRFQ(rfqId, "   ")
    ).rejects.toThrow(RFQServiceError);
  });
});
