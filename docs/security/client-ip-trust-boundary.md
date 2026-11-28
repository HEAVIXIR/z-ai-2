# Client IP trust boundary (Cloudflare → Caddy → HEAVIX)

## Status

The repository configuration establishes the proxy behavior below, but it does **not** prove that the live origin is reachable only through Cloudflare. Treat Cloudflare-origin isolation as an unverified deployment prerequisite.

## What the checked-in configuration proves

- `docker-compose.prod.yml` publishes Caddy on host ports 80 and 443.
- The app exposes port 3000 only on the Compose network; PostgreSQL ports are not published.
- The production `Caddyfile` overwrites `X-Forwarded-For` and `X-Real-IP` with Caddy's observed `{remote_host}`.
- The request-context helper prefers `CF-Connecting-IP` before those fallback headers.

This means the application port cannot be reached directly through a host-published port under this Compose file. It does **not** mean that ports 80/443 are restricted to Cloudflare edge addresses.

## Security consequence

If an attacker can connect directly to the origin's public 80/443 listener, they may supply a forged `CF-Connecting-IP` header. Because the application prefers that header, IP-based rate-limit buckets could be spoofed on that direct path. Rewriting XFF and X-Real-IP in Caddy does not authenticate CF-Connecting-IP.

Do not treat a Cloudflare DNS record being proxied as sufficient origin protection by itself: direct origin access must also be prevented at the network/origin layer.

## Required deployment verification (read-only until separately approved)

Before relying on `CF-Connecting-IP` for security controls, an operator must verify all of the following:

1. The production hostname's authoritative Cloudflare DNS record is proxied (orange-cloud).
2. The origin firewall/security group allows inbound 80/443 only from the published Cloudflare IP ranges, with a documented process to keep the allowlist current; alternatively, use a properly configured Cloudflare Tunnel or another authenticated origin path.
3. No alternate public listener, load balancer, IPv6 address, or provider firewall rule bypasses that restriction.
4. A controlled external test confirms direct-origin requests are blocked, while requests through Cloudflare reach the application.
5. The deployed Caddy configuration and host firewall match the reviewed repository configuration.

Do not infer any of these live-state facts from this repository alone. Do not make firewall, DNS, Tunnel, Access, certificate, or production changes as part of this code change.

## Current audit evidence

- The connected Cloudflare account API returned one accessible account and zero zones. Therefore DNS proxy state and zone-level origin settings could not be verified through that connection.
- Repository search found no checked-in `cloudflared`, UFW/firewall, origin allowlist, or Authenticated Origin Pull configuration.
- No production host or provider firewall inspection was performed.

## Safe fallback behavior

When `CF-Connecting-IP` is absent, production Caddy overwrites XFF and X-Real-IP with its immediate peer address. This is a conservative fallback for identifying the Cloudflare edge peer, not proof that direct-origin access is blocked. Preserve this distinction in comments, tests, and operational documentation.
