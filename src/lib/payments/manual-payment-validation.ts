/**
 * Parse a manual IRR payment amount without lossy Number coercion.
 * Accepts plain integer digits or correctly grouped thousands separators.
 * Returns null for malformed, non-positive, unsafe, or out-of-range values.
 */
export function parseManualPaymentAmount(value: unknown): bigint | null {
  const raw =
    typeof value === "number" && Number.isSafeInteger(value)
      ? String(value)
      : typeof value === "string"
        ? value.trim()
        : "";

  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(raw)) return null;

  const normalized = raw.replace(/,/g, "");
  if (normalized.length > 15 || /^0+$/.test(normalized)) return null;

  return BigInt(normalized);
}
