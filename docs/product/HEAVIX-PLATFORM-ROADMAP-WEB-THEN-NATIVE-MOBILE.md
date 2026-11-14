# HEAVIX Platform Roadmap — Responsive Web First, Native Mobile Second
Date: 2026-11-11
Owner decision: confirmed in project conversation on 2026-11-11.

## Product delivery sequence

### Phase W — Complete and accept the responsive web product (current scope)
The current HEAVIX web product must work as one coherent responsive experience across:
- Desktop / PC and laptop
- Tablet
- Mobile browsers and mobile-sized devices

Mobile web is part of the web release, not a separate native application. The same product, routes, content, account model, permissions and business workflows must adapt to viewport and input differences without losing functionality.

Acceptance covers real responsive behavior, not merely CSS breakpoints:
- Navigation, menus, search, taxonomy filters and result cards at mobile/tablet/desktop widths
- Listing creation, image selection/upload, forms, validation, keyboard and touch interactions
- Listing details, image gallery, seller/company profiles, stores, services, wanted requests and auctions
- Admin workflows and data tables with usable small-screen behavior where admin access is supported
- Typography, RTL/Persian layout, overflow, spacing, sticky elements, dialogs, safe-area insets and orientation
- Performance, accessibility, reduced motion, focus order, error/loading/empty states
- No horizontal overflow or clipped critical actions; no mobile-only mock content or hidden essential workflows

The web phase is not accepted until key user journeys have been exercised at representative desktop, tablet and mobile viewport sizes and documented with screenshots/test evidence.

### Phase N — Native iOS and Android applications (future scope, after web acceptance)
After Phase W is complete and accepted, begin separate native/mobile-app planning and delivery for:
- iOS application
- Android application

This is a future phase. Do not add native-app implementation, native build pipelines, store submissions or app-specific scope to the current web release unless the owner explicitly changes the sequence.

## Prepare the web architecture for future native clients — without building them now

During current web work, review and preserve clean client-independent contracts:
- API-first business operations; avoid putting business rules exclusively inside React components or browser-only code.
- Stable, documented request/response schemas, validation and versioning strategy.
- Authentication/session design that can support secure mobile clients later; do not weaken current web security or assume browser cookies are the only possible client credential.
- Explicit authorization, tenant/ownership scoping and server-side enforcement for every operation.
- Durable media upload/read/delete contracts using the owner's chosen Backblaze B2 storage; no dependency on local ephemeral filesystem for persistent media.
- Predictable pagination, filtering, sorting, error envelopes, idempotency where appropriate and safe retry semantics.
- Push notifications, deep links, offline support and device capabilities are future native product decisions; do not invent or prematurely implement them in the web phase.
- Shared design tokens, typography, iconography, component behavior and brand rules should be documented so native apps can faithfully express HEAVIX without forcing a shared UI framework.
- Keep platform-specific presentation separate from reusable domain logic and APIs.

## Governance and release gates

1. Current priority remains full web parity and Preview acceptance.
2. Responsive web acceptance must explicitly include desktop, tablet and mobile.
3. Native iOS/Android planning starts only after the owner accepts the web release.
4. No native-app release dates, technology choices, app-store promises or feature scope are assumed by this document.
5. Preserve HEAVIX brand and project standards; competitor references are quality benchmarks, not templates.
6. The legacy Z vs current z-ai-2 vs global industrial-marketplace parity loop remains in force across all web areas.
