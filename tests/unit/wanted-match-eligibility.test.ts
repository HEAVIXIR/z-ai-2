import { describe, expect, it } from "vitest";
import { isBuyRequestMatchEligible } from "@/lib/wanted-eligibility";

const now = new Date("2026-11-19T12:00:00.000Z");

describe("BuyRequest matching eligibility", () => {
  it("allows an active, published, unexpired request", () => {
    expect(isBuyRequestMatchEligible({
      status: "ACTIVE",
      publishedAt: new Date("2026-11-18T12:00:00.000Z"),
      expiresAt: new Date("2026-11-20T12:00:00.000Z"),
    }, now)).toBe(true);
  });

  it.each(["PENDING", "CLOSED", "FULFILLED", "CANCELLED", "REJECTED"])(
    "rejects %s requests",
    (status) => {
      expect(isBuyRequestMatchEligible({
        status,
        publishedAt: new Date("2026-11-18T12:00:00.000Z"),
        expiresAt: null,
      }, now)).toBe(false);
    },
  );

  it("rejects unpublished requests", () => {
    expect(isBuyRequestMatchEligible({ status: "ACTIVE", publishedAt: null, expiresAt: null }, now)).toBe(false);
  });

  it("rejects future publication timestamps", () => {
    expect(isBuyRequestMatchEligible({
      status: "ACTIVE",
      publishedAt: new Date("2026-11-20T12:00:00.000Z"),
      expiresAt: null,
    }, now)).toBe(false);
  });

  it("rejects expired requests", () => {
    expect(isBuyRequestMatchEligible({
      status: "ACTIVE",
      publishedAt: new Date("2026-11-18T12:00:00.000Z"),
      expiresAt: new Date("2026-11-19T11:59:59.000Z"),
    }, now)).toBe(false);
  });

  it("allows active requests without an expiry", () => {
    expect(isBuyRequestMatchEligible({
      status: "ACTIVE",
      publishedAt: new Date("2026-11-18T12:00:00.000Z"),
      expiresAt: null,
    }, now)).toBe(true);
  });
});
