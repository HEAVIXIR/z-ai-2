import { describe, expect, it } from "vitest";
import { isBrandSelectable } from "@/lib/brand-labels";

describe("isBrandSelectable", () => {
  it.each(["ACTIVE", "LEGACY", "HISTORICAL", "ACQUIRED", "MERGED", "DISCONTINUED", "REGIONAL", "UNKNOWN"])(
    "keeps active %s brand identities selectable",
    (status) => {
      expect(isBrandSelectable({ active: true, status })).toBe(true);
    },
  );

  it.each(["PENDING_REVIEW", "INACTIVE", "ARCHIVED"])(
    "does not expose %s records to listing creation",
    (status) => {
      expect(isBrandSelectable({ active: true, status })).toBe(false);
    },
  );

  it("never allows an inactive record, even when its descriptive status says ACTIVE", () => {
    expect(isBrandSelectable({ active: false, status: "ACTIVE" })).toBe(false);
  });
});
