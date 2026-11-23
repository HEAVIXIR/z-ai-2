/**
 * HEAVIX — Canonical Brand Label Maps (V2)
 * ----------------------------------------------------------------
 * Simplified from 30→5 type labels and 14→4 status labels.
 *
 * Design principles:
 * 1. Brand.type describes the COMPANY ROLE (manufacturer, distributor, etc.)
 *    — NOT the product domain (that's BrandDomain).
 * 2. Brand.status describes LIFECYCLE STATE (active, inactive, draft, archived)
 *    — NOT the verification state (that's Brand.verification).
 * 3. Brand.verification describes TRUST LEVEL (unverified, verified, etc.)
 *    — independent from both type and status.
 * 4. BrandFamily is a SEPARATE model — not a Brand.type value.
 *
 * Backward compatibility: legacy type/status values are mapped to
 * their canonical equivalent via BRAND_TYPE_FALLBACK and
 * BRAND_STATUS_FALLBACK. Existing DB rows with old values still
 * render correctly; they just display under the canonical label.
 */

/**
 * Statuses that must never be selectable in marketplace listings.
 * A brand must be ACTIVE (or a legacy descriptive status that implies
 * the brand is still tradeable) to appear in listing forms and search.
 *
 * Legacy statuses NOT in this list (LEGACY, HISTORICAL, ACQUIRED, MERGED,
 * DISCONTINUED, REGIONAL, UNKNOWN) remain selectable when `active=true`
 * because they describe the brand's history, not its marketplace availability.
 */
export const BRAND_UNAVAILABLE_STATUSES = ["PENDING_REVIEW", "PENDING", "DRAFT", "INACTIVE", "ARCHIVED"] as const;

export function isBrandSelectable(
  brand: { active?: boolean | null; status?: string | null } | null | undefined,
): boolean {
  return !!brand &&
    brand.active === true &&
    !BRAND_UNAVAILABLE_STATUSES.includes(
      (brand.status ?? "ACTIVE") as (typeof BRAND_UNAVAILABLE_STATUSES)[number],
    );
}

/* ────────────────────────────────────────────────────────────
 * CANONICAL BRAND TYPES (5)
 * ----------------------------------------------------------------
 * The admin brand form shows exactly these 5 options.
 * Legacy 30+ types are mapped via BRAND_TYPE_FALLBACK.
 * ──────────────────────────────────────────────────────────── */

/** Canonical brand type keys — the only values the admin form offers. */
export const CANONICAL_BRAND_TYPES = [
  "MANUFACTURER",
  "DISTRIBUTOR",
  "DEALER",
  "SERVICE_PROVIDER",
  "OTHER",
] as const;

/** Brand type key → Persian label. Includes legacy mappings for display. */
export const BRAND_TYPE_LABELS: Record<string, string> = {
  // ── Canonical 5 types (shown in admin form) ──
  MANUFACTURER: "سازنده",
  DISTRIBUTOR: "توزیع‌کننده",
  DEALER: "نمایندگی",
  SERVICE_PROVIDER: "ارائه‌دهنده خدمات",
  OTHER: "سایر",

  // ── Legacy type mappings (display-only; not offered in admin form) ──
  // Old domain-based types → mapped to closest canonical type
  MACHINE_BRAND: "سازنده",        // → MANUFACTURER
  VEHICLE_BRAND: "سازنده",        // → MANUFACTURER
  PARTS_BRAND: "توزیع‌کننده",     // → DISTRIBUTOR
  ENGINE_BRAND: "سازنده",         // → MANUFACTURER
  EQUIPMENT_BRAND: "سازنده",      // → MANUFACTURER
  INDUSTRIAL_BRAND: "سازنده",     // → MANUFACTURER
  TECHNOLOGY_BRAND: "سازنده",     // → MANUFACTURER
  SERVICE_BRAND: "ارائه‌دهنده خدمات", // → SERVICE_PROVIDER
  TIRE_BRAND: "توزیع‌کننده",      // → DISTRIBUTOR
  LUBRICANT_BRAND: "توزیع‌کننده", // → DISTRIBUTOR
  CORPORATE_BRAND: "سازنده",      // → MANUFACTURER (parent company)

  // Old role-based types → mapped to closest canonical type
  OEM: "سازنده",                  // → MANUFACTURER
  AFTERMARKET: "توزیع‌کننده",     // → DISTRIBUTOR
  RESELLER: "نمایندگی",           // → DEALER
  IMPORTER: "توزیع‌کننده",        // → DISTRIBUTOR
  EXPORTER: "توزیع‌کننده",        // → DISTRIBUTOR
  WHOLESALER: "توزیع‌کننده",      // → DISTRIBUTOR
  RETAILER: "نمایندگی",           // → DEALER
  RENTAL_COMPANY: "ارائه‌دهنده خدمات", // → SERVICE_PROVIDER
  TRADING_COMPANY: "توزیع‌کننده", // → DISTRIBUTOR
  SUBSIDIARY: "سازنده",           // → MANUFACTURER (subsidiary of a manufacturer)
  JOINT_VENTURE: "سازنده",        // → MANUFACTURER
  PRIVATE_LABEL: "توزیع‌کننده",   // → DISTRIBUTOR

  // Legacy/historical types → mapped to OTHER
  LEGACY_BRAND: "سایر",           // → OTHER

  // NOTE: BRAND_FAMILY was removed from type labels.
  // BrandFamily is a separate model, not a Brand.type value.
};

