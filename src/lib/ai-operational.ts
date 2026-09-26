import ZAI from "z-ai-web-dev-sdk";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";

// SERVER-ONLY — imports z-ai-web-dev-sdk + Prisma.

/* ============================================================
   HEAVIX — Phase 10 / 10E — AI Operational Signals
   ------------------------------------------------------------
   detectPriceAnomalies()
     • Scans recent PUBLISHED listings for unusual pricing
       (price far from the median for the same brand+category).
     • Returns the flagged listings with their deviation %.

   detectFraudSignals({ listing, seller })
     • Checks a listing + seller pair for suspicious patterns
       using the LLM as a pattern-suggestion engine.

   suggestNextActions({ userId, context })
     • Recommends the next action(s) a user should take based on
       their current context (recent listings, requests, etc).

   Audit keys:
     • ai.operational.anomaly
     • ai.operational.fraud
     • ai.operational.suggest

   All AI output is `AI_SUGGESTED` (never verified).
   All AI calls are best-effort (try/catch — never crash).
   ============================================================ */

export type PriceAnomaly = {
  listingId: string;
  title: string;
  price: number;
  medianPeerPrice: number;
  deviationPct: number; // signed: + over median, - under median
  brandName: string | null;
  categoryName: string | null;
};

export type AnomalyReport = {
  source: "AI_SUGGESTED";
  verified: false;
  anomalies: PriceAnomaly[];
  scannedListings: number;
  windowDays: number;
};

export type AnomalyResult =
  | { success: true; report: AnomalyReport | null }
  | { success: false; error: string; report: null };

export type FraudSignalReport = {
  source: "AI_SUGGESTED";
  verified: false;
  riskScore: number; // 0..100 (100 = highest risk)
  signals: string[];
  recommendation: string | null;
};

export type FraudResult =
  | { success: true; report: FraudSignalReport | null }
  | { success: false; error: string; report: null };

export type NextActionSuggestion = {
  source: "AI_SUGGESTED";
  verified: false;
  actions: {
    action: string;
    rationale: string;
    priority: "HIGH" | "MEDIUM" | "LOW";
  }[];
};

export type NextActionResult =
  | { success: true; suggestion: NextActionSuggestion | null }
  | { success: false; error: string; suggestion: null };

/* ── Helpers ─────────────────────────────────────────────── */

const FRAUD_SYSTEM_PROMPT = `You are HEAVIX AI Fraud Detector. Given a listing + seller profile, score the fraud risk and produce a Persian explanation.

Output STRICT JSON only:
{
  "riskScore":      0..100,
  "signals":        ["short Persian fraud signal that fired", "..."],
  "recommendation": "short Persian recommendation to the moderator (or null)"
}

Common fraud signals (use when present):
- Price far below market value (e.g. -50% vs median).
- New seller (< 7 days old) with a high-value listing.
- Phone number / contact info in description.
- Duplicate description across many listings.
- Vague / one-line description for an expensive machine.
- Brand + category mismatch.
- Listing posted from a different province than the seller's profile.

Rules:
- All human-readable text in Persian (Farsi) script.
- riskScore 0..100 (100 = highest fraud risk).
- Do NOT invent specs or prices not in the input.`;

const NEXT_ACTION_SYSTEM_PROMPT = `You are HEAVIX AI Action Advisor. Given a user's recent context (recent listings, requests, role, etc.), recommend the next 1-5 actions they should take.

Output STRICT JSON only:
{
  "actions": [
    {
      "action":     "short Persian action label",
      "rationale":  "1-sentence Persian rationale",
      "priority":   "HIGH" | "MEDIUM" | "LOW"
    }
  ]
}

Rules:
- All human-readable text in Persian (Farsi) script.
- 1-5 actions, ordered by priority (HIGH first).
- Do NOT invent URLs or phone numbers.
- Tailor the actions to the user's role (SELLER/BUYER/ADMIN) when given.`;

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

function bigToNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "bigint") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function clampScore(v: unknown): number {
  const n = num(v, 0);
  if (n < 0) return 0;
  if (n > 100) return 100;
  return Math.round(n);
}

function priorityOf(v: unknown): "HIGH" | "MEDIUM" | "LOW" {
  const s = str(v)?.toUpperCase();
  if (s === "HIGH" || s === "MEDIUM" || s === "LOW") return s;
  return "MEDIUM";
}

/* ── Task 5A: detectPriceAnomalies ───────────────────────── */

export async function detectPriceAnomalies(opts?: {
  windowDays?: number;
  thresholdPct?: number; // minimum |deviation| to flag
  userId?: string | null;
}): Promise<AnomalyResult> {
  const windowDays = Math.max(1, Math.min(90, Number(opts?.windowDays ?? 30)));
  const thresholdPct = Math.max(
    10,
    Math.min(200, Number(opts?.thresholdPct ?? 50)),
  );
  try {
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

    // Pull recent PUBLISHED listings with a price + brand/category.
    // We use a typed local ListRow shape so the `.catch(() => [])`
    // fallback below still type-checks.
    type ListRow = {
      id: string;
      title: string;
      price: bigint | null;
      brandId: string | null;
      categoryId: string | null;
      brand: { name: string } | null;
      category: { name: string } | null;
    };
    let listings: ListRow[] = [];
    try {
      listings = await db.listing.findMany({
        where: {
          status: "PUBLISHED",
          price: { not: null },
          createdAt: { gte: since },
        },
        select: {
          id: true,
          title: true,
          price: true,
          brandId: true,
          categoryId: true,
          brand: { select: { name: true } },
          category: { select: { name: true } },
        },
        take: 5000,
      });
    } catch {
      listings = [];
    }

    // Group by (brandId|categoryId) to compute a per-group median.
    const groups = new Map<string, ListRow[]>();
    for (const l of listings) {
      const key = `${l.brandId ?? "?"}|${l.categoryId ?? "?"}`;
      const arr = groups.get(key);
      if (arr) arr.push(l);
      else groups.set(key, [l]);
    }

    const anomalies: PriceAnomaly[] = [];
    for (const arr of groups.values()) {
      if (arr.length < 3) continue; // need at least 3 peers for a median
      const prices = arr
        .map((l) => bigToNumber(l.price))
        .filter((p): p is number => p !== null && p > 0)
        .sort((a, b) => a - b);
      if (prices.length < 3) continue;
      const median = prices[Math.floor(prices.length / 2)];
      if (!median || median <= 0) continue;

      for (const l of arr) {
        const p = bigToNumber(l.price);
        if (p === null || p <= 0) continue;
        const deviationPct = Math.round(
          ((p - median) / median) * 1000,
        ) / 10;
        if (Math.abs(deviationPct) >= thresholdPct) {
          anomalies.push({
            listingId: l.id,
            title: l.title,
            price: p,
            medianPeerPrice: median,
            deviationPct,
            brandName: l.brand?.name ?? null,
            categoryName: l.category?.name ?? null,
          });
        }
      }
    }

    // Sort by absolute deviation descending; cap at 50.
    anomalies.sort((a, b) => Math.abs(b.deviationPct) - Math.abs(a.deviationPct));
    const capped = anomalies.slice(0, 50);

    const report: AnomalyReport = {
      source: "AI_SUGGESTED",
      verified: false,
      anomalies: capped,
      scannedListings: listings.length,
      windowDays,
    };

    await logAudit({
      actorId: opts?.userId ?? null,
      actorType: opts?.userId ? "USER" : "SYSTEM",
      action: "ai.operational.anomaly",
      entityType: "Listing",
      entityId: null,
      after: {
        scannedListings: report.scannedListings,
        flagged: capped.length,
        windowDays,
        thresholdPct,
      },
      reason: "AI price-anomaly scan (AI_SUGGESTED — not verified)",
    }).catch(() => {
      /* best-effort audit — never throw */
    });

    return { success: true, report };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message ?? "AI anomaly detection failed",
      report: null,
    };
  }
}

