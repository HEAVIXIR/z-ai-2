/* ============================================================
   HEAVIX — Rate-limit enforcement helper (P0-6)
   ------------------------------------------------------------
   Thin wrapper around `rateLimit()` that returns either an "ok"
   sentinel or a ready-to-return 429 NextResponse. Lets routes
   enforce a `RateLimitPreset` before processing without each
   route repeating the same 429 boilerplate.

   Contract:
     enforceRateLimit(identity, preset) =>
       | { ok: true }
       | { ok: false, response: NextResponse }   // HTTP 429

   Usage:
     const rl = enforceRateLimit(userId, MESSAGING);
     if (!rl.ok) return rl.response;

   The caller is responsible for picking the identity (userId for
   authenticated endpoints, IP for anonymous/admin-cookie
   endpoints). The preset's `scope` field documents which is
   expected, and the `UPLOAD` / `AI` presets explicitly allow an
   IP fallback for anonymous callers.
   ============================================================ */

import { NextResponse } from "next/server";
import { rateLimit, retryAfterSeconds } from "@/lib/rate-limit";
import { rateLimitKey } from "@/lib/request-context";
import type { RateLimitPreset } from "@/lib/rate-limit-presets";

export type RateLimitOutcome =
  | { ok: true }
  | { ok: false; response: NextResponse };

/**
 * Check (and consume) the rate-limit bucket for `identity` under
 * `preset`. Returns a 429 `NextResponse` if the bucket is
 * exhausted, otherwise `{ ok: true }` so the caller can continue.
 */
export function enforceRateLimit(
  identity: string,
  preset: RateLimitPreset,
): RateLimitOutcome {
  const rl = rateLimit({
    key: rateLimitKey(identity, preset.label),
    limit: preset.limit,
    windowMs: preset.windowMs,
  });

  if (rl.ok) {
    return { ok: true };
  }

  const retryAfter = retryAfterSeconds(rl.resetAt);
  return {
    ok: false,
    response: NextResponse.json(
      {
        error: "درخواست بیش از حد. بعداً تلاش کنید.",
        retryAfter,
      },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfter) },
      },
    ),
  };
}
