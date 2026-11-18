# HEAVIX Admin Control Plane, AI Catalog Operations & Listing Lifecycle
**Status:** Implementation contract / staged delivery plan  
**Date:** 2026-11-19  
**Branch:** `integration/preview-readiness-workerd-2026-11-15`  
**Baseline:** `592d64ca75a0dedd9719842169c30649e8e1b3c6`

## 1. Product-level mandate

HEAVIX is an industrial marketplace and catalog, not a generic classified-ad template. The seller's listing journey is the current P0 product outcome. Every stage from intent selection to publication and post-publication management must work end-to-end. Every business-managed capability must have an authenticated, permissioned, auditable Admin Control Plane surface. The control plane must itself be configurable.

This contract is additive to the existing taxonomy canonicalization audit. It does not authorize a destructive schema rewrite, data migration, seed execution, Preview write, or Production action.

## 2. What the source audit already confirms

On the Integration branch:
- `src/app/admin/categories/page.tsx` loads the full category tree and application-industry links and exposes a batch image-generation action.
- `src/lib/ai-agents/index.ts` registers `brand-researcher`, `category-image-gen`, `listing-enricher`, `stale-listing-detector`, and `moderation-agent`. The code comments specify AI suggestions remain unverified until an admin approves them.
- `prisma/run-ai-agents.ts` documents the brand researcher as surfacing image-search logo candidates and AI descriptions, and category-image-gen as generating images for categories with no image.
- `src/app/admin/brands/page.tsx` currently renders brand cards and a create link; this page alone is not a complete brand-edit/research/approval experience.
- `src/app/admin/settings/page.tsx` displays several system identity/environment facts as fixed informational text and embeds a site settings form. It is not yet a full design-system or admin-shell editor.
- `src/app/api/listings/route.ts` creates a Listing with PENDING status, transaction-specific data for some flows, structured attributes, media relations, and optional Auction/RFQ records. It does not prove that every transaction family has a complete end-to-end lifecycle.
- The AI agent registry uses best-effort bookkeeping in some paths; execution state, retryability, idempotency, per-task budgets, and human approval must be validated before presenting these agents as production-ready.

These are source-code observations, not live Preview/Production health claims. Legacy parity documents also identify AI and admin capabilities that need parity review; they are not proof that a particular old feature currently works.

## 3. Reference frameworks — use as crosswalks, not as a blind copy

| HEAVIX domain | Reference baseline | How to use it |
|---|---|---|
| Heavy/construction/mining machinery | Caterpillar and Komatsu public product families | Use real manufacturer product families and terminology as the first catalog backbone; separate machine identity from industry/application; add other OEMs and neutral types so HEAVIX is not OEM-specific. |
| General products, components, attachments, procurement goods/services | UNSPSC | Import/version a crosswalk for procurement/search interoperability. It is a product/service classification, not the entire HEAVIX user navigation tree. |
| Industrial activities, services, mining support, repair/installation | ISIC Rev.4 (and future maintained revision where appropriate) | Use activity codes as external identifiers/crosswalks for service-provider capabilities and industrial activity. Keep user-facing service taxonomy task-oriented. |
| Jobs and occupations | ILO ISCO-08 | Map job roles/occupations and skill families; do not force job vacancies into machine/product categories. |
| Mineral resources and extractive projects | UNECE UNFC (with CRIRSCO-aligned bridges where appropriate) | Use for resource/project maturity, technical feasibility, socio-economic viability and confidence reporting. It is not a commodity product taxonomy. |
| Minerals and commercial material products | UNSPSC/CPC plus curated commodity vocabulary and units | Separate commodity identity, grade/specification, form, origin, quantity/unit, assay and project resource estimates. |

Manufacturer evidence: Caterpillar's public product portfolio lists articulated trucks, backhoe loaders, dozers, excavators, generators, graders, skid steers and wheel loaders; Cat's product-by-industry material explicitly maps products to multiple industries. Komatsu separately lists excavators, dozers, wheel loaders, graders, haulage, drilling, crushing, underground mining, forestry and forklifts. This supports canonical machine type + many-to-many applications, not duplicate machine records per industry.

