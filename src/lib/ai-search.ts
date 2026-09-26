import ZAI from "z-ai-web-dev-sdk";
import { logAudit } from "@/lib/audit";

// SERVER-ONLY — imports z-ai-web-dev-sdk + Prisma.

/* ============================================================
   HEAVIX — Phase 10 / 10B — AI Search Enhancement
   ------------------------------------------------------------
   understandQuery(query)
     • Uses z-ai-web-dev-sdk to detect the buyer's intent
       (BUY / RENT / SERVICE / PARTS — plus COMPARE / RESEARCH)
       and extract entities (brand, model, category, location,
       price range) + generate synonyms / related terms.

   getZeroResultRecovery(query)
     • When a search returns 0 results, suggest broader search
       terms, similar categories, and offer to create a Wanted
       (BuyRequest) request from the dead-end query.

   Audit: `ai.search.understand` / `ai.search.zero_recovery`.
   All AI output is `AI_SUGGESTED` (never verified).
   All AI calls are best-effort (try/catch — never crash the
   calling route).
   ============================================================ */

export type SearchIntent =
  | "BUY"
  | "RENT"
  | "SERVICE"
  | "PARTS"
  | "COMPARE"
  | "RESEARCH"
  | "UNKNOWN";

export type QueryUnderstanding = {
  source: "AI_SUGGESTED";
  verified: false;
  intent: SearchIntent;
  entities: {
    brand: string | null;
    model: string | null;
    category: string | null;
    location: string | null;
    minPrice: number | null;
    maxPrice: number | null;
  };
  synonyms: string[];
  relatedTerms: string[];
  raw: unknown;
};

export type UnderstandResult =
  | { success: true; understanding: QueryUnderstanding | null }
  | { success: false; error: string; understanding: null };

export type ZeroResultRecovery = {
  source: "AI_SUGGESTED";
  verified: false;
  broaderQueries: string[];
  similarCategories: string[];
  suggestedWantedRequest: {
    title: string;
    category: string | null;
    brand: string | null;
  } | null;
  raw: unknown;
};

export type ZeroResultRecoveryResult =
  | { success: true; recovery: ZeroResultRecovery | null }
  | { success: false; error: string; recovery: null };

/* ── Helpers ─────────────────────────────────────────────── */

const UNDERSTAND_SYSTEM_PROMPT = `You are HEAVIX AI Search Assistant. From a Persian natural-language search query about heavy industrial machinery, produce a structured JSON object describing the buyer's intent and extracted entities.

Output STRICT JSON only — no markdown fences, no commentary:
{
  "intent": "BUY" | "RENT" | "SERVICE" | "PARTS" | "COMPARE" | "RESEARCH" | "UNKNOWN",
  "entities": {
    "brand":     "Persian/English brand name or null",
    "model":     "model name or null",
    "category":  "Persian category name or null",
    "location":  "Persian province/city or null",
    "minPrice":  number (Toman) | null,
    "maxPrice":  number (Toman) | null
  },
  "synonyms":     ["alternative spelling or synonym 1", "..."],
  "relatedTerms": ["related concept 1", "..."]
}

Intent rules:
- BUY: user wants to purchase ("می‌خوام بخرم", "قیمت", "فروش")
- RENT: user wants to rent ("اجاره", "کرایه", "رنت")
- SERVICE: repair/maintenance ("تعمیر", "سرویس", "دیزل‌نگاری")
- PARTS: spare parts ("قطعه", "یدکی", "فیلتر", "روغن")
- COMPARE: comparing models/brands ("مقایسه", "بهتره", "یا")
- RESEARCH: research/info ("مشخصات", "توان", "وزن", "راهنما")
- UNKNOWN: cannot be classified

Rules:
- All human-readable text in Persian (Farsi) script.
- Synonyms / related terms: 3-8 short Persian keywords.
- NEVER invent prices or specs not in the query.`;

const ZERO_RECOVERY_SYSTEM_PROMPT = `You are HEAVIX AI Search Recovery Assistant. A buyer's search returned 0 results. Generate a JSON recovery payload with broader queries, similar categories, and a Wanted-request template that the buyer can post.

Output STRICT JSON only:
{
  "broaderQueries":     ["broader search query 1", "..."],
  "similarCategories":  ["related Persian category name 1", "..."],
  "suggestedWantedRequest": {
    "title":    "concise Persian BuyRequest title",
    "category": "Persian category name or null",
    "brand":    "Persian brand name or null"
  } | null
}

Rules:
- All human-readable text in Persian (Farsi) script.
- broaderQueries: 3-6 less restrictive Persian queries (drop a brand, broaden a category).
- similarCategories: 2-5 Persian category names that might contain the buyer's need.
- suggestedWantedRequest: only present if intent looks BUY/RENT. null otherwise.
- NEVER fabricate phone numbers, prices, or specs.`;