/**
 * Map any legacy type to its canonical equivalent.
 * Used when writing new data or normalizing existing rows.
 */
export const BRAND_TYPE_FALLBACK: Record<string, string> = {
  MACHINE_BRAND: "MANUFACTURER",
  VEHICLE_BRAND: "MANUFACTURER",
  PARTS_BRAND: "DISTRIBUTOR",
  ENGINE_BRAND: "MANUFACTURER",
  EQUIPMENT_BRAND: "MANUFACTURER",
  INDUSTRIAL_BRAND: "MANUFACTURER",
  TECHNOLOGY_BRAND: "MANUFACTURER",
  SERVICE_BRAND: "SERVICE_PROVIDER",
  TIRE_BRAND: "DISTRIBUTOR",
  LUBRICANT_BRAND: "DISTRIBUTOR",
  CORPORATE_BRAND: "MANUFACTURER",
  OEM: "MANUFACTURER",
  AFTERMARKET: "DISTRIBUTOR",
  RESELLER: "DEALER",
  IMPORTER: "DISTRIBUTOR",
  EXPORTER: "DISTRIBUTOR",
  WHOLESALER: "DISTRIBUTOR",
  RETAILER: "DEALER",
  RENTAL_COMPANY: "SERVICE_PROVIDER",
  TRADING_COMPANY: "DISTRIBUTOR",
  SUBSIDIARY: "MANUFACTURER",
  JOINT_VENTURE: "MANUFACTURER",
  PRIVATE_LABEL: "DISTRIBUTOR",
  LEGACY_BRAND: "OTHER",
};

/** Normalize a type value to its canonical form. */
export function canonicalBrandType(type: string | null | undefined): string {
  const t = (type ?? "").trim().toUpperCase();
  if (!t) return "OTHER";
  if (CANONICAL_BRAND_TYPES.includes(t as typeof CANONICAL_BRAND_TYPES[number])) {
    return t;
  }
  return BRAND_TYPE_FALLBACK[t] ?? "OTHER";
}

/* ────────────────────────────────────────────────────────────
 * CANONICAL BRAND STATUSES (4)
 * ----------------------------------------------------------------
 * The admin brand form shows exactly these 4 options.
 * Legacy statuses (LEGACY, HISTORICAL, ACQUIRED, MERGED, etc.)
 * are mapped to ARCHIVED for display + selection logic.
 * ──────────────────────────────────────────────────────────── */

/** Canonical brand status keys — the only values the admin form offers. */
export const CANONICAL_BRAND_STATUSES = [
  "ACTIVE",
  "INACTIVE",
  "DRAFT",
  "ARCHIVED",
] as const;

/** Brand status key → { Persian label, badge color token }. */
export const BRAND_STATUS_LABELS: Record<
  string,
  { label: string; color: string }