Reference URLs:
- Cat products: https://www.caterpillar.com/en/brands/cat/products.html
- Cat equipment families: https://h-cpc.cat.com/cmms/v2?cid=406&f=class&gid=406&it=group&lid=en&nc=1&sc=US
- Komatsu equipment: https://www.komatsu.com/en-us/products/equipment
- UNDP UNSPSC: https://www.undp.org/unspsc
- UNSD ISIC Rev.4 class 3312 repair of machinery: https://unstats.un.org/unsd/classifications/Econ/Structure/Detail/EN/27/3312
- UNSD ISIC mining section: https://unstats.un.org/unsd/classifications/Econ/Detail/EN/27/B
- ILO ISCO-08: https://ilostat.ilo.org/methods/concepts-and-definitions/classification-occupation/
- UNECE UNFC and minerals: https://unece.org/sustainable-energy/sustainable-resource-management/unfc-and-minerals

## 4. Full-editability policy: the Admin Control Plane

### 4.1 Required management surface

Every item below must be manageable without a code deployment for normal business configuration changes:

**Catalog and taxonomy**
- Add/edit/archive/restore categories, subject types, aliases, bilingual labels, descriptions, icons, images, ordering, visibility, SEO metadata and industry/application mappings.
- Manage canonical types, variants, attributes, units, controlled options, dependencies, validation, required/optional rules, and profile versions.
- Manage brands, logos, official-source references, aliases, countries, model families, models, generations, compatibility and review status.
- Manage parts families, fitment rules, attachments and compatibility links.
- Manage service activities, eligible subjects, capabilities, coverage regions and required credentials.
- Manage mineral commodities, grade/specification templates, units and project/resource reporting fields.

**Listing and commerce**
- Configure which intents are available for each subject family.
- Configure step order, labels, help text, field visibility, requiredness, defaults, validation, conditional branches and save/resume rules.
- Configure moderation rules, publication prerequisites, expiry, renewal, edit/re-review policy, featured rules, contact visibility and transaction-specific fields.
- Configure rental offer/request, sale, wanted/purchase request, service offer/request, RFQ, auction and tender workflows independently.
- Manage notification templates, lead routing, SLA timers and escalation rules.

**Media and content**
- Manage site logos, brand assets, category images, banners, icon sets, image crop/focal point, alt text, gallery order and responsive variants.
- Manage page sections, navigation, homepage blocks, footer, legal/help content, empty states, form copy, emails and notification templates.
- Manage SEO titles, descriptions, canonical rules, indexability and structured-data templates through safe field-based editors.

**Visual design and Admin shell**
- Edit design tokens: font families from an approved/self-hosted font library, font scale, weights, spacing, radius, borders, shadows, color palettes, contrast modes, light/dark themes, component density and motion preferences.
- Preview across breakpoints and RTL/LTR before publishing.
- Admin users can reorder/pin/hide permitted navigation items, configure dashboard widgets, table columns, saved filters, density and default landing page.
- Platform identity settings include HEAVIX logo variants, favicon, wordmark, app icon, login branding and admin shell theme.
- Support global defaults and role/user-level preferences with inheritance and reset-to-default.

**AI and automation**
- Configure agent active state, schedule, batch limits, task policy, prompt/template version, allowed sources, confidence thresholds, approval requirement, retry policy, budget ceilings and alert recipients.
- Inspect inputs/outputs, citations/source provenance, confidence, cost, latency, failures and audit trail.
- Pause/resume agents and roll back an approved result.
- No hidden/unbounded AI run; all tasks pass through policy, budget, validation, audit and rate-limit controls.

**Operations**
- Configure workflows and business rules through typed, validated blocks rather than arbitrary code.
- Manage roles, permissions, approval queues, audit retention, notification channels, import/export profiles, integration endpoints and operational dashboards.
- Security-critical policies (authentication, session protections, CSRF, secrets, encryption, immutable audit, backup gates, Production release gates) are not made freely weakenable through the CMS. They are visible, explainable and changeable only through restricted, validated governance flows.

### 4.2 Editability contract for each admin-managed resource

Every resource editor should support:
- list/search/filter/sort and saved views;
- create, edit, duplicate, archive/restore (hard delete only where safe and legally permitted);
- draft → preview → validate → publish;
- field-level validation and dependency previews;
- version history with before/after diff, author, timestamp and reason;
- rollback to a prior published version;
- RBAC checks on both UI and API;
- audit events and bulk-action dry-run/partial-failure report;
- import/export with schema version and validation;
- impact preview showing affected listings, URLs, forms and downstream consumers.

