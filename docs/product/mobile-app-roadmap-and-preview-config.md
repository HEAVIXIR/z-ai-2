# HEAVIX Project — Mobile Applications Roadmap and Preview Configuration Observation

**Status:** Product direction recorded; Preview configuration observation is operator-reported and not independently verified.
**Scope:** Product roadmap and operational handoff. This document does not authorize production changes, deployments, database access, migrations, or secret rotation.

## 1. Product direction: Android and iOS applications

HEAVIX must be planned as a multi-platform industrial marketplace and professional network, not as a website-only product.

### User requirement
Alongside the responsive web experience on desktop and mobile browsers, the product roadmap must include dedicated mobile applications for:
- Android
- iOS

The intended interaction model is familiar to users of Iranian marketplace applications such as Divar and Sheypoor: fast browsing, category navigation, search and filters, listing details, seller contact, saved items, and user account flows. HEAVIX must retain its industrial-marketplace differentiation, professional workflows, verification, and trust model rather than copying another service's branding or proprietary interface.

### Delivery sequence
1. **Responsive web foundation:** deliver and validate desktop and mobile-browser experiences first, with Persian-first RTL behavior and accessible layouts.
2. **Mobile-ready product/API contracts:** keep authentication, listing, search, taxonomy, media, messaging/contact, saved searches, notifications, and account capabilities usable through stable, versioned interfaces.
3. **Shared design system:** define reusable tokens, components, navigation patterns, empty/error/loading states, and RTL conventions that can be implemented consistently on web and mobile.
4. **Android and iOS implementation:** evaluate a shared cross-platform implementation versus native apps based on team capacity, performance, device capabilities, maintenance cost, and store requirements. Do not commit to a framework before a technical spike.
5. **Pilot and release:** internal testing, closed beta, crash/analytics monitoring with privacy safeguards, accessibility and localization review, then staged public releases.
6. **Parity and platform-specific improvements:** maintain a capability matrix so core marketplace flows stay consistent while allowing platform-specific features where justified.

### Mobile MVP capabilities
- Sign-in, registration, account recovery, and secure session handling
- Industrial category browsing and taxonomy navigation
- Search, filters, sorting, and saved searches
- Listing creation, editing, image/media upload, and listing status
- Listing detail pages, seller/company profiles, and safe contact actions
- Favorites and recently viewed items
- Push notifications for relevant listing, inquiry, and account events
- Report/block flows and moderation feedback
- Persian RTL, appropriate typography, accessibility, and robust low-bandwidth behavior

### Later mobile capabilities
- Buyer RFQ and seller response workflows
- Dealer inventory and branch management
- Agent workspace and lead management
- Machine Passport, verification, service/history records
- Auction participation and integrity signals
- Market Pulse, alerts, expert answers, loyalty credits, and reputation
- Secure document/media capture and carefully permissioned device integrations

### Product and engineering guardrails
- Keep the zero-infrastructure-budget constraint; prefer existing infrastructure and free tiers, and present any unavoidable store, signing, or service costs before commitment.
- Do not duplicate business logic in mobile clients. Enforce authorization, entitlements, moderation, and audit rules server-side.
- Do not put database credentials or privileged secrets in mobile binaries.
- Use least-privilege, short-lived sessions/tokens, secure local storage, and explicit permission prompts.
- Design for unreliable networks, retries, idempotency, upload resumption, and clear offline/error states.
- Do not delay the first usable responsive Preview in order to build native applications; prepare mobile architecture in parallel and start app implementation after the web/API contracts stabilize.
- No app-store submission, paid service, signing purchase, or public mobile release without explicit budget and release review.

## 2. Operator-reported Cloudflare Preview configuration observation

During a dashboard inspection, the project owner reported seeing the following under:

**Cloudflare → Workers & Pages → heavix-preview → Settings → Runtime Variables and Secrets**

- Secret named `DATABASE_URL`; its value is encrypted/masked in the dashboard.
- Variable named `ENV`; the owner described its value as `preview`.
- Variable named `NODE_ENV`; the owner described its value as `production`.
- Secret named `STORE_DATABASE_URL`; its value is encrypted/masked in the dashboard.
- The separate **Bindings** area below this section appeared empty.

This is an observation reported by the operator, not an independently verified API snapshot. Secret values were not viewed, read, copied, logged, compared, or disclosed.

### Interpretation and verification requirements
- The presence of the two secret names is useful evidence that the intended configuration entries exist, but it does **not** establish which database each encrypted value targets.
- An empty separate Bindings area does not by itself establish that environment variables/secrets are missing; Cloudflare presents runtime variables/secrets separately from other binding categories in the dashboard.
- The reported `ENV=preview` and `NODE_ENV=production` values must be checked against the repository's actual runtime expectations before changing anything. Do not assume either is correct or incorrect from the dashboard label alone.
- Verify the active deployed Worker configuration and the repository's Wrangler configuration without exposing secret values.
- Independently prove that `DATABASE_URL` targets only the dedicated App Preview database and `STORE_DATABASE_URL` targets only the dedicated Store Preview database. Use safe identity checks and expected database identifiers; never print or transmit connection strings.
- Keep all database tests read-only and fail closed. No migrations, seeds, writes, or Production connections during this verification.
- Do not deploy, alter bindings, rotate secrets, or change Production until the exact target mapping and required identity guards have been independently verified and reviewed.

## 3. Current release boundary

This document records product direction and an operator observation. It does not mean native mobile apps have been implemented, nor that Preview database destinations have been verified. The immediate release objective remains a secure, working responsive web Preview; Android and iOS are a committed roadmap workstream to follow without compromising that delivery.
