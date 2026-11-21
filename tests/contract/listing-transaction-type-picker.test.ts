import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(
  join(process.cwd(), "src/components/listings/TransactionTypePicker.tsx"),
  "utf8",
);

describe("Listing transaction type picker contract", () => {
  it("loads the active transaction types from the canonical public API", () => {
    expect(source).toContain('fetch("/api/transaction-types", { cache: "no-store" })');
    expect(source).toContain("setTypes(data.types ?? [])");
  });

  it("requires the seller to explicitly select the transaction type", () => {
    expect(source).not.toMatch(/if\s*\(!value\s*&&[\s\S]*?onChange\(sale\.key\)/);
    expect(source).toContain('onClick={() => onChange(t.key)}');
  });

  it("offers retry controls when the API fails or returns no active types", () => {
    expect(source).toContain("setRetryKey((current) => current + 1)");
    expect(source).toContain("}, [retryKey]);");
  });
});
