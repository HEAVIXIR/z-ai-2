# HEAVIX dual scraper modes and ZAI configuration handoff

**Branch:** `integration/preview-readiness-workerd-2026-11-15`
**Policy:** all manual and ZAI scraper/listing/store workflows must remain zero-cost. No paid API/provider, pay-per-token service, or billing-enabled fallback is allowed.

## Dual-mode product contract
- Marketplace listings and Store parts/products must have a deterministic manual-entry/import path independent of ZAI, quota, AI budget, or external provider availability.
- ZAI remains a separate optional discovery/extraction path. Both paths feed the same validated data model and moderation/import lifecycle.
- Manual Marketplace records must require admin permission, same-origin CSRF, bounded JSON, validate active canonical category/transaction/service IDs, generate collision-safe slug, write `PENDING`/unpublished, preserve source/provenance where provided (or mark source as MANUAL), and create audit records. Manual path must not initialize ZAI or call preflightAIRequest/recordAICost/AIGatewayLog.
- Store manual parts/products must also have a UI form and use existing deterministic import path. They must not require source allowlist, ZAI, AI quota, cost accounting, or provider.
- ZAI discovery stays admin-authorized, source-host allowlist protected, bounded and timed, and must be disabled gracefully when configuration is absent. Never publish AI output automatically.
- SCRAPER policy default internal cost ceiling is zero; AI Gateway logs must report cost 0 for scraper calls. Internal quotas may remain as abuse protection, but they are not paid-service billing.
- No database migrations/seeds, Production deployment, DNS, Cloudflare Builds, or paid browser/service calls are permitted during this implementation.

## ZAI configuration issue (verified)
The current Marketplace and Store routes call `ZAI.create()`. SDK configuration reads `.z-ai-config` files only from project cwd, home directory, or `/etc`; it does not consume the commented `ZAI_API_KEY` env setting in the current `.env.example`. The reported configuration error is therefore expected when no valid file is present. SDK expects JSON with `baseUrl` and `apiKey`, with `baseUrl` including `/v1`; `chatId` and `userId` are optional. The template `.z-ai-config.example` contains placeholders only.

**Important runtime decision:** do not bake secrets into tracked files or Worker bundles. SDK documented configuration loader is file-based. A secure runtime-compatible injection/adaptation path for selected OpenNext/Cloudflare Preview must be designed and proven before configuring deployed ZAI. Until then, local development can use a private untracked `.z-ai-config`; deployed ZAI calls should fail closed with a clear configuration diagnostic, while manual paths remain available.

## Message for the ZAI configuration agent

> HEAVIX is implementing a strict dual-mode scraper architecture. Marketplace and Store both need a manual, deterministic, zero-cost route and a separate optional ZAI discovery/extraction route. Never introduce paid providers, billing, paid API fallback, or spend. Please inspect the current SDK version and exact `.z-ai-config` loader behavior, and solve its configuration error in the current OpenNext/Cloudflare Preview runtime without committing credentials or embedding secrets in build artifacts. The documented SDK file schema is `{ baseUrl, apiKey, chatId?, userId? }`, and `baseUrl` must include `/v1`; current SDK `ZAI.create()` searches project/home/`/etc` files only, so env-only `ZAI_API_KEY` is not enough. Propose and test a secure runtime configuration strategy, verify the free ZAI endpoint/key and chat + web_search/page_reader capabilities, and provide a fail-closed diagnostic. Preserve admin auth, CSRF, allowlists, bounded requests, timeouts, moderation, and audit. Manual import must never initialize ZAI or touch AI quota/cost. No Cloudflare Build, Preview deploy, Production, DNS, DB migrations/seeds, or paid tools. Work on Integration only and report exact commits and CI evidence.