/* ============================================================
   HEAVIX — CSRF defense (F-004 / F-005 / F-006 hardening)
   ------------------------------------------------------------
   Fail-closed Origin/Referer verification for mutation routes.
   ============================================================ */

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Return a canonical HTTP(S) origin; reject malformed and credentialed URLs. */
function toOrigin(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    if (parsed.username || parsed.password) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

/**
 * Build the allowlist only from deployment configuration and explicitly
 * trusted deployment origins, never from incoming request URL/Host headers.
 *
 * Cloudflare Workers branch previews must set HEAVIX_PREVIEW_ORIGIN to their
 * exact HTTPS origin. Do not infer it from Host or allow a workers.dev
 * wildcard: Vercel and Cloudflare previews are separate browser origins.
 */
function allowedOrigins(): Set<string> {
  const allowed = new Set<string>();
  const configured = [
    process.env.HEAVIX_PREVIEW_URL,
    process.env.NEXTAUTH_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.HEAVIX_PREVIEW_ORIGIN,
    process.env.VERCEL_URL,
    process.env.VERCEL_BRANCH_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
  ];

  for (const value of configured) {
    if (!value) continue;
    const normalized = value.includes("://") ? value : `https://${value}`;
    const origin = toOrigin(normalized);
    if (origin) allowed.add(origin);
  }

  // Development/test fallback only when no configured origin is available.
  if (allowed.size === 0 && process.env.NODE_ENV !== "production") {
    allowed.add("http://localhost:3000");
  }
  return allowed;
}

function originMatches(value: string | null, allowed: Set<string>): boolean {
  const origin = toOrigin(value);
  return origin !== null && allowed.has(origin);
}

/**
 * Fail-closed CSRF check.
 * Every mutation request requires a matching Origin or Referer.
 * Authentication headers alone are not proof of authentication and must
 * never bypass CSRF validation. If both headers are sent, both must match.
 */
export function checkCsrf(req: Request): boolean {
  const method = (req.method || "GET").toUpperCase();
  if (SAFE_METHODS.has(method)) return true;
  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");
  if (!origin && !referer) return false;

  const allowed = allowedOrigins();
  if (allowed.size === 0) return false;
  if (origin && !originMatches(origin, allowed)) return false;
  if (referer && !originMatches(referer, allowed)) return false;

  return true;
}
