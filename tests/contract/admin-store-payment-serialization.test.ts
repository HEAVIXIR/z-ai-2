import { describe, expect, it } from "vitest";
import fs from "node:fs";

const collection = fs.readFileSync("src/app/api/admin/store/payments/route.ts", "utf8");
const detail = fs.readFileSync("src/app/api/admin/store/payments/[id]/route.ts", "utf8");

describe("admin store payment response privacy", () => {
  it.each([
    ["collection", collection],
    ["detail", detail],
  ])("%s serializer uses an explicit field allowlist", (_name, source) => {
    const start = source.indexOf("function serialize(p: any)");
    const end = source.indexOf("\n}\n", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const serializer = source.slice(start, end);
    expect(serializer).not.toMatch(/\.\.\.p\s*,?/);
    expect(serializer).toContain("payerCard: maskPayerCard(p.payerCard)");
    expect(serializer).not.toContain("reviewedById:");
    expect(serializer).not.toContain("payerCard: p.payerCard");
    expect(serializer).toContain("statusLabel:");
    expect(serializer).toContain("methodLabel:");
  });

  it.each([
    ["collection", collection],
    ["detail", detail],
  ])("%s masks payer card to the final four digits", (_name, source) => {
    expect(source).toContain(String.raw`const digits = value.replace(/\D/g, "")`);
    expect(source).toContain('return `•••• ${digits.slice(-4)}`');
  });
});