Do not expose raw JSON/SQL/code editors as the default management interface. Advanced JSON editing may exist for restricted operators with schema validation and preview.

## 5. AI catalog assistants

### 5.1 Brand logo researcher

Reinstate and harden the old capability:
1. Find brands missing logo or with a low-quality/unverified logo.
2. Search official brand/manufacturer websites first, then trusted sources.
3. Return multiple candidates with source URL, source type, retrieval time, image dimensions, file type and confidence.
4. Check trademark/brand identity match and image safety; never invent a logo with image generation.
5. Stage candidates as `AI_SUGGESTED`; admin previews, chooses, crops and approves.
6. Preserve prior logo and source metadata; rollback is possible.
7. Respect rights/licensing and takedown requests; no automatic public replacement solely from a fuzzy image match.

### 5.2 Category image studio

1. Generate subject-appropriate industrial images from the canonical category brief and profile, not generic stock-like images.
2. HEAVIX mark/watermark is a separate controlled overlay asset, applied deterministically after generation; do not rely on the image model to render exact brand lettering.
3. Produce variants for card, category hero, mobile and social/SEO where needed.
4. Store prompt/model/version, generated asset ID, dimensions, cost/budget, moderation result and reviewer.
5. Admin can regenerate, crop, reposition watermark, replace, approve, schedule and roll back.
6. Daily quotas are configurable and budget-enforced. Default is draft-only; no silent mass publication.

### 5.3 Listing copilot and catalog quality agents

- Extract machine identity, brand/model, year, hours, condition, capacity, specs, location and documents from text/images/PDFs.
- Detect missing fields, duplicate listings, suspicious prices, inconsistent specs, image duplicates, logo misuse and expired documents.
- Generate translations, titles, SEO copy and structured descriptions.
- Suggest price ranges only with comparables, freshness, sample size and uncertainty.
- AI-suggested values always retain provenance and confidence and remain unverified until seller/admin confirms.
- Human approval is required for publication, identity merges, brand logo replacement, financial/legal claims and high-risk moderation outcomes.

### 5.4 AI governance

One typed AI Gateway is the enforcement point for all model calls:
- task policy and actor authorization;
- privacy and prompt-injection checks;
- budget/rate limits and provider/model routing;
- strict output schema validation;
- provenance/citations and confidence;
- audit, cost, latency, token and error logs;
- idempotency, retry and circuit-breaker behavior;
- configurable fallback to non-AI/manual workflow.
Never claim a capability is active merely because an agent registry row exists. Prove route → policy → execution → persisted result → admin review → approval → public output.

## 6. Listing lifecycle: end-to-end acceptance contract (P0)

The target lifecycle is:

`Intent → Subject → Context → Profile → Draft → Media → Validation → Preview → Submit → Moderation → Publish → Manage → Renew/Close/Archive`

### 6.1 Seller journey
1. Select intent (sell, rent out, request purchase, request rental, offer service, request service, quote/RFQ, auction/tender where applicable).
2. Select subject family and canonical subject type; select industry/application when relevant.
3. Resolve configuration, capacity class, compatible brand/model/generation and dynamic technical profile.
4. Show only relevant fields; support units, ranges, dependencies, optional fields and inline help.
5. Save draft automatically; resume across sessions; preserve step progress and uploaded media state.
6. Upload images/documents with staging, ownership checks, progress, retry, ordering, primary selection, alt text and safe removal.
7. AI assists with extraction, translation, duplicate detection and missing data; seller can accept/reject each suggestion.
8. Preview exactly as public listing will appear, including mobile and SEO presentation.
9. Validate transaction-specific prerequisites and explain each blocker.
10. Submit idempotently; create pending record and show confirmation/reference ID.
11. Track moderation state, request corrections, resubmit, appeal or contact support.
12. After publication: edit, re-review when material fields change, pause, renew, mark sold/rented/fulfilled, close, archive and view performance/leads.
13. Seller dashboard shows status, expiry, required actions, views, leads, saved items and response rate.

