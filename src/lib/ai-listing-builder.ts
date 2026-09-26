import ZAI from "z-ai-web-dev-sdk";
import { logAudit } from "@/lib/audit";

// SERVER-ONLY — this module imports z-ai-web-dev-sdk + Prisma and
// must never be re-exported to client bundles.

/* ============================================================
   HEAVIX — Phase 10 / 10A — AI Listing Builder Service
   ------------------------------------------------------------
   analyzeListing({ title, description, images, price })
     • Uses z-ai-web-dev-sdk to extract brand / model / category
       from free-text + suggest attributes (year, condition, hours)
       + generate SEO-friendly description + suggest a fair price
       range. Every value comes back tagged `AI_SUGGESTED` — none
       of it is promoted to DB truth without an explicit admin
       approval (HBR-1.0 law 8 / AI Untrusted).

   improveListingContent({ title, description })
     • Generates an improved, SEO-optimised title + description
       pair. Returned drafts are tagged `AI_SUGGESTED`.

   Audit: each function logs `ai.listing.analyze` /
   `ai.listing.improve` (best-effort — never throws to caller).

   Constraints (Phase 10):
     • z-ai-web-dev-sdk is imported in this server-only file —
       never re-exported to client bundles.
     • Every AI call is wrapped in try/catch. AI may fail; the
       caller gets a structured `{ success: false, error }`
       response instead of a thrown exception.
     • All AI output is marked `source: "AI_SUGGESTED"` — never
       `verified` / `truth`.
   ============================================================ */

export type ListingAnalysis = {
  source: "AI_SUGGESTED";
  verified: false;
  brand: { value: string | null; confidence: number };
  model: { value: string | null; confidence: number };
  category: { value: string | null; confidence: number };
  attributes: {
    year: { value: number | null; confidence: number };
    condition: { value: string | null; confidence: number };
    hours: { value: number | null; confidence: number };
  };
  seoDescription: { value: string | null; confidence: number };
  fairPriceRange: {
    min: number | null;
    max: number | null;
    currency: string;
    confidence: number;
  };
  raw: unknown;
};

export type ListingAnalysisResult =
  | { success: true; analysis: ListingAnalysis | null }
  | { success: false; error: string; analysis: null };

export type ImprovedListingContent = {
  source: "AI_SUGGESTED";
  verified: false;
  title: string | null;
  description: string | null;
  seoNotes: string[] | null;
};

export type ListingImproveResult =
  | { success: true; improved: ImprovedListingContent | null }
  | { success: false; error: string; improved: null };

/* ── Helpers ─────────────────────────────────────────────── */

const ANALYSIS_SYSTEM_PROMPT = `You are HEAVIX AI Listing Builder. From a heavy-machinery listing draft (title, description, optional images, and an optional price in Toman), extract a structured JSON object.

Output STRICT JSON only — no markdown fences, no commentary:
{
  "brand":      { "value": "Persian/English brand name or null", "confidence": 0.0..1.0 },
  "model":      { "value": "model name or null",                "confidence": 0.0..1.0 },
  "category":   { "value": "Persian category name or null",     "confidence": 0.0..1.0 },
  "attributes": {
    "year":      { "value": number | null, "confidence": 0.0..1.0 },
    "condition": { "value": "NEW" | "USED" | "REFURBISHED" | "FOR_PARTS" | null, "confidence": 0.0..1.0 },
    "hours":     { "value": number | null, "confidence": 0.0..1.0 }
  },
  "seoDescription": { "value": "Persian SEO-friendly description 80-200 chars", "confidence": 0.0..1.0 },
  "fairPriceRange": {
    "min": number | null,
    "max": number | null,
    "currency": "IRT" | "USD",
    "confidence": 0.0..1.0
  }
}

Rules:
- Output confidence as a number between 0 and 1.
- When a field cannot be inferred, return value=null and confidence=0.
- Use Persian (Farsi) script for all human-readable text.
- NEVER fabricate phone numbers, URLs, or spec values that aren't in the source.
- The price range is the FAIR market range in Toman, not the seller's ask.`;

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

function confidence(v: unknown): number {
  const n = num(v, 0);
  if (n === null) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return Math.round(n * 100) / 100;
}

/* ── Task 1A: analyzeListing ─────────────────────────────── */

