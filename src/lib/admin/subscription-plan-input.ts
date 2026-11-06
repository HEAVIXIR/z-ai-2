/**
 * Strict input parsing for admin-managed subscription plans.
 * Keep request validation independent from Prisma so route handlers can
 * validate before opening a transaction.
 */
export type SubscriptionPlanInput = Record<string, unknown>;

const ALLOWED = new Set([
  "code", "nameFa", "nameEn", "description", "priceMonthly", "priceYearly",
  "currency", "featuredCredits", "analyticsAccess", "aiAssistantAccess",
  "priorityLeads", "companyPage", "maxListings", "maxImages", "verifiedBadge",
  "supportLevel", "sortOrder", "active", "popular", "featuresJson",
]);
const MAX_I64 = 9223372036854775807n;
const MAX_I32 = 2147483647;

type ParseResult = { ok: true; data: SubscriptionPlanInput } | { ok: false; error: string };

function boundedString(value: unknown, field: string, max: number, required = false): ParseResult | string | null {
  if (value === null || value === undefined || value === "") {
    return required ? { ok: false, error: `${field} الزامی است` } : null;
  }
  if (typeof value !== "string") return { ok: false, error: `${field} باید متن باشد` };
  const normalized = value.trim();
  if (required && !normalized) return { ok: false, error: `${field} الزامی است` };
  if (normalized.length > max) return { ok: false, error: `${field} بیش از حد طولانی است` };
  return normalized || null;
}

function parseInteger(value: unknown, field: string, max = MAX_I32): number | ParseResult {
  if (typeof value !== "number" && typeof value !== "string") {
    return { ok: false, error: `${field} باید عدد صحیح باشد` };
  }
  if (typeof value === "string" && !/^\d+$/.test(value.trim())) {
    return { ok: false, error: `${field} باید عدد صحیح نامنفی باشد` };
  }
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 0 || n > max) {
    return { ok: false, error: `${field} خارج از محدوده مجاز است` };
  }
  return n;
}

function parseMoney(value: unknown, field: string): bigint | null | ParseResult {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "bigint") {
    return { ok: false, error: `${field} معتبر نیست` };
  }
  const raw = String(value).trim();
  if (!/^\d+$/.test(raw)) return { ok: false, error: `${field} باید عدد صحیح نامنفی باشد` };
  try {
    const n = BigInt(raw);
    if (n > MAX_I64) return { ok: false, error: `${field} از محدوده دیتابیس بیشتر است` };
    return n;
  } catch {
    return { ok: false, error: `${field} معتبر نیست` };
  }
}

function parseBoolean(value: unknown, field: string): boolean | ParseResult {
  if (typeof value !== "boolean") return { ok: false, error: `${field} باید true یا false باشد` };
  return value;
}

function isError(value: unknown): value is ParseResult {
  return !!value && typeof value === "object" && "ok" in value && (value as any).ok === false;
}

/** Returns only normalized Prisma data; rejects unknown or malformed fields. */
export function parseSubscriptionPlanInput(
  input: unknown,
  mode: "create" | "update",
): ParseResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "بدنه درخواست باید یک شیء معتبر باشد" };
  }
  const body = input as Record<string, unknown>;
  for (const key of Object.keys(body)) {
    if (!ALLOWED.has(key)) return { ok: false, error: `فیلد غیرمجاز: ${key}` };
  }
  if (mode === "update" && Object.keys(body).length === 0) {
    return { ok: false, error: "حداقل یک فیلد برای ویرایش الزامی است" };
  }

  const data: SubscriptionPlanInput = {};
  const stringFields: Array<[string, number, boolean]> = [
    ["code", 64, mode === "create"],
    ["nameFa", 160, mode === "create"],
    ["nameEn", 160, false],
    ["description", 2000, false],
    ["currency", 8, false],
    ["supportLevel", 32, false],
  ];
  for (const [field, max, required] of stringFields) {
    if (mode === "create" || field in body) {
      const parsed = boundedString(body[field], field, max, required);
      if (parsed && typeof parsed === "object" && isError(parsed)) return parsed;
      if (parsed === null && required) return { ok: false, error: `${field} الزامی است` };
      if (field === "code" || field === "nameFa") data[field] = parsed;
      else data[field] = parsed;
    }
  }

  for (const field of ["priceMonthly", "priceYearly"] as const) {
    if (mode === "create" || field in body) {
      const parsed = parseMoney(body[field], field);
      if (isError(parsed)) return parsed;
      data[field] = field === "priceMonthly" && parsed === null ? BigInt(0) : parsed;
    }
  }

  const integerFields: Array<[string, number]> = [
    ["featuredCredits", 1000000], ["maxListings", MAX_I32],
    ["maxImages", 100], ["sortOrder", MAX_I32],
  ];
  for (const [field, max] of integerFields) {
    if (mode === "create" || field in body) {
      const defaultValue = field === "maxImages" ? 8 : 0;
      const parsed = parseInteger(mode === "create" && body[field] === undefined ? defaultValue : body[field], field, max);
      if (isError(parsed)) return parsed;
      data[field] = parsed;
    }
  }

  const booleanFields = [
    "analyticsAccess", "aiAssistantAccess", "priorityLeads", "companyPage",
    "verifiedBadge", "active", "popular",
  ];
  for (const field of booleanFields) {
    if (mode === "create" || field in body) {
      const defaultValue = field === "active" ? true : false;
      const parsed = parseBoolean(mode === "create" && body[field] === undefined ? defaultValue : body[field], field);
      if (isError(parsed)) return parsed;
      data[field] = parsed;
    }
  }

  if (mode === "create" || "featuresJson" in body) {
    const value = body.featuresJson;
    if (value === null || value === undefined || value === "") {
      data.featuresJson = null;
    } else {
      let parsed: unknown = value;
      if (typeof value === "string") {
        try { parsed = JSON.parse(value); } catch { return { ok: false, error: "featuresJson باید JSON معتبر باشد" }; }
      }
      if (!Array.isArray(parsed) || parsed.length > 50 || parsed.some((item) => typeof item !== "string" || item.length > 120)) {
        return { ok: false, error: "featuresJson باید آرایه‌ای حداکثر ۵۰تایی از متن‌های کوتاه باشد" };
      }
      const serialized = JSON.stringify(parsed);
      if (serialized.length > 4000) return { ok: false, error: "featuresJson بیش از حد بزرگ است" };
      data.featuresJson = serialized;
    }
  }

  if (mode === "create" && (data.currency === undefined || data.currency === null)) data.currency = "IRR";
  return { ok: true, data };
}

/** Enforce a small JSON body before parsing to limit memory/CPU abuse. */
export async function readSubscriptionPlanBody(req: Request): Promise<ParseResult> {
  const declaredLength = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > 16 * 1024) {
    return { ok: false, error: "بدنه درخواست بیش از حد بزرگ است" };
  }
  try {
    const raw = await req.text();
    if (raw.length > 16 * 1024) return { ok: false, error: "بدنه درخواست بیش از حد بزرگ است" };
    if (!raw.trim()) return { ok: false, error: "بدنه درخواست خالی است" };
    return { ok: true, data: JSON.parse(raw) as SubscriptionPlanInput };
  } catch {
    return { ok: false, error: "JSON درخواست معتبر نیست" };
  }
}
