/* ============================================================
   HEAVIX — Request context helpers (P0-6)
   ------------------------------------------------------------
   Shared client identity extraction for rate-limited API routes.
   ============================================================ */

/**
 * Best-effort client-IP extraction behind the documented Cloudflare/Caddy
 * proxy chain. Prefer Cloudflare's edge-provided address. Caddy appends the
 * connecting peer to X-Forwarded-For, so use the right-most hop; never trust
 * the left-most value because it may have been supplied by the caller.
 */
export function getClientIp(req: Request): string {
  const headers = req.headers;

  const cloudflareIp = headers.get("cf-connecting-ip")?.trim();
  if (cloudflareIp) return cloudflareIp;

  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) {
    const hops = forwardedFor.split(",").map((value) => value.trim()).filter(Boolean);
    const trustedEdgeHop = hops[hops.length - 1];
    if (trustedEdgeHop) return trustedEdgeHop;
  }

  // Fallback for trusted local reverse proxies that set/overwrite X-Real-IP.
  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  return "unknown";
}

/**
 * Build a rate-limit bucket key.
 * Caller passes the identity (IP for unauthenticated endpoints, userId for
 * authenticated ones) plus the endpoint label.
 */
export function rateLimitKey(identity: string, label: string): string {
  const safe = identity.replace(/:/g, "_");
  return `${safe}:${label}`;
}