function safeParseJson(raw: string): unknown | null {
  if (!raw) return null;
  const cleaned = raw.replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

function num(v: unknown, fallback: number | null = null): number | null {
  if (v === null || v === undefined) return fallback;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function strArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => str(x))
    .filter((x): x is string => x !== null)
    .slice(0, 12);
}

function normaliseIntent(v: unknown): SearchIntent {
  const s = str(v)?.toUpperCase();
  const allowed: SearchIntent[] = [
    "BUY",
    "RENT",
    "SERVICE",
    "PARTS",
    "COMPARE",
    "RESEARCH",
  ];
  return (s && allowed.includes(s as SearchIntent) ? s : "UNKNOWN") as SearchIntent;
}

/* ── Task 2A: understandQuery ─────────────────────────────── */

export async function understandQuery(input: {
  query: string;
  userId?: string | null;
}): Promise<UnderstandResult> {
  const { query, userId } = input;
  try {
    const q = String(query ?? "").trim();
    if (!q) {
      return { success: false, error: "query is required", understanding: null };
    }

    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: [
        { role: "system", content: UNDERSTAND_SYSTEM_PROMPT },
        { role: "user", content: q.slice(0, 1000) },
      ],
      thinking: { type: "disabled" },
    });
    const raw = completion?.choices?.[0]?.message?.content || "";
    const parsed = safeParseJson(raw);

    if (!parsed || typeof parsed !== "object") {
      return { success: true, understanding: null };
    }

    const p = parsed as Record<string, any>;
    const entities = (p.entities ?? {}) as Record<string, any>;

    const understanding: QueryUnderstanding = {
      source: "AI_SUGGESTED",
      verified: false,
      intent: normaliseIntent(p.intent),
      entities: {
        brand: str(entities.brand),
        model: str(entities.model),
        category: str(entities.category),
        location: str(entities.location),
        minPrice: num(entities.minPrice),
        maxPrice: num(entities.maxPrice),
      },
      synonyms: strArray(p.synonyms),
      relatedTerms: strArray(p.relatedTerms),
      raw: parsed,
    };

    await logAudit({
      actorId: userId ?? null,
      actorType: userId ? "USER" : "SYSTEM",
      action: "ai.search.understand",
      entityType: "Search",
      entityId: null,
      after: {
        query: q.slice(0, 200),
        intent: understanding.intent,
        entities: understanding.entities,
      },
      reason: "AI query understanding (AI_SUGGESTED — not verified)",
    }).catch(() => {
      /* best-effort audit — never throw */
    });

    return { success: true, understanding };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message ?? "AI query understanding failed",
      understanding: null,
    };
  }
}

/* ── Task 2B: getZeroResultRecovery ──────────────────────── */

export async function getZeroResultRecovery(input: {
  query: string;
  userId?: string | null;
}): Promise<ZeroResultRecoveryResult> {
  const { query, userId } = input;
  try {
    const q = String(query ?? "").trim();
    if (!q) {
      return { success: false, error: "query is required", recovery: null };
    }

    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: [
        { role: "system", content: ZERO_RECOVERY_SYSTEM_PROMPT },
        { role: "user", content: q.slice(0, 1000) },
      ],
      thinking: { type: "disabled" },
    });
    const raw = completion?.choices?.[0]?.message?.content || "";
    const parsed = safeParseJson(raw);

    if (!parsed || typeof parsed !== "object") {
      return { success: true, recovery: null };
    }

    const p = parsed as Record<string, any>;
    const want = p.suggestedWantedRequest;

    const recovery: ZeroResultRecovery = {
      source: "AI_SUGGESTED",
      verified: false,
      broaderQueries: strArray(p.broaderQueries),
      similarCategories: strArray(p.similarCategories),
      suggestedWantedRequest:
        want && typeof want === "object"
          ? {
              title: str(want.title) ?? q,
              category: str(want.category),
              brand: str(want.brand),
            }
          : null,
      raw: parsed,
    };

    await logAudit({
      actorId: userId ?? null,
      actorType: userId ? "USER" : "SYSTEM",
      action: "ai.search.zero_recovery",
      entityType: "Search",
      entityId: null,
      after: {
        query: q.slice(0, 200),
        broaderQueries: recovery.broaderQueries,
        similarCategories: recovery.similarCategories,
        suggestedWanted: recovery.suggestedWantedRequest,
      },
      reason: "AI zero-result recovery suggestion (AI_SUGGESTED — not verified)",
    }).catch(() => {
      /* best-effort audit — never throw */
    });

    return { success: true, recovery };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message ?? "AI zero-result recovery failed",
      recovery: null,
    };
  }
}
