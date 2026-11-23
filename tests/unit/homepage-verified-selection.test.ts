import { describe, expect, it } from "vitest";
import { selectVerifiedListings } from "@/lib/homepage/verified-selection";

type Row = { id: string; verified: boolean };

const strictRows: Row[] = [
  { id: "v1", verified: true },
  { id: "v2", verified: true },
  { id: "v3", verified: true },
  { id: "v4", verified: true },
  { id: "v5", verified: true },
  { id: "v6", verified: true },
  { id: "v7", verified: true },
  { id: "v8", verified: true },
];

const inclusiveRows: Row[] = [
  { id: "i1", verified: false },
  { id: "i2", verified: true },
  { id: "i3", verified: false },
  { id: "i4", verified: false },
  { id: "i5", verified: true },
  { id: "i6", verified: false },
  { id: "i7", verified: false },
  { id: "i8", verified: false },
];

describe("selectVerifiedListings — deterministic verified-section selection", () => {
  it("returns the strict (verified-only) rows when verifiedOnlyFlag is true", () => {
    const result = selectVerifiedListings(strictRows, inclusiveRows, true);
    expect(result).toBe(strictRows);
    expect(result).toHaveLength(8);
    expect(result.every((r) => r.verified)).toBe(true);
  });

  it("returns the inclusive rows when verifiedOnlyFlag is false", () => {
    const result = selectVerifiedListings(strictRows, inclusiveRows, false);
    expect(result).toBe(inclusiveRows);
    expect(result).toHaveLength(8);
    // Inclusive set contains both verified and unverified listings
    expect(result.some((r) => !r.verified)).toBe(true);
  });

  it("defaults to strict (verified-only) when verifiedOnlyFlag is null", () => {
    const result = selectVerifiedListings(strictRows, inclusiveRows, null);
    expect(result).toBe(strictRows);
    expect(result.every((r) => r.verified)).toBe(true);
  });

  it("defaults to strict (verified-only) when verifiedOnlyFlag is undefined", () => {
    const result = selectVerifiedListings(strictRows, inclusiveRows, undefined);
    expect(result).toBe(strictRows);
    expect(result.every((r) => r.verified)).toBe(true);
  });

  it("returns fewer than 8 when the DB genuinely has fewer qualifying strict rows", () => {
    const fewStrict: Row[] = [
      { id: "v1", verified: true },
      { id: "v2", verified: true },
    ];
    const result = selectVerifiedListings(fewStrict, inclusiveRows, true);
    expect(result).toBe(fewStrict);
    expect(result).toHaveLength(2);
  });

  it("returns fewer than 8 when the DB genuinely has fewer qualifying inclusive rows", () => {
    const fewInclusive: Row[] = [
      { id: "i1", verified: false },
      { id: "i2", verified: true },
      { id: "i3", verified: false },
    ];
    const result = selectVerifiedListings(strictRows, fewInclusive, false);
    expect(result).toBe(fewInclusive);
    expect(result).toHaveLength(3);
  });

  it("returns an empty array (not inclusive fallback) when strict is empty and flag is true", () => {
    const result = selectVerifiedListings([], inclusiveRows, true);
    expect(result).toEqual([]);
    // Critical: must NOT fall back to inclusive when verified-only is on
    expect(result).not.toBe(inclusiveRows);
  });

  it("preserves row identity (no copy/clone) so downstream mapping sees the original payload", () => {
    const result = selectVerifiedListings(strictRows, inclusiveRows, true);
    expect(result[0]).toBe(strictRows[0]);
  });

  it("works with arbitrary row shapes (generic)", () => {
    type BigRow = { id: string; verified: boolean; brand: { name: string }; images: string[] };
    const bigStrict: BigRow[] = [
      { id: "b1", verified: true, brand: { name: "X" }, images: ["a"] },
    ];
    const bigInclusive: BigRow[] = [
      { id: "b2", verified: false, brand: { name: "Y" }, images: ["b"] },
    ];
    const result = selectVerifiedListings(bigStrict, bigInclusive, true);
    expect(result).toBe(bigStrict);
    expect(result[0].brand.name).toBe("X");
  });
});