/* ── Task 5B: detectFraudSignals ────────────────────────── */

export async function detectFraudSignals(input: {
  listing: Record<string, unknown>;
  seller?: Record<string, unknown> | null;
  userId?: string | null;
}): Promise<FraudResult> {
  const { listing, seller, userId } = input;
  try {
    if (!listing || typeof listing !== "object") {
      return { success: false, error: "listing is required", report: null };
    }

    const zai = await ZAI.create();
    const compact: Record<string, unknown> = { ...listing };
    if (typeof compact.description === "string") {
      compact.description = compact.description.slice(0, 1500);
    }
    if (typeof compact.title === "string") {
      compact.title = compact.title.slice(0, 300);
    }

    const userPrompt = JSON.stringify({
      listing: compact,
      seller: seller ?? null,
    });

    const completion = await zai.chat.completions.create({
      messages: [
        { role: "system", content: FRAUD_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      thinking: { type: "disabled" },
    });
    const raw = completion?.choices?.[0]?.message?.content || "";
    const parsed = safeParseJson(raw);

    if (!parsed || typeof parsed !== "object") {
      return { success: true, report: null };
    }

    const p = parsed as Record<string, any>;
    const report: FraudSignalReport = {
      source: "AI_SUGGESTED",
      verified: false,
      riskScore: clampScore(p.riskScore),
      signals: strArray(p.signals),
      recommendation: str(p.recommendation),
    };

    await logAudit({
      actorId: userId ?? null,
      actorType: userId ? "USER" : "SYSTEM",
      action: "ai.operational.fraud",
      entityType: "Listing",
      entityId: (compact.id != null ? String(compact.id) : null),
      after: {
        riskScore: report.riskScore,
        signals: report.signals,
      },
      reason: "AI fraud-signal scan (AI_SUGGESTED — not verified)",
    }).catch(() => {
      /* best-effort audit — never throw */
    });

    return { success: true, report };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message ?? "AI fraud detection failed",
      report: null,
    };
  }
}

/* ── Task 5C: suggestNextActions ────────────────────────── */

export async function suggestNextActions(input: {
  userId: string;
  context?: Record<string, unknown> | null;
}): Promise<NextActionResult> {
  const { userId, context } = input;
  try {
    if (!userId) {
      return { success: false, error: "userId is required", suggestion: null };
    }

    const zai = await ZAI.create();
    const userPrompt = JSON.stringify({
      userId,
      context: context ?? null,
    });

    const completion = await zai.chat.completions.create({
      messages: [
        { role: "system", content: NEXT_ACTION_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      thinking: { type: "disabled" },
    });
    const raw = completion?.choices?.[0]?.message?.content || "";
    const parsed = safeParseJson(raw);

    if (!parsed || typeof parsed !== "object") {
      return { success: true, suggestion: null };
    }

    const p = parsed as Record<string, any>;
    const actions = Array.isArray(p.actions)
      ? p.actions
          .map((a: any) => {
            const action = str(a?.action);
            if (!action) return null;
            return {
              action,
              rationale: str(a?.rationale) ?? "",
              priority: priorityOf(a?.priority),
            };
          })
          .filter((x): x is NonNullable<typeof x> => x !== null)
          .slice(0, 5)
      : [];

    const suggestion: NextActionSuggestion = {
      source: "AI_SUGGESTED",
      verified: false,
      actions,
    };

    await logAudit({
      actorId: userId,
      actorType: "USER",
      action: "ai.operational.suggest",
      entityType: "User",
      entityId: userId,
      after: {
        actionsCount: suggestion.actions.length,
      },
      reason: "AI next-action suggestion (AI_SUGGESTED — not verified)",
    }).catch(() => {
      /* best-effort audit — never throw */
    });

    return { success: true, suggestion };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message ?? "AI next-action suggestion failed",
      suggestion: null,
    };
  }
}
