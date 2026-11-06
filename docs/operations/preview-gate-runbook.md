# Heavix Preview Gate — operator runbook

Status: implementation proposal in Draft PR; **not deployed**. The current public Preview URL remains unchanged until the gate is reviewed, the two Preview secrets are installed, and a separately approved deployment is performed.

## Security model

The dedicated Worker entrypoint wraps OpenNext before any application request is dispatched. Only these exact paths bypass the application gate:

- `GET /__heavix_preview/login`: static, no-store login form.
- `POST /__heavix_preview/login`: same-origin form submission; verifies a shared Preview-only password.
- `GET /__heavix_preview/logout`: logout confirmation for an authenticated session.
- `POST /__heavix_preview/logout`: same-origin logout and cookie clearing.

Every other path and method — including HTML pages, Next.js RSC requests, `/_next` assets, APIs, admin routes, backup routes, and file endpoints — requires a valid signed session before OpenNext is called.

The session cookie is host-only (`__Host-` prefix), Secure, HttpOnly, SameSite=Strict, Path=/, and expires after eight hours. Its HMAC-SHA-256 signature is made with a separate signing secret. Rotating the signing secret invalidates all existing sessions. The password and signing key are never put in source, URL, query strings, or logs. All gated responses are no-store and marked noindex.

The gate fails closed with HTTP 503 if `HEAVIX_ENV` is not exactly `preview`, either secret is missing, or either secret is shorter than 32 UTF-8 bytes. It does not fall through to OpenNext on configuration errors. The login form requires an exact same-origin `Origin` header and rejects cross-site Fetch Metadata. Form bodies are bounded to 4 KiB. There is no durable/global rate limiter in this implementation; do not treat the in-isolate process as brute-force protection. Use a high-entropy password and rotate it if exposure is suspected.

## Preview-only secrets

These values must be installed on the **Worker Preview base configuration**, not the Production Worker and not GitHub:

- `HEAVIX_PREVIEW_GATE_PASSWORD`: independently generated random password, at least 32 bytes.
- `HEAVIX_PREVIEW_GATE_SIGNING_KEY`: a different independently generated random key, at least 32 bytes.

Use Wrangler 4.135.0 or later and the repository's pinned Wrangler version. From a trusted local checkout, set each secret interactively so the value is not written into shell history:

```sh
bunx wrangler preview base-config secret put HEAVIX_PREVIEW_GATE_PASSWORD --worker-name heavix-preview
bunx wrangler preview base-config secret put HEAVIX_PREVIEW_GATE_SIGNING_KEY --worker-name heavix-preview
```

When prompted, paste the generated value into the hidden prompt. Do not pass a secret as a command-line argument, commit it, add it as a plain `vars` value, or send it in chat. Generate two separate values locally (for example with a cryptographically secure password manager or `openssl rand -base64 48`). Record them in an approved password manager. Do not reuse the backup identity, database passwords, GitHub tokens, or Production credentials.

The Preview base-config secret command updates the base configuration for new Previews; it does not change Production secrets. For an already-created Preview, use the per-Preview `wrangler preview secret put` command with its exact Preview name if needed. Verify only secret names with `wrangler preview secret list`; never print values.

## Deployment gates — all required

1. Independent review of the exact commit and all CI checks pass.
2. Confirm the Preview's actual host and exact Preview name; do not assume the Worker production URL and Preview URL are interchangeable.
3. Install both secrets in the Preview base config and verify their names only.
4. Confirm the Preview runtime has `HEAVIX_ENV=preview` and that the Preview's App/Store database bindings remain separately proven. The gate does not prove or change database destinations.
5. Build and test the exact commit; then obtain a separate explicit deployment authorization.
6. Deploy only to the intended Preview. Do not use `wrangler deploy`, do not touch Production, and do not enable Version URLs as a substitute.
7. Verify without credentials that unauthenticated page/API/asset requests are denied, the login form is served, valid login reaches the Preview, logout clears the cookie, and the Production Worker is unchanged.
8. Keep the Preview URL setting as the user requested (available); do not enable Cloudflare Access or any paid billing product as part of this runbook.

## Operator use

Open the Preview URL. Enter the shared Preview password on the Heavix Preview Gate page. The browser stores a host-only, HttpOnly session cookie for up to eight hours. To log out, visit `/__heavix_preview/logout` and submit the logout form. Close the browser session when finished. A signing-key rotation logs out all sessions.

## Known limits

- This is a shared-password gate, not per-person identity, audit attribution, MFA, or Cloudflare Access.
- It does not implement a distributed rate limiter. The password must be high entropy and should be shared only through an approved password manager.
- Existing Preview deployments are not protected until the gated Worker code and both Preview-only secrets are deployed together. Keep the currently running Preview as-is until the cutover can be completed atomically.
- Historical Worker Version URLs and other Preview instances are separate exposure surfaces; this gate only protects deployments that actually run this entrypoint. Inventory and protect those separately before enabling any such URLs.
- No Production traffic, database, DNS, or billing settings are changed by this implementation.

## Rollback

Do not roll back to an unguarded code version while leaving its Preview URL public. If the gated Preview is unhealthy, disable that Preview URL first or restore a known gated build. Keep the current public Preview untouched until a protected deployment is ready.
