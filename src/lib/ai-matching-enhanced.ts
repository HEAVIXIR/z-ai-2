import ZAI from "z-ai-web-dev-sdk";
import { logAudit } from "@/lib/audit";

// SERVER-ONLY — imports z-ai-web-dev-sdk.

/* ============================================================
   HEAVIX — Phase 10 / 10C — AI Matching Enhancement
   ------------------------------------------------------------
   enhanceMatchScore({ buyRequest, candidateListings })
     • Uses the LLM to score candidate listings by semantic
       relevance to a BuyRequest. Returns 0..1 scores + a
       rationale string for each candidate, ranked by
       buyer-intent + listing-quality.

   generateMatchExplanation(match)
     • Produces a human-readable Persian explanation of WHY a
       given listing matches a BuyRequest (signals that fired,
       gaps, recommendation).

   Audit: `ai.matching.enhance`.
   All AI output is `AI_SUGGESTED` (never verified).
   All AI calls are best-effort (try/catch — never crash).
   ============================================================ */

export type BuyRequestInput = {
  id: string;
  title: string;
  description?: string | null;
  category?: string | null;
  brandPref?: string | null;
  budgetMin?: number | bigint | string | null;
  budgetMax?: number | bigint | string | null;
  city?: string | null;
  province?: string | null;
};

export type CandidateListingInput = {
  id: string;
  title: string;
  description?: string | null;
  price?: number | bigint | string | null;
  brandName?: string | null;
  categoryName?: string | null;
  city?: string | null;
  province?: string | null;
  condition?: string | null;
  year?: number | null;
  verified?: boolean;
};

export type EnhancedMatch = {
  listingId: string;
  semanticScore: number; // 0..1
  buyerIntentScore: number; // 0..1
  listingQualityScore: number; // 0..1
  overallScore: number; // 0..1
  rationale: string;
  signals: string[];
};

export type EnhancedMatchResult =
  | { success: true; matches: EnhancedMatch[] | null }
  | { success: false; error: string; matches: null };

export type MatchExplanation = {
  source: "AI_SUGGESTED";
  verified: false;
  explanation: string;
  signals: string[];
  recommendation: string | null;
};

export type MatchExplanationResult =
  | { success: true; explanation: MatchExplanation | null }
  | { success: false; error: string; explanation: null };

/* ── Helpers ─────────────────────────────────────────────── */

const ENHANCE_SYSTEM_PROMPT = `You are HEAVIX AI Matching Engine. Given a BuyRequest (a buyer's structured want) and a list of candidate listings, score each candidate against the request.

Output STRICT JSON only — no markdown fences, no commentary:
{
  "matches": [
    {
      "listingId":   "<id from input>",
      "semanticScore":       0.0..1.0,
      "buyerIntentScore":   0.0..1.0,
      "listingQualityScore":0.0..1.0,
      "overallScore":       0.0..1.0,
      "rationale":  "short Persian explanation of the match",
      "signals":    ["Persian signal that fired", "..."]
    }
  ]
}

Rules:
- Score 0..1 (1 = perfect match).
- semanticScore: how well the listing text matches the request text.
- buyerIntentScore: how well the listing's transaction type + price fits the buyer's intent.
- listingQualityScore: how complete / verified / well-described the listing is.
- overallScore: your overall blended score (not necessarily the arithmetic mean).
- rationale: ONE concise Persian sentence.
- signals: 2-5 short Persian phrases ("دسته یکسان", "قیمت در محدوده بودجه", ...).
- Output one entry per candidate listing (preserve listingId).
- All human-readable text in Persian (Farsi) script.`;

const EXPLAIN_SYSTEM_PROMPT = `You are HEAVIX AI Matching Explainer. Given a single BuyRequest + Listing pair with a numeric match score, produce a Persian human-readable explanation of WHY the listing matches the request.

Output STRICT JSON only:
{
  "explanation":   "2-4 sentence Persian explanation",
  "signals":       ["short Persian signal that fired", "..."],
  "recommendation": "short Persian recommendation to the buyer (or null if no recommendation)"
}

Rules:
- All human-readable text in Persian (Farsi) script.
- Do NOT invent specs that aren't in the input.
- If the match is weak, say so honestly in the recommendation.`;

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

function num(v: unknown, fallback: number = 0): number {
  if (v === null || v === undefined) return fallback;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return Math.round(n * 100) / 100;
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

function bigToNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "bigint") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function compactBuyRequest(r: BuyRequestInput) {
  return {
    id: r.id,
    title: r.title?.slice(0, 200) ?? "",
    description: (r.description ?? "").slice(0, 800) || null,
    category: r.category,
    brandPref: r.brandPref,
    budgetMin: bigToNumber(r.budgetMin),
    budgetMax: bigToNumber(r.budgetMax),
    city: r.city,
    province: r.province,
  };
}

