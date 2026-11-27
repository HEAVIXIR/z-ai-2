import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");

describe("HEAVIX seven transaction types and service intent separation", () => {
  it("keeps the narrow Preview seed aligned with the canonical seven keys", () => {
    const seed = read("prisma/seed-transaction-types.ts");
    const block = seed.split("const TRANSACTION_TYPES = [")[1]?.split("] as const;")[0] ?? "";
    const keys = [...block.matchAll(/key: "([A-Z_]+)"/g)].map((match) => match[1]);
    expect(keys).toEqual(["SALE", "RENT", "WANTED", "QUOTE", "AUCTION", "SERVICE_REQUEST", "SERVICE_OFFER"]);
    expect(seed).toContain('nameFa: "ارائه خدمت"');
    expect(seed).toContain('icon: "handshake"');
    expect(seed).toContain("HEAVIX_PREVIEW_TRANSACTION_TYPE_SEED_APPROVED");
    expect(seed).toContain("HEAVIX_APP_PREVIEW_DATABASE_OID");
    expect(seed).toContain("HEAVIX_EXPECTED_SYSTEM_IDENTIFIER");
    expect(seed).toContain("rowsToCanonicalize");
  });

  it("keeps SERVICE_OFFER active in the broad taxonomy seed without changing other admin flags", () => {
    const seed = read("prisma/seed-taxonomy-v11.ts");
    expect(seed).toContain('key: "SERVICE_OFFER",   nameFa: "ارائه خدمت"');
    expect(seed).toContain('icon: "handshake"');
    expect(seed).toContain('nameFa: t.nameFa, nameEn: t.nameEn, icon: t.icon, sortOrder: t.sortOrder, active: true');
  });

  it("keeps service request as a dedicated top-level flow, not a WANTED sub-intent", () => {
    const wizard = read("src/app/listings/new/page.tsx");
    expect(wizard).toContain("const isServiceFlow = isServiceRequest || isServiceOffer;");
    expect(wizard).not.toContain("isWantedServiceRequest");
    expect(wizard).not.toContain('wanted.intent === "SERVICE_REQUEST"');
    expect(wizard).not.toContain('{ v: "SERVICE_REQUEST", l: "خدمات" }');
    expect(wizard).toContain('transactionType === "SERVICE_REQUEST"');
  });

  it("renders seven transaction choices with a readable responsive layout", () => {
    const picker = read("src/components/listings/TransactionTypePicker.tsx");
    expect(picker).toContain('SERVICE_OFFER: "ارائه خدمت"');
    expect(picker).toContain("xl:grid-cols-7");
    expect(picker).toContain("CANONICAL_ICONS");
    const wizard = read("src/app/listings/new/page.tsx");
    expect(wizard).toContain('fetch("/api/transaction-types", { cache: "no-store" })');
    expect(picker).not.toContain("/api/transaction-types");
  });
});
