import { isIP } from "node:net";
import { rateLimit, retryAfterSeconds } from "@/lib/rate-limit";

/**
 * Use only Cloudflare's authoritative connecting-IP header. Do not fall
 * back to X-Forwarded-For or X-Real-IP: either can be client-controlled
 * when a Worker is reached outside the expected proxy chain.
 */
export function getPublicApiClientIdentity(req: Request): string {
  const cloudflareIp = req.headers.get("cf-connecting-ip")?.trim();
  if (cloudflareIp && isIP(cloudflareIp)) return cloudflareIp;
  return "unknown";
}

/**
 * In-process, per-runtime public API limiter. This is a best-effort abuse
 * control only; it is not a distributed/global quota across Worker isolates.
 */
export function checkPublicApiRateLimit(
  req: Request,
  scope: string,
  limit = 60,
  windowMs = 60_000,
): { ok: boolean; retryAfter: number } {
  const identity = getPublicApiClientIdentity(req);
  const result = rateLimit({
    key: `public-api:${scope}:${identity}`,
    limit,
    windowMs,
  });

  return {
    ok: result.ok,
    retryAfter: retryAfterSeconds(result.resetAt),
  };
}
