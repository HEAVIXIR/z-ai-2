import { describe, expect, it } from "vitest";
import { parseManualPaymentAmount } from "@/lib/payments/manual-payment-validation";

describe("parseManualPaymentAmount", () => {
  it.each([
    ["1000", 1000n],
    ["1,000", 1000n],
    ["12,345,678", 12345678n],
    [1000, 1000n],
  ])("accepts valid IRR amount %s", (input, expected) => {
    expect(parseManualPaymentAmount(input)).toBe(expected);
  });

  it.each([
    "",
    "0",
    "0000",
    "-1000",
    "+1000",
    "1.5",
    "12abc",
    "1,00",
    "12,34,567",
    "1,000.00",
    "1000000000000000",
    Number.MAX_SAFE_INTEGER + 1,
    null,
    undefined,
    {},
  ])("rejects malformed or unsupported amount %s", (input) => {
    expect(parseManualPaymentAmount(input)).toBeNull();
  });
});