### 6.2 Transaction-specific persistence
- SALE: sale price/currency/condition/ownership and asset details.
- RENT offer: rate period, availability, deposit, minimum duration, operator/fuel/transport inclusions and location.
- RENT request: required asset, quantity, duration, date window, site/location and terms; do not treat it as a RENT offer.
- WANTED/purchase request: canonical subject, quantity + unit, specifications, budget range/currency, delivery location, needed-by date, expiry and response visibility. Quantity must be structured, not only audit metadata or description.
- SERVICE offer/request: service activity, canonical subject applicability, capability/coverage, credentials, availability, pricing model and deliverables.
- QUOTE/RFQ: buyer requirements, quantity, specifications, deadline, terms, visibility and supplier responses.
- AUCTION: start price, increment, schedule, rules, bidder controls and close/settlement state.
- TENDER/procurement: buyer organization, scope, qualification, deadlines, documents, evaluation and award workflow.
Every intent must route to its canonical persistence model; no one generic Listing endpoint should silently discard fields.

### 6.3 Publication state machine
Draft → Submitted/Pending → In Review → Needs Changes / Rejected / Approved → Published → Paused / Expired / Sold / Rented / Fulfilled / Closed / Archived.
Transitions must be explicit, authorized, idempotent and audited. Define what edits force re-review. Public APIs/search must never leak pending/rejected records. Rejection includes actionable reason and resubmission path.

### 6.4 Required E2E scenarios
- New seller creates and publishes a used excavator for sale, with photos, model/specs and location.
- Same canonical excavator type can be offered for rent without duplicate taxonomy.
- Buyer creates a structured purchase request with quantity/unit and receives supplier responses.
- Buyer creates a rental request; it is not stored as a rental offer.
- Service provider creates an excavator repair offer; buyer creates matching repair request.
- Parts seller creates a part with fitment to compatible machine/model.
- Minerals seller publishes commodity/grade/quantity/unit and source documents.
- Auction and RFQ listings create and expose their linked domain records correctly.
- User can save/resume, retry failed upload, preview, submit twice safely, correct moderation feedback, edit published listing, renew and close it.
- Admin can review, bulk action with partial failures, audit and roll back configuration.
- Mobile 375px, tablet, desktop, Persian RTL and low-bandwidth network acceptance.

## 7. Delivery order — keep listing outcome central

**P0-A — Baseline and repair**
- Verify current Integration CI/OpenNext at exact head.
- Repair exact failing tests, not broad speculative refactors.
- Run route/API contract tests for each transaction intent.

**P0-B — Taxonomy + dynamic profile**
- Complete source/seed/admin/API/DB dependency inventory.
- Produce bilingual canonical subject dictionary and old-ID/slug crosswalk.
- Add typed profile resolver and conditional wizard UI.
- Keep migration additive and Preview-only after read-only export and paired encrypted backup.

**P0-C — Listing lifecycle**
- Finish WANTED structured persistence and rental request separation.
- Validate service, RFQ, auction and listing state machines.
- Implement edit/renew/close and seller status tracking.
- E2E tests for all critical intents.

**P0-D — Admin Control Plane minimum complete**
- Taxonomy/profile/brand/model/attribute editors.
- Listing workflow and moderation configuration.
- Theme/site identity editor and admin-shell personalization.
- Versioning, preview, audit, rollback and RBAC.

**P1 — AI catalog and operations**
- Brand logo researcher, category image studio, listing copilot and quality agents.
- Unified AI Gateway proof and admin review queues.
- Budget, schedule and provider fallback controls.

**P2 — Industrial intelligence**
- Demand/supply gap, comparable price intelligence, document verification, fitment graph, supplier matching and daily AI brief.

## 8. Definition of done

A feature is not complete because a page exists or a model is present. It is complete only when:
- user journey works from UI through API, validation, persistence, event/audit and post-submit management;
- Admin can configure it with permission, preview, version, audit and rollback;
- API authorization and server-side validation match the UI;
- tests cover success, failure, retry, concurrency, idempotency and unauthorized access;
- data is backward-compatible and SEO/history references remain valid;
- accessibility, mobile, RTL and weak-network behavior are verified;
- AI is budgeted, sourced, validated and human-reviewable;
- deployment/Preview evidence is tied to the exact commit.

## 9. Safety and scope

- Integration branch only. PR #340 remains Draft; no Production merge/deploy.
- No destructive category rebuild or blind bulk seed.
- No direct Production DB operations.
- No Preview DB write until read-only export, paired encrypted backup, verification and workflow gates pass.
- No paid service, top-up or unapproved AI spend. Free/current connected capabilities only.
- Security invariants and immutable audit cannot be weakened by theme/CMS customization.
