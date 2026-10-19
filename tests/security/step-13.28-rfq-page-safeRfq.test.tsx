import { describe, it, expect, vi, beforeEach } from "vitest";

/* ============================================================
   STEP 13.28 — BEHAVIORAL TESTS: /rfq/[id] page safeRfq wiring
   ------------------------------------------------------------
   P1-B fix: the page builds `safeRfq` with viewer-aware PII
   redaction + quote visibility filtering, AND the JSX render
   must read from `safeRfq` (NOT raw `rfq`).

   Strategy:
   1. Render the page component with mocked db + auth for three
      viewer roles (buyer, seller-who-quoted, other-seller) and
      inspect the rendered HTML string for PII presence.
   2. Structural check: confirm the source file's render section
      uses safeRfq (not raw rfq.*) for PII fields — guards
      against reverting to the dead-code state.

   Uses react-dom/server renderToStaticMarkup to get the HTML.
   ============================================================ */

import { renderToStaticMarkup } from "react-dom/server";

// ── Mock db ──────────────────────────────────────────────
const mockRFQFindUnique = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    rFQ: { findUnique: mockRFQFindUnique },
  },
}));

// Mock notFound + redirect so they throw sentinel errors we can catch.
// Next.js throws special sentinel strings; we mock to throw our own.
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("__NOT_FOUND__");
  },
  redirect: (url: string) => {
    throw new Error(`__REDIRECT__:${url}`);
  },
}));

// Also mock @/navigation alias in case it's imported that way
vi.mock("@/navigation", () => ({
  notFound: () => {
    throw new Error("__NOT_FOUND__");
  },
  redirect: (url: string) => {
    throw new Error(`__REDIRECT__:${url}`);
  },
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/components/layout/Header", () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="header">{children}</div>
  ),
}));
vi.mock("@/components/layout/Footer", () => ({
  default: () => <div data-testid="footer" />,
}));

const { getCurrentUser } = await import("@/lib/auth");

// ── Mock RFQ with 3 quotes from 3 different sellers ──
const MOCK_RFQ = {
  id: "rfq-1",
  title: "Test RFQ",
  description: "desc",
  machineType: "Excavator",
  brandPref: "Caterpillar",
  quantity: 1,
  specJson: null,
  budgetMin: 100000000n,
  budgetMax: 200000000n,
  location: "Tehran",
  deadline: new Date("2026-12-01"),
  terms: null,
  status: "OPEN",
  buyerName: "Ali Buyer",
  buyerPhone: "09120000001", // PII — only buyer sees
  buyerEmail: "ali@buyer.com", // PII — only buyer sees
  buyerId: "buyer-001",
  buyer: {
    id: "buyer-001",
    firstName: "Ali",
    lastName: "Buyer",
    mobile: "09120000001",
    email: "ali@buyer.com",
  },
  createdAt: new Date("2026-10-01"),
  updatedAt: new Date("2026-10-01"),
  quotes: [
    {
      id: "quote-1",
      sellerId: "seller-A",
      sellerName: "Seller A",
      sellerPhone: "09120000010",
      sellerEmail: "a@seller.com",
      unitPrice: 150000000n,
      totalPrice: 150000000n,
      deliveryTime: "7 days",
      notes: "Best price",
      status: "PENDING",
      createdAt: new Date("2026-10-02"),
    },
    {
      id: "quote-2",
      sellerId: "seller-B",
      sellerName: "Seller B",
      sellerPhone: "09120000020",
      sellerEmail: "b@seller.com",
      unitPrice: 160000000n,
      totalPrice: 160000000n,
      deliveryTime: "5 days",
      notes: "Faster",
      status: "PENDING",
      createdAt: new Date("2026-10-03"),
    },
    {
      id: "quote-3",
      sellerId: "seller-C",
      sellerName: "Seller C",
      sellerPhone: "09120000030",
      sellerEmail: "c@seller.com",
      unitPrice: 140000000n,
      totalPrice: 140000000n,
      deliveryTime: "10 days",
      notes: "Cheapest",
      status: "PENDING",
      createdAt: new Date("2026-10-04"),
    },
  ],
};

async function renderPageForUser(userId: string | null): Promise<string> {
  vi.mocked(getCurrentUser).mockResolvedValue(
    userId ? ({ id: userId } as any) : null,
  );
  mockRFQFindUnique.mockResolvedValue(MOCK_RFQ);

  // dynamic import so mocks apply
  const mod = await import("@/app/rfq/[id]/page");
  const Page = mod.default;
  const element = await Page({
    params: Promise.resolve({ id: "rfq-1" }),
  });
  return renderToStaticMarkup(element as React.ReactElement);
}

