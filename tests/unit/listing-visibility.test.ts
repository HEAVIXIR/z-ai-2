import { describe, expect, it } from "vitest";
import {
  getPublicListingWhere,
  isPublicListingActive,
} from "@/lib/listing-visibility";

describe("public listing visibility", () => {
  const now = new Date("2026-11-07T12:00:00.000Z");

  it("requires PUBLISHED status and a non-expired expiry timestamp", () => {
    expect(getPublicListingWhere(now)).toEqual({
      status: "PUBLISHED",
      AND: [
        {
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: now } },
          ],
        },
      ],
    });
  });

  it("allows published listings with no expiry or a future expiry", () => {
    expect(isPublicListingActive({ status: "PUBLISHED", expiresAt: null }, now)).toBe(true);
    expect(
      isPublicListingActive({
        status: "PUBLISHED",
        expiresAt: new Date("2026-11-07T12:00:00.001Z"),
      }, now),
    ).toBe(true);
  });

  it.each(["DRAFT", "PENDING", "PAUSED", "SOLD", "EXPIRED", "SUSPENDED"])(
    "rejects non-public status %s",
    (status) => {
      expect(isPublicListingActive({ status, expiresAt: null }, now)).toBe(false);
    },
  );

  it("rejects listings whose expiry is equal to or earlier than now", () => {
    expect(
      isPublicListingActive({
        status: "PUBLISHED",
        expiresAt: new Date("2026-11-07T12:00:00.000Z"),
      }, now),
    ).toBe(false);
    expect(
      isPublicListingActive({
        status: "PUBLISHED",
        expiresAt: new Date("2026-11-07T11:59:59.999Z"),
      }, now),
    ).toBe(false);
  });

  it("rejects missing listing records", () => {
    expect(isPublicListingActive(null, now)).toBe(false);
    expect(isPublicListingActive(undefined, now)).toBe(false);
  });
});
