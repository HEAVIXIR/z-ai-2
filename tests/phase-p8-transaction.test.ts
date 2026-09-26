/**
 * HEAVIX — Phase P8: Rental + Auction + Commerce (Transaction deep)
 * ------------------------------------------------------------
 * Contract tests for the Phase 8 transaction deepening deliverables
 * described in PHASE8-RENTAL-AUCTION-COMMERCE:
 *
 *   1. src/lib/rental-service.ts — 7 exports:
 *        createRentalListing, requestBooking, approveBooking,
 *        startRental, completeRental, cancelBooking, checkAvailability
 *   2. src/lib/auction-service.ts — 4 exports:
 *        createAuction, placeBid, endAuction, getAuctionDetail
 *   3. src/lib/commerce-service.ts — 4 exports:
 *        createOrder, processPayment, refundPayment, getOrderDetail
 *   4. Routes:
 *        - /api/admin/store/rentals (GET list + POST create)
 *        - /api/admin/store/rentals/[id] (GET + PATCH + DELETE)
 *        - /api/admin/store/rentals/[id]/bookings (GET + POST)
 *        - /api/admin/store/rentals/[id]/bookings/[bookingId] (PATCH)
 *        - /api/auctions/[id]/bids (uses auction-service)
 *        - /api/admin/auctions/[id]/end (POST end auction)
 *        - /api/admin/store/orders/[id] (uses commerce-service)
 *   5. Schema: RentalListing + RentalBooking models in store-schema
 *   6. Audit keys:
 *        store.rental.create / store.rental.booking.request /
 *        store.rental.booking.approve / store.rental.start /
 *        store.rental.complete / store.rental.booking.cancel /
 *        marketplace.auction.create / marketplace.auction.bid /
 *        marketplace.auction.end /
 *        store.order.create / store.payment.process / store.payment.refund
 *
 * Tests are file-content based (no DB calls) so they pass in
 * every environment — including CI without DATABASE_URL set.
 * This matches the established pattern from
 * tests/phase-p7-wanted-rfq.test.ts + tests/phase-store-2c-contracts.test.ts.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";

const RENTAL_SVC = "src/lib/rental-service.ts";
const AUCTION_SVC = "src/lib/auction-service.ts";
const COMMERCE_SVC = "src/lib/commerce-service.ts";

const RENTALS_LIST_ROUTE = "src/app/api/admin/store/rentals/route.ts";
const RENTALS_DETAIL_ROUTE = "src/app/api/admin/store/rentals/[id]/route.ts";
const RENTALS_BOOKINGS_ROUTE = "src/app/api/admin/store/rentals/[id]/bookings/route.ts";
const RENTALS_BOOKING_DETAIL_ROUTE =
  "src/app/api/admin/store/rentals/[id]/bookings/[bookingId]/route.ts";

const AUCTION_BIDS_ROUTE = "src/app/api/auctions/[id]/bids/route.ts";
const AUCTION_END_ROUTE = "src/app/api/admin/auctions/[id]/end/route.ts";
const ORDERS_DETAIL_ROUTE = "src/app/api/admin/store/orders/[id]/route.ts";

const STORE_SCHEMA = "prisma/store-schema.prisma";

function read(path: string): string {
  return fs.readFileSync(path, "utf8");
}

describe("Phase P8 — Rental + Auction + Commerce (Transaction deep)", () => {
  // ── 1. rental-service.ts exists + exports ─────────────────
  describe("1. rental-service.ts", () => {
    it("should exist as src/lib/rental-service.ts", () => {
      expect(fs.existsSync(RENTAL_SVC)).toBe(true);
    });

    it("should export createRentalListing(params)", () => {
      const c = read(RENTAL_SVC);
      expect(c).toContain("export async function createRentalListing");
      // The params object must accept the documented fields.
      expect(c).toContain("partId");
      expect(c).toContain("listingId");
      expect(c).toContain("dailyRate");
      expect(c).toContain("weeklyRate");
      expect(c).toContain("monthlyRate");
      expect(c).toContain("deposit");
      expect(c).toContain("minDuration");
      expect(c).toContain("maxDuration");
      expect(c).toContain("userId");
    });

    it("should export requestBooking(params)", () => {
      const c = read(RENTAL_SVC);
      expect(c).toContain("export async function requestBooking");
      expect(c).toContain("rentalListingId");
      expect(c).toContain("customerId");
      expect(c).toContain("startDate");
      expect(c).toContain("endDate");
    });

    it("should export approveBooking(bookingId, userId)", () => {
      const c = read(RENTAL_SVC);
      expect(c).toContain("export async function approveBooking");
      expect(c).toMatch(
        /approveBooking\(\s*bookingId:\s*string\s*,\s*userId\?\s*:\s*string \| null\s*,?\s*\)/,
      );
    });

    it("should export startRental(bookingId, userId)", () => {
      const c = read(RENTAL_SVC);
      expect(c).toContain("export async function startRental");
      expect(c).toMatch(
        /startRental\(\s*bookingId:\s*string\s*,\s*userId\?\s*:\s*string \| null\s*,?\s*\)/,
      );
    });

    it("should export completeRental(bookingId, userId)", () => {
      const c = read(RENTAL_SVC);
      expect(c).toContain("export async function completeRental");
      expect(c).toMatch(
        /completeRental\(\s*bookingId:\s*string\s*,\s*userId\?\s*:\s*string \| null\s*,?\s*\)/,
      );
    });

    it("should export cancelBooking(bookingId, reason, userId)", () => {
      const c = read(RENTAL_SVC);
      expect(c).toContain("export async function cancelBooking");
      expect(c).toMatch(
        /cancelBooking\(\s*bookingId:\s*string\s*,\s*reason\?\s*:\s*string \| null\s*,\s*userId\?\s*:\s*string \| null\s*,?\s*\)/,
      );
    });

    it("should export checkAvailability(rentalListingId, startDate, endDate)", () => {
      const c = read(RENTAL_SVC);
      expect(c).toContain("export async function checkAvailability");
      expect(c).toMatch(
        /checkAvailability\(\s*rentalListingId:\s*string\s*,\s*startDate:\s*Date\s*,\s*endDate:\s*Date\s*,?\s*\)/,
      );
    });

    it("should audit all rental state transitions with the documented keys", () => {
      const c = read(RENTAL_SVC);
      expect(c).toContain("store.rental.create");
      expect(c).toContain("store.rental.booking.request");
      expect(c).toContain("store.rental.booking.approve");
      expect(c).toContain("store.rental.start");
      expect(c).toContain("store.rental.complete");
      expect(c).toContain("store.rental.booking.cancel");
    });

    it("should use storeDb for all DB mutations", () => {
      const c = read(RENTAL_SVC);
      expect(c).toContain("import { storeDb } from \"@/lib/store-db\"");
      expect(c).toContain("storeDb.rentalListing");
      expect(c).toContain("storeDb.rentalBooking");
    });
  });

  // ── 2. auction-service.ts exists + exports ───────────────
  describe("2. auction-service.ts", () => {
    it("should exist as src/lib/auction-service.ts", () => {
      expect(fs.existsSync(AUCTION_SVC)).toBe(true);
    });

    it("should export createAuction(params)", () => {
      const c = read(AUCTION_SVC);
      expect(c).toContain("export async function createAuction");
      expect(c).toContain("listingId");
      expect(c).toContain("startTime");
      expect(c).toContain("endTime");
      expect(c).toContain("startPrice");
      expect(c).toContain("reservePrice");
      expect(c).toContain("userId");
    });

    it("should export placeBid(auctionId, bidderId, amount)", () => {
      const c = read(AUCTION_SVC);
      expect(c).toContain("export async function placeBid");
      expect(c).toMatch(
        /placeBid\(\s*auctionId:\s*string\s*,\s*bidderId:\s*string\s*,\s*amount:\s*bigint \| number \| string\s*,?\s*\)/,
      );
    });

    it("should export endAuction(auctionId, userId)", () => {
      const c = read(AUCTION_SVC);
      expect(c).toContain("export async function endAuction");
      expect(c).toMatch(
        /endAuction\(\s*auctionId:\s*string\s*,\s*userId\?\s*:\s*string \| null\s*,?\s*\)/,
      );
    });

    it("should export getAuctionDetail(auctionId)", () => {
      const c = read(AUCTION_SVC);
      expect(c).toContain("export async function getAuctionDetail");
      expect(c).toMatch(/getAuctionDetail\(\s*auctionId:\s*string/);
    });

    it("should audit all auction state transitions with the documented keys", () => {
      const c = read(AUCTION_SVC);
      expect(c).toContain("marketplace.auction.create");
      expect(c).toContain("marketplace.auction.bid");
      expect(c).toContain("marketplace.auction.end");
    });

    it("should use db (main HEAVIX client) for auction mutations", () => {
      const c = read(AUCTION_SVC);
      expect(c).toContain("import { db } from \"@/lib/db\"");
      expect(c).toContain("db.auction");
      expect(c).toContain("db.auctionBid");
    });
  });

  // ── 3. commerce-service.ts exists + exports ───────────────
  describe("3. commerce-service.ts", () => {
    it("should exist as src/lib/commerce-service.ts", () => {
      expect(fs.existsSync(COMMERCE_SVC)).toBe(true);
    });

    it("should export createOrder(params)", () => {
      const c = read(COMMERCE_SVC);
      expect(c).toContain("export async function createOrder");
      expect(c).toContain("items");
      expect(c).toContain("customerId");
      expect(c).toContain("paymentMethod");
      expect(c).toContain("userId");
    });

    it("should export processPayment(params)", () => {
      const c = read(COMMERCE_SVC);
      expect(c).toContain("export async function processPayment");
      expect(c).toContain("orderId");
      expect(c).toContain("amount");
      expect(c).toContain("method");
    });

    it("should export refundPayment(paymentId, amount, reason, userId)", () => {
      const c = read(COMMERCE_SVC);
      expect(c).toContain("export async function refundPayment");
      expect(c).toMatch(
        /refundPayment\(\s*paymentId:\s*string\s*,\s*amount:\s*number\s*,\s*reason\?\s*:\s*string \| null\s*,\s*userId\?\s*:\s*string \| null\s*,?\s*\)/,
      );
    });

    it("should export getOrderDetail(orderId)", () => {
      const c = read(COMMERCE_SVC);
      expect(c).toContain("export async function getOrderDetail");
      expect(c).toMatch(/getOrderDetail\(\s*orderId:\s*string\s*,?\s*\)/);
    });

    it("should audit all commerce mutations with the documented keys", () => {
      const c = read(COMMERCE_SVC);
      expect(c).toContain("store.order.create");
      expect(c).toContain("store.payment.process");
      expect(c).toContain("store.payment.refund");
    });

    it("should use storeDb for all DB mutations", () => {
      const c = read(COMMERCE_SVC);
      expect(c).toContain("import { storeDb } from \"@/lib/store-db\"");
      expect(c).toContain("storeDb.order");
      expect(c).toContain("storeDb.payment");
    });
  });

  // ── 4. Routes exist + use the services ──────────────────
  describe("4. Routes", () => {
    it("rentals list+create route should exist + import rental-service + requirePermission", () => {
      expect(fs.existsSync(RENTALS_LIST_ROUTE)).toBe(true);
      const c = read(RENTALS_LIST_ROUTE);
      expect(c).toContain("createRentalListing");
      expect(c).toContain("requirePermission(user.id, 'store.read')");
      expect(c).toContain("requirePermission(user.id, 'store.manage')");
    });

    it("rentals detail route should exist + handle GET/PATCH/DELETE", () => {
      expect(fs.existsSync(RENTALS_DETAIL_ROUTE)).toBe(true);
      const c = read(RENTALS_DETAIL_ROUTE);
      expect(c).toContain("export async function GET");
      expect(c).toContain("export async function PATCH");
      expect(c).toContain("export async function DELETE");
      expect(c).toContain("store.rental.update");
      expect(c).toContain("store.rental.delete");
    });

    it("rentals bookings route should exist + import requestBooking", () => {
      expect(fs.existsSync(RENTALS_BOOKINGS_ROUTE)).toBe(true);
      const c = read(RENTALS_BOOKINGS_ROUTE);
      expect(c).toContain("requestBooking");
      expect(c).toContain("export async function GET");
      expect(c).toContain("export async function POST");
    });

    it("rentals booking detail route should exist + import all transition functions", () => {
      expect(fs.existsSync(RENTALS_BOOKING_DETAIL_ROUTE)).toBe(true);
      const c = read(RENTALS_BOOKING_DETAIL_ROUTE);
      expect(c).toContain("approveBooking");
      expect(c).toContain("startRental");
      expect(c).toContain("completeRental");
      expect(c).toContain("cancelBooking");
    });

    it("auction bids route should import placeBid from auction-service", () => {
      expect(fs.existsSync(AUCTION_BIDS_ROUTE)).toBe(true);
      const c = read(AUCTION_BIDS_ROUTE);
      expect(c).toContain("placeBid");
      expect(c).toContain("@/lib/auction-service");
    });

    it("admin auction end route should exist + import endAuction", () => {
      expect(fs.existsSync(AUCTION_END_ROUTE)).toBe(true);
      const c = read(AUCTION_END_ROUTE);
      expect(c).toContain("endAuction");
      expect(c).toContain("export async function POST");
    });

    it("admin orders detail route should import getOrderDetail from commerce-service", () => {
      expect(fs.existsSync(ORDERS_DETAIL_ROUTE)).toBe(true);
      const c = read(ORDERS_DETAIL_ROUTE);
      expect(c).toContain("getOrderDetail");
      expect(c).toContain("@/lib/commerce-service");
    });
  });

  // ── 5. Schema — Rental models added to store-schema ──────
  describe("5. Schema (store-schema.prisma)", () => {
    it("should define RentalListing model with the documented fields", () => {
      const c = read(STORE_SCHEMA);
      expect(c).toMatch(/model RentalListing \{/);
      expect(c).toContain("partId       String?");
      expect(c).toContain("listingId    String?");
      expect(c).toContain("dailyRate    Float");
      expect(c).toContain("weeklyRate   Float?");
      expect(c).toContain("monthlyRate  Float?");
      expect(c).toContain("deposit      Float?");
      expect(c).toContain("available    Boolean  @default(true)");
      expect(c).toContain("minDuration  Int      @default(1)");
      expect(c).toContain("maxDuration  Int?");
      expect(c).toContain("bookings     RentalBooking[]");
    });

    it("should define RentalBooking model with the documented fields", () => {
      const c = read(STORE_SCHEMA);
      expect(c).toMatch(/model RentalBooking \{/);
      expect(c).toContain("rentalListingId  String");
      expect(c).toContain("rentalListing    RentalListing @relation");
      expect(c).toContain("customerId       String");
      expect(c).toContain("startDate        DateTime");
      expect(c).toContain("endDate          DateTime");
      expect(c).toContain("status           String   @default(\"REQUESTED\")");
      expect(c).toContain("dailyRate        Float");
      expect(c).toContain("totalAmount      Float");
      expect(c).toContain("depositPaid      Boolean  @default(false)");
      expect(c).toContain("notes            String?");
    });
  });
});
