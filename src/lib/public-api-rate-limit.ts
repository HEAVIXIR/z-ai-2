import { isIP } from "node:net";
import { rateLimit, retryAfterSeconds } from "@/lib/rate-limit";

/**
 * Public endpoints must not trust the left-most X-Forwarded-For value:
 * clients can often supply it themselves. Cloudflare's connecting-IP
 * header is preferred; X-Real-IP is only a fallback for trusted proxies.
 */
export function getPublicApiClientIdentity(req: Request): string {
  const cloudflareIp = req.headers.get("cf-connecting-ip")?.trim();
  if (cloudflareIp && isIP(cloudflareIp)) return cloudflareIp;

  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp && isIP(realIp)) return realIp;

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
