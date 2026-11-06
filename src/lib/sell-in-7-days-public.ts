import { randomBytes } from "node:crypto";

const TRACKING_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const TRACKING_CODE_BYTES = 16;

/**
 * Create a 16-character, 80-bit tracking capability using a CSPRNG.
 * The alphabet has exactly 32 symbols, so each masked byte contributes
 * five unbiased bits. The code is a locator, not an authentication factor.
 */
export function createSellIn7DaysTrackingCode(): string {
  return Array.from(
    randomBytes(TRACKING_CODE_BYTES),
    (byte) => TRACKING_CODE_ALPHABET[byte & 31],
  ).join("");
}

export type PublicSellIn7DaysTrackingSource = {
  trackingCode: string;
  deviceName: string;
  modelName: string | null;
  year: number | null;
  workingHours: number | null;
  condition: string | null;
  province: string | null;
  city: string | null;
  prepaymentPaid: boolean;
  status: string;
  currentStep: number;
  inspectionDate: Date | null;
  soldAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  category: { name: string; slug: string } | null;
  brand: { name: string; slug: string } | null;
};

/**
 * Explicit allowlist for unauthenticated tracking responses.
 * Never return seller contact details, private descriptions, asking price,
 * valuation, sale price, commission, internal database IDs, or payment amount.
 */
export function toPublicSellIn7DaysTracking(
  app: PublicSellIn7DaysTrackingSource,
) {
  return {
    trackingCode: app.trackingCode,
    deviceName: app.deviceName,
    modelName: app.modelName,
    year: app.year,
    workingHours: app.workingHours,
    condition: app.condition,
    province: app.province,
    city: app.city,
    prepaymentPaid: app.prepaymentPaid,
    status: app.status,
    currentStep: app.currentStep,
    inspectionDate: app.inspectionDate?.toISOString() ?? null,
    soldAt: app.soldAt?.toISOString() ?? null,
    createdAt: app.createdAt.toISOString(),
    updatedAt: app.updatedAt.toISOString(),
    category: app.category,
    brand: app.brand,
  };
}