export async function analyzeListing(input: {
  title: string;
  description?: string | null;
  images?: string[];
  price?: number | string | null;
  userId?: string | null;
}): Promise<ListingAnalysisResult> {
  const { title, description, images, price, userId } = input;
  try {
    const titleStr = String(title ?? "").trim();
    if (!titleStr) {
      return { success: false, error: "title is required", analysis: null };
    }

    const zai = await ZAI.create();
    const userPrompt = JSON.stringify({
      title: titleStr,
      description: (description ?? "").slice(0, 4000) || null,
      images: Array.isArray(images) ? images.slice(0, 5) : [],
      price: price ?? null,
    });

    const completion = await zai.chat.completions.create({
      messages: [
        { role: "system", content: ANALYSIS_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      thinking: { type: "disabled" },
    });
    const raw = completion?.choices?.[0]?.message?.content || "";
    const parsed = safeParseJson(raw);

    if (!parsed || typeof parsed !== "object") {
      return { success: true, analysis: null };
    }

    const p = parsed as Record<string, any>;
    const attrs = (p.attributes ?? {}) as Record<string, any>;
    const seo = p.seoDescription ?? {};
    const range = p.fairPriceRange ?? {};

    const analysis: ListingAnalysis = {
      source: "AI_SUGGESTED",
      verified: false,
      brand: {
        value: str(p.brand?.value ?? p.brand),
        confidence: confidence(p.brand?.confidence ?? 0.5),
      },
      model: {
        value: str(p.model?.value ?? p.model),
        confidence: confidence(p.model?.confidence ?? 0.5),
      },
      category: {
        value: str(p.category?.value ?? p.category),
        confidence: confidence(p.category?.confidence ?? 0.5),
      },
      attributes: {
        year: {
          value: num(attrs.year?.value ?? attrs.year),
          confidence: confidence(attrs.year?.confidence ?? 0.5),
        },
        condition: {
          value: str(attrs.condition?.value ?? attrs.condition),
          confidence: confidence(attrs.condition?.confidence ?? 0.5),
        },
        hours: {
          value: num(attrs.hours?.value ?? attrs.hours),
          confidence: confidence(attrs.hours?.confidence ?? 0.5),
        },
      },
      seoDescription: {
        value: str(seo.value ?? p.seoDescription),
        confidence: confidence(seo.confidence ?? 0.5),
      },
      fairPriceRange: {
        min: num(range.min),
        max: num(range.max),
        currency: str(range.currency) || "IRT",
        confidence: confidence(range.confidence ?? 0.4),
      },
      raw: parsed,
    };

    await logAudit({
      actorId: userId ?? null,
      actorType: userId ? "USER" : "SYSTEM",
      action: "ai.listing.analyze",
      entityType: "Listing",
      entityId: null,
      after: {
        title: titleStr.slice(0, 200),
        brandSuggested: analysis.brand.value,
        categorySuggested: analysis.category.value,
        priceRangeSuggested: analysis.fairPriceRange,
      },
      reason: "AI listing analysis suggestion (AI_SUGGESTED — not verified)",
    }).catch(() => {
      /* best-effort audit — never throw */
    });

    return { success: true, analysis };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message ?? "AI listing analysis failed",
      analysis: null,
    };
  }
}

/* ── Task 1B: improveListingContent ───────────────────────── */

const IMPROVE_SYSTEM_PROMPT = `You are HEAVIX AI SEO Copywriter. Given a heavy-machinery listing title + description, generate an improved, SEO-optimised title + description in Persian.

Output STRICT JSON only:
{
  "title": "improved Persian title (max 80 chars, keyword-rich)",
  "description": "improved Persian description (200-600 chars, marketing tone, includes key specs and benefits)",
  "seoNotes": ["short note about why these changes improve SEO", "..."]
}

Rules:
- All output in Persian (Farsi) script.
- Keep the original meaning — do not invent specs that aren't in the source.
- Title must include brand + model + key spec when available.
- Description must be readable, not keyword-stuffed.`;

export async function improveListingContent(input: {
  title: string;
  description?: string | null;
  userId?: string | null;
}): Promise<ListingImproveResult> {
  const { title, description, userId } = input;
  try {
    const titleStr = String(title ?? "").trim();
    if (!titleStr) {
      return { success: false, error: "title is required", improved: null };
    }

    const zai = await ZAI.create();
    const userPrompt = JSON.stringify({
      title: titleStr,
      description: (description ?? "").slice(0, 4000) || null,
    });

    const completion = await zai.chat.completions.create({
      messages: [
        { role: "system", content: IMPROVE_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      thinking: { type: "disabled" },
    });
    const raw = completion?.choices?.[0]?.message?.content || "";
    const parsed = safeParseJson(raw);

    if (!parsed || typeof parsed !== "object") {
      return { success: true, improved: null };
    }

    const p = parsed as Record<string, any>;
    const notes = Array.isArray(p.seoNotes)
      ? p.seoNotes.map((n) => String(n ?? "").trim()).filter(Boolean)
      : null;

    const improved: ImprovedListingContent = {
      source: "AI_SUGGESTED",
      verified: false,
      title: str(p.title),
      description: str(p.description),
      seoNotes: notes && notes.length ? notes : null,
    };

    await logAudit({
      actorId: userId ?? null,
      actorType: userId ? "USER" : "SYSTEM",
      action: "ai.listing.improve",
      entityType: "Listing",
      entityId: null,
      after: {
        originalTitle: titleStr.slice(0, 200),
        improvedTitle: improved.title?.slice(0, 200),
      },
      reason: "AI listing content improvement suggestion (AI_SUGGESTED — not verified)",
    }).catch(() => {
      /* best-effort audit — never throw */
    });

    return { success: true, improved };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message ?? "AI listing improvement failed",
      improved: null,
    };
  }
}
