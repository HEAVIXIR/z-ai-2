/* ============================================================
   HEAVIX — Rate Limit Presets (P0-6)
   ------------------------------------------------------------
   Centralised per-endpoint rate-limit policies.
   Tuned to protect auth/upload/AI endpoints from brute-force and
   resource-exhaustion abuse while leaving legitimate use unaffected.

   Every preset documents:
     • limit    — max requests per window per key
     • windowMs — window length in ms
     • scope    — what the key represents (IP or userId)

   Keys are constructed by callers as `${identity}:${endpoint}` so
   that a single identity cannot trivially bypass by hitting a
   different (but related) endpoint.
   ============================================================ */

export interface RateLimitPreset {
  /** Max requests allowed within `windowMs`. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
  /** What the per-bucket identity represents. */
  scope: "ip" | "user";
  /** Human-readable endpoint label, for logging/metrics. */
  label: string;
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

/* ── Authentication ─────────────────────────────────────────── */

/** POST /api/auth/login — 10 per 15 min per IP. */
export const LOGIN: RateLimitPreset = {
  limit: 10,
  windowMs: 15 * MINUTE,
  scope: "ip",
  label: "login",
};

/** POST /api/auth/register — 5 per hour per IP. */
export const REGISTER: RateLimitPreset = {
  limit: 5,
  windowMs: HOUR,
  scope: "ip",
  label: "register",
};

/** POST /api/auth/verify-email — 10 per hour per IP. */
export const VERIFY: RateLimitPreset = {
  limit: 10,
  windowMs: HOUR,
  scope: "ip",
  label: "verify-email",
};

/** POST /api/auth/resend-verification — 3 per hour per IP. */
export const RESEND: RateLimitPreset = {
  limit: 3,
  windowMs: HOUR,
  scope: "ip",
  label: "resend-verification",
};

/* ── Resource-consuming endpoints ───────────────────────────── */

/** POST /api/upload — 20 per hour per user (falls back to IP for anon). */
export const UPLOAD: RateLimitPreset = {
  limit: 20,
  windowMs: HOUR,
  scope: "user",
  label: "upload",
};

/** POST /api/ai-gateway — 30 per hour per user (falls back to IP). */
export const AI: RateLimitPreset = {
  limit: 30,
  windowMs: HOUR,
  scope: "user",
  label: "ai-gateway",
};

/** Public Sell in 7 Days application creation — 3 per hour per IP. */
export const SELL_IN_7_DAYS_CREATE: RateLimitPreset = {
  limit: 3,
  windowMs: HOUR,
  scope: "ip",
  label: "sell-in-7-days-create",
};

/** Public tracking lookups — 10 per minute per IP (instance-local defense in depth). */
export const SELL_IN_7_DAYS_TRACK: RateLimitPreset = {
  limit: 10,
  windowMs: MINUTE,
  scope: "ip",
  label: "sell-in-7-days-track",
};


/** Public comparison session creation — 12 per hour per IP. */
export const COMPARE_CREATE: RateLimitPreset = {
  limit: 12,
  windowMs: HOUR,
  scope: "ip",
  label: "compare-create",
};

/** Public comparison item mutations — 30 per hour per IP. */
export const COMPARE_ADD_ITEM: RateLimitPreset = {
  limit: 30,
  windowMs: HOUR,
  scope: "ip",
  label: "compare-add-item",
};

/** AI comparison summaries — 5 per hour per authenticated user. */
export const COMPARE_AI_SUMMARY: RateLimitPreset = {
  limit: 5,
  windowMs: HOUR,
  scope: "user",
  label: "compare-ai-summary",
};

/** Public comparison reads — 60 per minute per IP. */
export const COMPARE_READ: RateLimitPreset = {
  limit: 60,
  windowMs: MINUTE,
  scope: "ip",
  label: "compare-read",
};

/** POST /api/inspections — 5 requests per hour per authenticated user (instance-local defense in depth). */
export const INSPECTION_CREATE: RateLimitPreset = {
  limit: 5,
  windowMs: HOUR,
  scope: "user",
  label: "inspection-create",
};

/** Messaging endpoints (offers / messages / contact-seller) — 30/h/user. */
export const MESSAGING: RateLimitPreset = {
  limit: 30,
  windowMs: HOUR,
  scope: "user",
  label: "messaging",
};

/** Company invitations — 10 per hour per authenticated user. */
export const COMPANY_INVITATION: RateLimitPreset = {
  limit: 10,
  windowMs: HOUR,
  scope: "user",
  label: "company-invitation",
};

/** Invitation acceptance — 10 per hour per authenticated user. */
export const COMPANY_INVITATION_ACCEPT: RateLimitPreset = {
  limit: 10,
  windowMs: HOUR,
  scope: "user",
  label: "company-invitation-accept",
};

/** Organization onboarding — 3 attempts per hour per authenticated user. */
export const COMPANY_CREATE: RateLimitPreset = {
  limit: 3,
  windowMs: HOUR,
  scope: "user",
  label: "company-create",
};

/**
 * Wanted-request creation — 10 per hour per authenticated user.
 * Protects against duplicate-submit storms (retry / double-click) and
 * low-effort spam of the BuyRequest moderation queue. In-process,
 * per-isolate (same caveat as the other presets — a distributed
 * limiter is a follow-up).
 */
export const WANTED_CREATE: RateLimitPreset = {
  limit: 10,
  windowMs: HOUR,
  scope: "user",
  label: "wanted-create",
};

/**
 * Listing creation (SALE/RENT/AUCTION/QUOTE/SERVICE_*) — 10 per hour per
 * authenticated user. Mirrors WANTED_CREATE: a seller spamming the
 * moderation queue with listings is the supply-side equivalent of the
 * demand-side duplicate-submit storm. In-process, per-isolate.
 */
export const LISTING_CREATE: RateLimitPreset = {
  limit: 10,
  windowMs: HOUR,
  scope: "user",
  label: "listing-create",
};

/**
 * Legacy /api/requests adapter creation — 10 per hour per authenticated
 * user. The legacy route funnels into createWanted; the same duplicate-
 * submit risk applies until the route is retired.
 */
export const REQUEST_CREATE: RateLimitPreset = {
  limit: 10,
  windowMs: HOUR,
  scope: "user",
  label: "request-create",
};

/**
 * Standalone RFQ creation (/api/rfq) — 10 per hour per authenticated
 * user. Each RFQ opens a procurement workflow that consumes seller
 * attention; unbounded creation would flood the quote marketplace.
 */
export const RFQ_CREATE: RateLimitPreset = {
  limit: 10,
  windowMs: HOUR,
  scope: "user",
  label: "rfq-create",
};

/**
 * Quote submission on an RFQ (/api/rfq/[id]/quotes) — 20 per hour per
 * authenticated seller. A seller may quote on several RFQs, but the
 * rate must not allow quote-spam against a single RFQ.
 */
export const QUOTE_SUBMIT: RateLimitPreset = {
  limit: 20,
  windowMs: HOUR,
  scope: "user",
  label: "quote-submit",
};

/**
 * Convenience map for runtime lookup by name (useful if a future
 * dispatcher selects presets dynamically).
 */
export const RATE_LIMIT_PRESETS = {
  LOGIN,
  REGISTER,
  VERIFY,
  RESEND,
  UPLOAD,
  AI,
  SELL_IN_7_DAYS_CREATE,
  SELL_IN_7_DAYS_TRACK,
  COMPARE_CREATE,
  COMPARE_ADD_ITEM,
  COMPARE_READ,
  COMPARE_AI_SUMMARY,
  INSPECTION_CREATE,
  MESSAGING,
  COMPANY_INVITATION,
  COMPANY_INVITATION_ACCEPT,
  COMPANY_CREATE,
  WANTED_CREATE,
  LISTING_CREATE,
  REQUEST_CREATE,
  RFQ_CREATE,
  QUOTE_SUBMIT,
} as const;

export type RateLimitPresetName = keyof typeof RATE_LIMIT_PRESETS;
