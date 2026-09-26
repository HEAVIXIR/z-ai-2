import ZAI from "z-ai-web-dev-sdk";
import { logAudit } from "@/lib/audit";

// SERVER-ONLY — imports z-ai-web-dev-sdk.

/* ============================================================
   HEAVIX — Phase 10 / 10D — AI Content Assistant
   ------------------------------------------------------------
   generateArticleOutline({ topic, keywords })
     • Creates a structured article outline (H1/H2/H3 + a short
       brief per section).

   optimizeForSEO({ title, content })
     • Suggests a meta description, focus keywords, and Open
       Graph / Twitter card tags for a given article.

   checkListingQuality({ listing })
     • Returns a 0..100 quality score, list of missing fields,
       and concrete improvement suggestions for a Listing.

   Audit keys:
     • ai.content.outline
     • ai.content.seo
     • ai.content.quality_check

   All AI output is `AI_SUGGESTED` (never verified).
   All AI calls are best-effort (try/catch — never crash).
   ============================================================ */

export type ArticleOutline = {
  source: "AI_SUGGESTED";
  verified: false;
  topic: string;
  sections: {
    heading: string;
    level: 1 | 2 | 3;
    brief: string;
  }[];
  suggestedTags: string[];
  estimatedWordCount: number;
};

export type OutlineResult =
  | { success: true; outline: ArticleOutline | null }
  | { success: false; error: string; outline: null };

export type SEOSuggestion = {
  source: "AI_SUGGESTED";
  verified: false;
  metaTitle: string | null;
  metaDescription: string | null;
  focusKeywords: string[];
  ogTitle: string | null;
  ogDescription: string | null;
  ogImageAlt: string | null;
  twitterCard: "summary" | "summary_large_image" | null;
};

export type SEOResult =
  | { success: true; seo: SEOSuggestion | null }
  | { success: false; error: string; seo: null };

export type ListingQualityReport = {
  source: "AI_SUGGESTED";
  verified: false;
  score: number; // 0..100
  missingFields: string[];
  suggestions: string[];
  strengths: string[];
};

export type ListingQualityResult =
  | { success: true; report: ListingQualityReport | null }
  | { success: false; error: string; report: null };

/* ── Helpers ─────────────────────────────────────────────── */

const OUTLINE_SYSTEM_PROMPT = `You are HEAVIX AI Content Outline Builder. From a topic and optional keywords, produce a structured Persian article outline.

Output STRICT JSON only:
{
  "sections": [
    { "heading": "Persian heading", "level": 1|2|3, "brief": "1-2 sentence Persian brief for this section" }
  ],
  "suggestedTags": ["short Persian tag 1", "..."],
  "estimatedWordCount": number
}

Rules:
- All human-readable text in Persian (Farsi) script.
- Start with exactly one level-1 (H1) section (the article title).
- Follow with 3-6 level-2 (H2) sections, optionally with 1-2 level-3 (H3) subsections each.
- estimatedWordCount: realistic 600-2000 range.
- suggestedTags: 3-6 short Persian keywords.
- Do NOT invent brand names or specs that aren't in the topic.`;

const SEO_SYSTEM_PROMPT = `You are HEAVIX AI SEO Optimizer. Given an article title + content (Markdown or plain text), produce Persian SEO metadata.

Output STRICT JSON only:
{
  "metaTitle":       "Persian meta title (max 60 chars)",
  "metaDescription": "Persian meta description (140-160 chars)",
  "focusKeywords":   ["Persian keyword 1", "..."],
  "ogTitle":         "Persian OG title (max 60 chars, can equal metaTitle)",
  "ogDescription":   "Persian OG description (max 160 chars)",
  "ogImageAlt":      "Persian alt-text for the OG image",
  "twitterCard":     "summary" | "summary_large_image"
}

Rules:
- All human-readable text in Persian (Farsi) script.
- focusKeywords: 3-6 short Persian keywords.
- Do NOT invent phone numbers, URLs, or specs that aren't in the content.`;

