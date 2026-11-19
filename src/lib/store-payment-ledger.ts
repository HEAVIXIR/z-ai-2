export type StoreOrderPaymentStatus = "UNPAID" | "PARTIAL" | "PAID" | "REFUNDED";

/**
 * Derive the order payment state from the remaining APPROVED ledger amount.
 * In this Store model, a full refund reclassifies the original Payment row
 * from APPROVED to REFUNDED; the refunded row is therefore already absent
 * from approvedTotal and must not be subtracted a second time.
 */
export function computeStoreOrderPaymentStatus(
  orderTotalIrr: number,
  approvedPaymentsIrr: number,
  hasRefund: boolean,
): StoreOrderPaymentStatus {
  if (
    !Number.isFinite(orderTotalIrr) ||
    orderTotalIrr < 0 ||
    !Number.isFinite(approvedPaymentsIrr)
  ) {
    throw new TypeError("Invalid Store payment ledger totals");
  }

  if (hasRefund && approvedPaymentsIrr <= 0) return "REFUNDED";
  if (approvedPaymentsIrr <= 0) return "UNPAID";
  if (approvedPaymentsIrr >= orderTotalIrr) return hasRefund ? "REFUNDED" : "PAID";
  return "PARTIAL";
}