function compactListing(l: CandidateListingInput) {
  return {
    id: l.id,
    title: l.title?.slice(0, 200) ?? "",
    description: (l.description ?? "").slice(0, 600) || null,
    price: bigToNumber(l.price),
    brandName: l.brandName,
    categoryName: l.categoryName,
    city: l.city,
    province: l.province,
    condition: l.condition,
    year: l.year,
    verified: l.verified ?? false,
  };
}

/* ── Task 3A: enhanceMatchScore ───────────────────────────── */

export async function enhanceMatchScore(input: {
  buyRequest: BuyRequestInput;
  candidateListings: CandidateListingInput[];
  userId?: string | null;
}): Promise<EnhancedMatchResult> {
  const { buyRequest, candidateListings, userId } = input;
  try {
    if (!buyRequest || !buyRequest.id) {
      return { success: false, error: "buyRequest.id is required", matches: null };
    }
    if (!Array.isArray(candidateListings) || candidateListings.length === 0) {
      return { success: true, matches: [] };
    }

    // Cap candidates so we don't blow the prompt window.
    const capped = candidateListings.slice(0, 25);

    const zai = await ZAI.create();
    const userPrompt = JSON.stringify({
      buyRequest: compactBuyRequest(buyRequest),
      candidates: capped.map(compactListing),
    });

    const completion = await zai.chat.completions.create({
      messages: [
        { role: "system", content: ENHANCE_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      thinking: { type: "disabled" },
    });
    const raw = completion?.choices?.[0]?.message?.content || "";
    const parsed = safeParseJson(raw);

    if (!parsed || typeof parsed !== "object") {
      return { success: true, matches: null };
    }

    const p = parsed as Record<string, any>;
    const arr = Array.isArray(p.matches) ? p.matches : [];

    const matches: EnhancedMatch[] = arr
      .map((m: any): EnhancedMatch | null => {
        const listingId = str(m?.listingId);
        if (!listingId) return null;
        const overall = num(m?.overallScore);
        return {
          listingId,
          semanticScore: num(m?.semanticScore),
          buyerIntentScore: num(m?.buyerIntentScore),
          listingQualityScore: num(m?.listingQualityScore),
          overallScore: overall,
          rationale: str(m?.rationale) ?? "",
          signals: strArray(m?.signals),
        };
      })
      .filter((x): x is EnhancedMatch => x !== null)
      .sort((a, b) => b.overallScore - a.overallScore);

    await logAudit({
      actorId: userId ?? null,
      actorType: userId ? "USER" : "SYSTEM",
      action: "ai.matching.enhance",
      entityType: "BuyRequest",
      entityId: buyRequest.id,
      after: {
        candidates: capped.length,
        matches: matches.length,
        topScore: matches[0]?.overallScore ?? 0,
      },
      reason: "AI matching enhancement (AI_SUGGESTED — not verified)",
    }).catch(() => {
      /* best-effort audit — never throw */
    });

    return { success: true, matches };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message ?? "AI match enhancement failed",
      matches: null,
    };
  }
}

/* ── Task 3B: generateMatchExplanation ──────────────────── */

export async function generateMatchExplanation(input: {
  buyRequest: BuyRequestInput;
  listing: CandidateListingInput;
  matchScore?: number;
  userId?: string | null;
}): Promise<MatchExplanationResult> {
  const { buyRequest, listing, matchScore, userId } = input;
  try {
    if (!buyRequest || !buyRequest.id || !listing || !listing.id) {
      return {
        success: false,
        error: "buyRequest.id + listing.id are required",
        explanation: null,
      };
    }

    const zai = await ZAI.create();
    const userPrompt = JSON.stringify({
      buyRequest: compactBuyRequest(buyRequest),
      listing: compactListing(listing),
      matchScore: typeof matchScore === "number" ? matchScore : null,
    });

    const completion = await zai.chat.completions.create({
      messages: [
        { role: "system", content: EXPLAIN_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      thinking: { type: "disabled" },
    });
    const raw = completion?.choices?.[0]?.message?.content || "";
    const parsed = safeParseJson(raw);

    if (!parsed || typeof parsed !== "object") {
      return { success: true, explanation: null };
    }

    const p = parsed as Record<string, any>;
    const explanation: MatchExplanation = {
      source: "AI_SUGGESTED",
      verified: false,
      explanation: str(p.explanation) ?? "",
      signals: strArray(p.signals),
      recommendation: str(p.recommendation),
    };

    await logAudit({
      actorId: userId ?? null,
      actorType: userId ? "USER" : "SYSTEM",
      action: "ai.matching.enhance",
      entityType: "BuyRequest",
      entityId: buyRequest.id,
      after: {
        listingId: listing.id,
        matchScore: matchScore ?? null,
      },
      reason: "AI match explanation (AI_SUGGESTED — not verified)",
    }).catch(() => {
      /* best-effort audit — never throw */
    });

    return { success: true, explanation };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message ?? "AI match explanation failed",
      explanation: null,
    };
  }
}