describe("STEP 13.28 — /rfq/[id] page safeRfq wiring + PII redaction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Case 1: Buyer sees their own buyer PII + all quotes ──
  it("buyer sees buyerPhone, buyerEmail, and ALL 3 seller quotes", async () => {
    const html = await renderPageForUser("buyer-001");
    // Buyer's own PII visible
    expect(html).toContain("09120000001");
    expect(html).toContain("ali@buyer.com");
    // All 3 quotes visible (seller names are trust signals)
    expect(html).toContain("Seller A");
    expect(html).toContain("Seller B");
    expect(html).toContain("Seller C");
    // Buyer sees seller phones (to contact them)
    expect(html).toContain("09120000010");
    expect(html).toContain("09120000020");
    expect(html).toContain("09120000030");
  });

  // ── Case 2: Seller-B sees ONLY their own quote; no buyer PII; no competitor phones ──
  it("seller-B sees ONLY own quote; no buyer PII; no competitor phones", async () => {
    const html = await renderPageForUser("seller-B");
    // Own quote visible
    expect(html).toContain("Seller B");
    // Own quote price rendered (formatFullPrice uses Persian numerals + thousand sep)
    expect(html).toContain("۱۶۰٬۰۰۰٬۰۰۰");
    // Competitor quotes NOT visible
    expect(html).not.toContain("Seller A");
    expect(html).not.toContain("Seller C");
    // Competitor phones NOT visible
    expect(html).not.toContain("09120000010");
    expect(html).not.toContain("09120000030");
    // Buyer PII NOT visible
    expect(html).not.toContain("09120000001");
    expect(html).not.toContain("ali@buyer.com");
    // Buyer name IS visible (trust signal)
    expect(html).toContain("Ali Buyer");
  });

  // ── Case 3: Seller-X (not quoted) sees NO quotes + no buyer PII ──
  it("seller-X (not quoted) sees NO quotes and no buyer PII", async () => {
    const html = await renderPageForUser("seller-X");
    // No quotes at all
    expect(html).not.toContain("Seller A");
    expect(html).not.toContain("Seller B");
    expect(html).not.toContain("Seller C");
    // No seller phones
    expect(html).not.toContain("09120000010");
    expect(html).not.toContain("09120000020");
    expect(html).not.toContain("09120000030");
    // No buyer PII
    expect(html).not.toContain("09120000001");
    expect(html).not.toContain("ali@buyer.com");
    // Buyer name IS visible (trust signal)
    expect(html).toContain("Ali Buyer");
  });

  // ── Case 4: Unauthenticated → redirect ──
  it("unauthenticated user is redirected (not rendered with PII)", async () => {
    await expect(renderPageForUser(null)).rejects.toThrow(/__REDIRECT__/);
  });

  // ── Case 5: RFQ not found → notFound sentinel ──
  it("nonexistent RFQ throws notFound", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "u1" } as any);
    mockRFQFindUnique.mockResolvedValue(null);
    const mod = await import("@/app/rfq/[id]/page");
    await expect(
      mod.default({ params: Promise.resolve({ id: "nope" }) }),
    ).rejects.toThrow(/__NOT_FOUND__/);
  });

  // ── Case 6: No-PII RFQ (null phone/email) renders without error ──
  it("RFQ with null buyerPhone/Email renders without crash", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "buyer-001" } as any);
    mockRFQFindUnique.mockResolvedValue({
      ...MOCK_RFQ,
      buyerPhone: null,
      buyerEmail: null,
    });
    const mod = await import("@/app/rfq/[id]/page");
    const el = await mod.default({
      params: Promise.resolve({ id: "rfq-1" }),
    });
    const html = renderToStaticMarkup(el as React.ReactElement);
    expect(html).toContain("Test RFQ"); // page rendered
    // No crash; buyer name still visible
    expect(html).toContain("Ali Buyer");
  });

  // ── Regression guard: verify the source render section does NOT
  //    reference raw rfq.buyerPhone / rfq.buyerEmail / rfq.quotes
  //    (i.e., safeRfq is actually wired in, not dead code). ──
  it("regression guard: render section uses safeRfq, not raw rfq.* for PII", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync("src/app/rfq/[id]/page.tsx", "utf-8");
    // Find the return ( render section starts after `const safeRfq = {` closes
    const returnIdx = src.indexOf("return (", src.indexOf("const safeRfq"));
    expect(returnIdx).toBeGreaterThan(0);
    const renderSection = src.slice(returnIdx);
    // Strip comments (// ... and /* ... */) so comment mentions of
    // rfq.buyerPhone don't trip the guard — only actual CODE refs count.
    const codeOnly = renderSection
      .replace(/\/\/[^\n]*/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    // Raw rfq.* PII must NOT appear in the render CODE (only in safeRfq construction above)
    expect(codeOnly).not.toMatch(/rfq\.buyerPhone/);
    expect(codeOnly).not.toMatch(/rfq\.buyerEmail/);
    expect(codeOnly).not.toMatch(/rfq\.buyerId\b/);
    // rfq.quotes must not be iterated in render (use safeRfq.quotes)
    expect(codeOnly).not.toMatch(/rfq\.quotes\.map/);
    // safeRfq must be referenced
    expect(codeOnly).toMatch(/safeRfq\./);
  });
});