const QUALITY_SYSTEM_PROMPT = `You are HEAVIX AI Listing Quality Reviewer. Given a Listing JSON object (title, description, price, brand, category, city, year, condition, hours, verified, imageCount, etc.), produce a quality report.

Output STRICT JSON only:
{
  "score":          0..100,
  "missingFields":   ["Persian field name that is missing or empty", "..."],
  "suggestions":    ["concrete Persian suggestion 1", "..."],
  "strengths":       ["Persian strength 1", "..."]
}

Rules:
- Score 0..100 (100 = perfect listing).
- All human-readable text in Persian (Farsi) script.
- missingFields: list fields that should be filled but aren't (e.g. "تصویر اصلی", "سال ساخت", "کارکرد").
- suggestions: 2-5 concrete actionable Persian suggestions.
- strengths: 1-4 short Persian phrases describing what's already good.
- Do NOT invent specs that aren't in the input.`;

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

function num(v: unknown, fallback: number = 0): number {
  if (v === null || v === undefined) return fallback;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function clampScore(v: unknown): number {
  const n = num(v, 0);
  if (n < 0) return 0;
  if (n > 100) return 100;
  return Math.round(n);
}

function levelOf(v: unknown): 1 | 2 | 3 {
  const n = num(v, 2);
  if (n === 1) return 1;
  if (n === 3) return 3;
  return 2;
}

/* ── Task 4A: generateArticleOutline ──────────────────────── */

export async function generateArticleOutline(input: {
  topic: string;
  keywords?: string[];
  userId?: string | null;
}): Promise<OutlineResult> {
  const { topic, keywords, userId } = input;
  try {
    const t = String(topic ?? "").trim();
    if (!t) {
      return { success: false, error: "topic is required", outline: null };
    }

    const zai = await ZAI.create();
    const userPrompt = JSON.stringify({
      topic: t.slice(0, 600),
      keywords: Array.isArray(keywords) ? keywords.slice(0, 12) : [],
    });

    const completion = await zai.chat.completions.create({
      messages: [
        { role: "system", content: OUTLINE_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      thinking: { type: "disabled" },
    });
    const raw = completion?.choices?.[0]?.message?.content || "";
    const parsed = safeParseJson(raw);

    if (!parsed || typeof parsed !== "object") {
      return { success: true, outline: null };
    }

    const p = parsed as Record<string, any>;
    const sections = Array.isArray(p.sections)
      ? p.sections
          .map((s: any) => {
            const heading = str(s?.heading);
            if (!heading) return null;
            return {
              heading,
              level: levelOf(s?.level),
              brief: str(s?.brief) ?? "",
            };
          })
          .filter((x): x is NonNullable<typeof x> => x !== null)
      : [];

    const outline: ArticleOutline = {
      source: "AI_SUGGESTED",
      verified: false,
      topic: t,
      sections,
      suggestedTags: strArray(p.suggestedTags),
      estimatedWordCount: Math.max(0, Math.round(num(p.estimatedWordCount, 600))),
    };

    await logAudit({
      actorId: userId ?? null,
      actorType: userId ? "USER" : "SYSTEM",
      action: "ai.content.outline",
      entityType: "Article",
      entityId: null,
      after: {
        topic: t.slice(0, 200),
        sections: outline.sections.length,
      },
      reason: "AI article outline (AI_SUGGESTED — not verified)",
    }).catch(() => {
      /* best-effort audit — never throw */
    });

    return { success: true, outline };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message ?? "AI outline generation failed",
      outline: null,
    };
  }
}

/* ── Task 4B: optimizeForSEO ─────────────────────────────── */

export async function optimizeForSEO(input: {
  title: string;
  content: string;
  userId?: string | null;
}): Promise<SEOResult> {
  const { title, content, userId } = input;
  try {
    const t = String(title ?? "").trim();
    const c = String(content ?? "").trim();
    if (!t) {
      return { success: false, error: "title is required", seo: null };
    }

    const zai = await ZAI.create();
    const userPrompt = JSON.stringify({
      title: t.slice(0, 300),
      content: c.slice(0, 6000),
    });

    const completion = await zai.chat.completions.create({
      messages: [
        { role: "system", content: SEO_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      thinking: { type: "disabled" },
    });
    const raw = completion?.choices?.[0]?.message?.content || "";
    const parsed = safeParseJson(raw);

    if (!parsed || typeof parsed !== "object") {
      return { success: true, seo: null };
    }

    const p = parsed as Record<string, any>;
    const tw = str(p.twitterCard)?.toLowerCase();
    const twitterCard: SEOSuggestion["twitterCard"] =
      tw === "summary" || tw === "summary_large_image" ? (tw as any) : null;

    const seo: SEOSuggestion = {
      source: "AI_SUGGESTED",
      verified: false,
      metaTitle: str(p.metaTitle),
      metaDescription: str(p.metaDescription),
      focusKeywords: strArray(p.focusKeywords),
      ogTitle: str(p.ogTitle),
      ogDescription: str(p.ogDescription),
      ogImageAlt: str(p.ogImageAlt),
      twitterCard,
    };

    await logAudit({
      actorId: userId ?? null,
      actorType: userId ? "USER" : "SYSTEM",
      action: "ai.content.seo",
      entityType: "Article",
      entityId: null,
      after: {
        title: t.slice(0, 200),
        metaTitle: seo.metaTitle?.slice(0, 120),
        focusKeywords: seo.focusKeywords,
      },
      reason: "AI SEO suggestion (AI_SUGGESTED — not verified)",
    }).catch(() => {
      /* best-effort audit — never throw */
    });

    return { success: true, seo };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message ?? "AI SEO optimization failed",
      seo: null,
    };
  }
}

/* ── Task 4C: checkListingQuality ────────────────────────── */

export async function checkListingQuality(input: {
  listing: Record<string, unknown>;
  userId?: string | null;
}): Promise<ListingQualityResult> {
  const { listing, userId } = input;
  try {
    if (!listing || typeof listing !== "object") {
      return { success: false, error: "listing is required", report: null };
    }

    const zai = await ZAI.create();
    // Truncate long description fields so the prompt window stays small.
    const compact: Record<string, unknown> = { ...listing };
    if (typeof compact.description === "string") {
      compact.description = compact.description.slice(0, 1500);
    }
    if (typeof compact.title === "string") {
      compact.title = compact.title.slice(0, 300);
    }

    const completion = await zai.chat.completions.create({
      messages: [
        { role: "system", content: QUALITY_SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify(compact) },
      ],
      thinking: { type: "disabled" },
    });
    const raw = completion?.choices?.[0]?.message?.content || "";
    const parsed = safeParseJson(raw);

    if (!parsed || typeof parsed !== "object") {
      return { success: true, report: null };
    }

    const p = parsed as Record<string, any>;
    const report: ListingQualityReport = {
      source: "AI_SUGGESTED",
      verified: false,
      score: clampScore(p.score),
      missingFields: strArray(p.missingFields),
      suggestions: strArray(p.suggestions),
      strengths: strArray(p.strengths),
    };

    await logAudit({
      actorId: userId ?? null,
      actorType: userId ? "USER" : "SYSTEM",
      action: "ai.content.quality_check",
      entityType: "Listing",
      entityId: (compact.id != null ? String(compact.id) : null),
      after: {
        score: report.score,
        missingFields: report.missingFields,
        suggestions: report.suggestions,
      },
      reason: "AI listing quality check (AI_SUGGESTED — not verified)",
    }).catch(() => {
      /* best-effort audit — never throw */
    });

    return { success: true, report };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message ?? "AI quality check failed",
      report: null,
    };
  }
}
