/* ============================================================
   HEAVIX — CSRF defense (F-004 / F-005 / F-006 hardening)
   ------------------------------------------------------------
   Fail-closed Origin/Referer verification for mutation routes.
   ============================================================ */

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const NON_BROWSER_AUTH_HEADERS = [
  "authorization",
  "x-cron-key",
  "x-webhook-signature",
  "x-api-key",
] as const;

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
 * Build the allowlist only from deployment configuration, never from the
 * incoming request URL/Host headers. Vercel supplies these hostnames for the
 * active deployment/branch/project, which permits known aliases without
 * trusting a client-controlled host value as an allowed origin.
 */
function allowedOrigins(): Set<string> {
  const allowed = new Set<string>();
  const configured = [
    process.env.NEXTAUTH_URL,
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

function hasNonBrowserAuthHeader(req: Request): boolean {
  return NON_BROWSER_AUTH_HEADERS.some((header) => {
    const value = req.headers.get(header);
    return value !== null && value.length > 0;
  });
}

function originMatches(value: string | null, allowed: Set<string>): boolean {
  const origin = toOrigin(value);
  return origin !== null && allowed.has(origin);
}

/**
 * Fail-closed CSRF check.
 * Mutation requests require a matching Origin or Referer, unless they use
 * an explicit non-browser authentication header. If both headers are sent,
 * both must match a deployment-configured origin.
 */
export function checkCsrf(req: Request): boolean {
  const method = (req.method || "GET").toUpperCase();
  if (SAFE_METHODS.has(method)) return true;
  if (hasNonBrowserAuthHeader(req)) return true;

  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");
  if (!origin && !referer) return false;

  const allowed = allowedOrigins();
  if (allowed.size === 0) return false;
  if (origin && !originMatches(origin, allowed)) return false;
  if (referer && !originMatches(referer, allowed)) return false;

  return true;
}
