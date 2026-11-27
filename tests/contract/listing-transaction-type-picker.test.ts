import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");
const picker = read("src/components/listings/TransactionTypePicker.tsx");
const wizard = read("src/app/listings/new/page.tsx");

describe("Listing transaction type picker contract", () => {
  it("loads Step 1 transaction types in the page and normalizes them in the picker", () => {
    expect(wizard).toContain('fetch("/api/transaction-types", { cache: "no-store" })');
    expect(wizard).toContain("setTransactionTypes(data.types ?? [])");
    expect(wizard).toContain("types={transactionTypes}");
    expect(picker).not.toContain("/api/transaction-types");
    expect(picker).toContain("const normalized: TransactionTypeOption[] = types.map(");
    expect(picker).toContain("CANONICAL_LABELS[item.key] ?? item.nameFa");
    expect(picker).toContain("CANONICAL_ICONS[item.key] ?? item.icon");
    expect(picker).toContain("normalized.sort((a, b) => a.sortOrder - b.sortOrder)");
  });

  it("keeps WANTED available without silently selecting a transaction type", () => {
    expect(picker).toContain('item.key === "WANTED"');
    expect(picker).toContain('key: "WANTED"');
    expect(picker).not.toMatch(/if\s*\(!value\s*&&[\s\S]*?onChange\(sale\.key\)/);
    expect(picker).toContain('onClick={() => onChange(t.key)}');
  });

  it("offers retry controls while keeping retry state in the page", () => {
    expect(picker).toContain("onClick={onRetry}");
    expect(wizard).toContain("setTransactionTypesRetryKey((current) => current + 1)");
    expect(wizard).toContain("[transactionTypesRetryKey]");
    expect(wizard).toContain("error={transactionTypesError}");
  });
});