> = {
  // ── Canonical 4 statuses (shown in admin form) ──
  ACTIVE: { label: "فعال", color: "green" },
  INACTIVE: { label: "غیرفعال", color: "gray" },
  DRAFT: { label: "پیش‌نویس", color: "gray" },
  ARCHIVED: { label: "بایگانی", color: "gray" },

  // ── Legacy status mappings (display-only; keep original Persian labels
  //    for backward-compatible rendering of existing DB rows) ──
  LEGACY: { label: "میراثی", color: "amber" },
  HISTORICAL: { label: "تاریخی", color: "amber" },
  ACQUIRED: { label: "خریداری‌شده", color: "blue" },
  MERGED: { label: "ادغام‌شده", color: "blue" },
  DISCONTINUED: { label: "توقف تولید", color: "gray" },
  REGIONAL: { label: "منطقه‌ای", color: "blue" },
  UNKNOWN: { label: "نامشخص", color: "gray" },
  PENDING: { label: "در انتظار تأیید", color: "amber" },
  BANKRUPT: { label: "ورشکسته", color: "gray" },
  PENDING_REVIEW: { label: "در انتظار بررسی", color: "amber" },
};

/**
 * Map any legacy status to its canonical equivalent.
 * Used when writing new data or normalizing existing rows.
 */
export const BRAND_STATUS_FALLBACK: Record<string, string> = {
  LEGACY: "ARCHIVED",
  HISTORICAL: "ARCHIVED",
  ACQUIRED: "ARCHIVED",
  MERGED: "ARCHIVED",
  DISCONTINUED: "ARCHIVED",
  REGIONAL: "ARCHIVED",
  UNKNOWN: "ARCHIVED",
  PENDING: "DRAFT",
  BANKRUPT: "ARCHIVED",
  PENDING_REVIEW: "DRAFT",
};

/** Normalize a status value to its canonical form. */
export function canonicalBrandStatus(status: string | null | undefined): string {
  const s = (status ?? "ACTIVE").trim().toUpperCase();
  if (CANONICAL_BRAND_STATUSES.includes(s as typeof CANONICAL_BRAND_STATUSES[number])) {
    return s;
  }
  return BRAND_STATUS_FALLBACK[s] ?? "ARCHIVED";
}

/* ────────────────────────────────────────────────────────────
 * VERIFICATION LABELS (unchanged — already well-structured)
 * ──────────────────────────────────────────────────────────── */

/** Brand verification key → { Persian label, level token }. */
export const VERIFICATION_LABELS: Record<
  string,
  { label: string; level: string }
> = {
  UNVERIFIED: { label: "", level: "none" },
  DATABASE_VERIFIED: { label: "تأیید پایگاه داده", level: "sky" },
  OFFICIAL_SOURCE_VERIFIED: { label: "منبع رسمی", level: "sky" },
  MANUFACTURER_VERIFIED: { label: "تأیید سازنده", level: "emerald" },
  ADMIN_VERIFIED: { label: "تأیید مدیر", level: "emerald" },
  PENDING: { label: "در انتظار بررسی", level: "none" },
  VERIFIED: { label: "تأیید شده", level: "emerald" },
  DISPUTED: { label: "مورد اختلاف", level: "amber" },
  REJECTED: { label: "رد شده", level: "none" },
};

/** Map a verification level token → Tailwind badge classes (dark theme). */
export function verificationBadgeClass(level: string): string {
  switch (level) {
    case "emerald":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
    case "sky":
      return "border-sky-500/30 bg-sky-500/10 text-sky-300";
    default:
      return "border-white/10 bg-white/5 text-white/60";
  }
}

/** Map a status color token → Tailwind badge classes (dark theme). */
export function statusBadgeClass(color: string): string {
  switch (color) {
    case "green":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
    case "amber":
      return "border-amber-500/30 bg-amber-500/10 text-amber-300";
    case "blue":
      return "border-sky-500/30 bg-sky-500/10 text-sky-300";
    case "gray":
    default:
      return "border-white/10 bg-white/5 text-white/60";
  }
}
