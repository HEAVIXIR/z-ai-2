# HEAVIX — Global Industrial Marketplace Benchmark & Repeated Parity Audit
Date: 2026-11-11
Branch: recovery/heavix-full-product-integration-2026-11-11
Baseline commit: abd88eced783ae528c364da0f215832073601227
Status: benchmark baseline established; product-wide source/runtime parity remains IN PROGRESS.

## 1. Purpose and decision rule

This audit compares three layers for every capability:
1. Legacy Z: what already existed and must not be lost.
2. Current z-ai-2: what is implemented now, including newer architecture, security and operational fixes.
3. Global industrial-marketplace benchmark: what a leading specialist marketplace offers or makes discoverable.

The target is HEAVIX's own product identity and principles. Competitor patterns are quality references, not instructions to copy their visual identity, business model, fees or workflows.

Never mark a feature complete because a route, component, schema or test file exists. Completion requires a traced UI → API → authorization/policy → validation/service → persistence → admin controls → public rendering → tests → Preview runtime path.

## 2. External benchmark set and observed evidence

Research snapshots captured 2026-11-11:

- Machinio: global specialist inventory taxonomy and category/subcategory discovery; search by manufacturer/model/keyword plus location; visible inventory breadth and upcoming auctions. Categories span agriculture, construction, machine tools, material handling, printing, processing, lab/medical and transport. Sources: https://www.machinio.com/ and https://www.machinio.com/categories
- Machinio dealer/service evolution: dealer names linked directly from listings to dedicated profiles containing company information, contacts, marketplace history, reviews, services and active inventory; searchable dealer directory by name, industry and geography; lifecycle service directory organized around Verify, Move and Run; listing quality score based on completeness. Source: https://www.machinio.es/blog/machinio-adds-new-marketplace-features
- Machinio listing guidance: manufacturer, model, condition, location, price, category/subcategory and detailed technical description improve discoverability and buyer confidence. Source: https://www.machinio.mx/blog/optimizing-your-listings-the-basics
- Mascus: specialist used machinery/trucks marketplace with dealer/OEM audience, international reach and large inventory. Source: https://www.mascus.co.uk/about-mascus
- MachineryTrader: connects equipment sellers to buyers and positions adjacent business lifecycle tools including valuations, auctions, wholesale, shipping, financing and ROI. Source: https://info.machinerytrader.com/
- Kitmondo: seller onboarding, category precision, detailed specs/condition/maintenance/hours/accessories/terms, price transparency, buyer qualification and dedicated human seller support. Source: https://www.kitmondo.com/sell-used-equipment/
- Surplex: industrial auctions supported by human project management, inspection, catalogue photography/video, customer service, invoicing, dismantling, transport and customs. Source: https://www.surplex.com/en/spectrum-of-services
- MachineTools.com: searchable machinery/model research database, direct seller contact and a Wanted mechanism when a buyer cannot find a machine. Source: https://www.machinetools.com/en/help
- Machineseeker: high-volume specialist marketplace; free inquiry/direct phone contact and Google-like search. Source: https://www.machineseeker.com/help/

Interpretation: category depth, precise structured specs, seller/dealer identity, inventory aggregation, buyer requests, seller responsiveness, listing completeness, trust/inspection, auction and logistics lifecycle support are recurring quality signals. Not every capability must be monetized or copied into HEAVIX; map to the existing HEAVIX product plan.

## 3. HEAVIX-specific non-negotiables

- Preserve the HEAVIX brand, design language, section order/identity and project-specific business logic.
- Preserve the canonical 17 homepage sections and current data-backed implementation; do not replace with static cards or generic templates.
- Preserve PageRenderer/PageBuilder for custom pages and preview flows.
- Preserve Zero Trust, least privilege, RBAC, audit trails, ownership/tenant checks and safe public read-only behavior.
- No fabricated statistics, listings, reviews, verification badges or seller credentials.
- Backblaze B2 is the owner-confirmed media storage choice. Do not propose Cloudflare R2 or require R2. Cloudflare is used for Worker/Preview runtime.
- Do not deploy or write to Preview/Production DB until Preview App and Store DB identities and production isolation are proven.
- Avoid unnecessary Cloudflare builds/deploys due the reported quota constraint.

## 4. Repeated legacy ↔ current ↔ benchmark audit matrix

Status vocabulary: PRESENT = source exists; DIFFERENCE = legacy/current source differs and requires review; BLOCKED = confirmed defect or release gate; NOT VERIFIED = runtime/end-to-end evidence missing. Status is deliberately conservative.

| Product area | Legacy parity check | Current z-ai-2 evidence | Global benchmark lens | Current status / next verification |
|---|---|---|---|---|
| Homepage composition | Legacy 17-key section registry; 26 matching components, 18 identical and 8 differing | Recovery branch restores 17 canonical sections with current components and editable HomePageSection config | Clear search entry, category paths, inventory discovery, trust, requests, services, editorial content | SOURCE RESTORATION DONE; compare each of 8 changed components and visually verify Preview |
| Header/footer/navigation | Compare old header/footer controls and destinations | Existing components and admin editing routes; Services directory shares active category navigation and configured footer | Fast access to search, categories, dealers, services, account/help, locale | NOT VERIFIED end-to-end; map every link and mobile behavior |
| Search and taxonomy | Compare legacy search/filter controls, category hierarchy, brand/model dependencies and attributes | Taxonomy APIs/admin exist; listing wizard uses taxonomy and brand lookup | Manufacturer/model/keyword + geography; deep categories and meaningful technical facets | NOT VERIFIED; build query-to-result contract matrix and test all dependencies |
| Listing creation | Compare legacy wizard fields, validation, image UX, brand/model rules | Recovery branch added ListingImageUploader; API caps/validation and wizard need full contract audit | Detailed specs, condition, hours, maintenance, location, price, accessories, documents, transparent terms | BLOCKED: uploader targets admin-only upload endpoint; fix seller-safe authorization and B2 persistence; reconcile 30 vs 10 cap and brand policy |
| Listing detail | Compare legacy gallery/spec/contact/related listing behavior | Public listing route/API present | Complete machine identity, specs, condition, seller/dealer profile, trust and clear inquiry/contact | NOT VERIFIED; inspect desktop/mobile, schema coverage, structured data and inquiry flow |
| Search results & filters | Compare old result cards, sort, pagination, filters | Listings/search source exists; runtime not reverified | Search by make/model/location/category/year/price/condition and category-specific specs | NOT VERIFIED; relevance, zero-results, URL state, pagination and saved search tests |
| Featured / selected / exclusive ads | Compare old Featured, Exclusive Sale, verified/selected ads, admin curation | Homepage canonical sections and admin capabilities exist | Sponsored/featured transparency, auction/ending state, inventory relevance | NOT VERIFIED; verify editorial curation, entitlement, ranking and expiry behavior |
| Companies / dealer directory | Compare legacy company pages, company detail, seller identity | Company directory/detail and admin company controls exist | Searchable dealer directory; company identity, contact, history, reviews, active inventory and services | NOT VERIFIED; trace profile completeness, verification evidence and listings relationship |
| Store / storefront | Compare legacy shop, product, cart, checkout and seller inventory | Separate Store schema, storefront and Store Admin control plane exist | Dealer inventory, parts, availability, order tracking, payment, shipment, returns | NOT VERIFIED; test App DB vs Store DB boundaries, seller ownership, stock concurrency and order privacy |
| Services | Compare legacy service cards/provider flows | Public /services, active Service rows, SERVICE_REQUEST links and Store service workflows exist | Verify / Move / Run lifecycle: inspection, valuation, finance, freight, customs, installation, repair, parts | PARTIAL SOURCE; validate provider profiles, discovery, quote lifecycle and admin assignment |
| Wanted / buyer requests | Compare legacy active requests and matching | Wanted and matching service/API modules exist | Buyer request when inventory is unavailable; seller matching and response | NOT VERIFIED; test request creation, matching, notification, close/reopen, abuse controls |
| Auctions | Compare legacy auction screens and state transitions | Auctions routes/APIs exist | Timed auctions, bid integrity, event schedules, inspection, invoices and collection | NOT VERIFIED; inspect transactional state machine, anti-sniping, audit and buyer journey |
| Sell in 7 Days | Compare legacy landing, registration, tracking, admin operations | Landing/register/track routes and APIs exist | Assisted sale, inspection, catalogue/media, seller support, settlement and logistics | NOT VERIFIED; map operational SLA, consent, pricing/fees and end-to-end state |
| Knowledge / content | Compare legacy knowledge hub and animations | Knowledge index/detail/admin sources exist | Technical guides, category education, model research and SEO discovery | NOT VERIFIED; editorial workflow, related products, taxonomy and metadata |
| Trust & verification | Compare legacy verified-machine/seller signals | Security/RBAC and seller/company foundations exist | Evidence-backed seller identity, inspection reports, listing completeness, reviews | NOT VERIFIED; never display a badge without verifiable state and audit provenance |
| Admin / CMS | Compare all legacy admin routes and controls | Admin pages, homepage editor, Store control plane, RBAC catalog exist | Fine-grained operations, moderation, curation, seller support, analytics, content control | NOT VERIFIED; exhaustive route/action/permission/tenant matrix and owner usability review |
| Media | Compare legacy uploader/gallery/file handling | Current media-service.ts uses local filesystem; /api/admin/upload requires admin; owner-confirmed B2 configuration not yet reconciled in source | Durable media, multi-image/video/docs, transformations, secure access, CDN delivery | BLOCKED: locate actual B2 media bucket/endpoint/config and implement adapter; do not use local disk as final object store |
| SEO / internationalization | Compare legacy metadata, language/locale, routes | Some metadata/noindex work done; sitemap/robots/locale coverage not fully checked | Crawlable category/model/dealer/listing pages, canonical URLs, structured data, localized search | NOT VERIFIED; crawler and generated HTML audit |
| AI / recommendations | Compare legacy recommendations and knowledge graph | Matching and AI-related modules exist | Useful matching, explainable ranking, spec extraction, no hallucinated inventory | NOT VERIFIED; quality, provenance, human controls and privacy |
| Analytics / seller tools | Compare legacy stats/admin metrics | KPI contracts and analytics routes/docs exist | Listing quality, inquiry response, inventory performance, dealer insights | NOT VERIFIED; validate event definitions, data freshness, access and privacy |
| Performance / accessibility | Compare legacy interactions, responsive behavior and animation | CSS/homepage frame/editor changes exist; no full visual audit | Mobile-first discovery, fast search, accessible forms, reduced motion, stable media loading | NOT VERIFIED; Lighthouse-like checks, keyboard, screen reader, responsive and real-device review |
| Security / reliability | Compare legacy contracts only where safe; never restore unsafe behavior | RBAC, audit, order privacy, read-only public APIs, CI proofs | Safe B2B contact, payments, inventory and account boundaries | CI green on current checkpoint; runtime Preview DB identity and end-to-end security remain BLOCKED |

## 5. Immediate confirmed findings

1. CI run #42977975042 on commit abd88eced783ae528c364da0f215832073601227 is SUCCESS. Jobs verified: verify, phase-tests, tls-proof, audit-transaction, Cloudflare compatibility report-only, docker-build-proof. Legacy archive inventory was skipped.
2. PR #307 remains open and Draft; no deployment/merge was performed.
3. The inspected src/lib/media-service.ts persists to public/uploads using node:fs, not B2.
4. src/app/api/admin/upload/route.ts calls requireAdmin("media.upload"). The listing uploader uses this admin endpoint, so seller upload is not established and is expected to fail for non-admin sellers.
5. Owner confirms B2 is the selected operational media store. Repository code/config audit has not yet identified the media bucket/endpoint integration. The B2 DB-backup workflow is not proof of B2 media storage.
6. Existing Preview App/Store DB identities and Production isolation are not proven. Do not deploy.
7. Earlier live Preview checks showed old/incomplete code and multiple 500/503/404 routes. Recheck only after DB safety gates.

## 6. Execution protocol — repeat until no material gaps remain

For each product area, repeat this exact loop:
A. Enumerate every legacy route, component, asset, API, schema relation and admin control.
B. Enumerate current equivalents on the active recovery branch.
C. Compare behavior and data contracts; classify each item as identical, safely evolved, missing, regressed, unsafe legacy behavior, or runtime-unverified.
D. Compare against the relevant benchmark capabilities in §2; distinguish essential, useful, and out-of-scope.
E. Implement only the smallest architecture-compatible change; do not duplicate existing models or create mock screens.
F. Add contract/unit/integration/security tests for the actual journey.
G. Run the lowest-cost relevant tests first; run full CI only when a coherent batch is ready.
H. Inspect CI on the exact resulting commit; record job-level evidence.
I. Validate the exact Preview runtime only after DB identity/provenance gates; capture screenshots, HTTP responses and test records.
J. Update the parity matrix and checkpoint; repeat the scan to catch omissions and regressions.

A section is closed only when legacy parity, benchmark requirements, HEAVIX-specific design, admin editability, authorization, persistence, SEO/accessibility/performance where relevant, tests and Preview evidence are all accepted. A CI green alone does not close a section.

## 7. Next execution priority

P0 — Media and seller listing flow:
- Inspect the listing uploader endpoint contract and seller permission model.
- Find the real existing B2 media integration/configuration across all accessible repositories, branches, workflows and connected infrastructure. Do not expose secrets.
- Identify bucket, endpoint/region, credentials names, URL visibility model, upload/delete/list behavior, CORS and Preview-vs-Production separation.
- Replace local-filesystem persistence with the existing B2-backed implementation without changing the user's storage decision.
- Add seller-safe, least-privilege upload authorization and ownership binding; do not grant admin.
- Reconcile UI max 30 with API max 10; no silent truncation.
- Resolve brand-not-found behavior using a real moderated brand-request workflow or strict registered-brand selection.
- Test create listing → upload multiple images → persist → reload → detail page renders the same media URLs and metadata.
- Do not claim pilot success until a Preview-only test account/database is proven isolated and a full read/write/read-back test passes.

P1 — Complete legacy/current parity for the 17 homepage sections and the eight differing components.
P2 — Route/UI/API/schema/RBAC/admin/test matrix for every public and admin product area.
P3 — Search quality, seller/dealer profiles, services lifecycle, Wanted matching, auctions and Sell-in-7-Days operational flows.
P4 — SEO, accessibility, performance, mobile, localization and analytics.
P5 — Preview identity proof, deployment, route smoke tests, screenshot review and owner acceptance.

## 8. Release gates

- PR #307 stays Draft until owner review and required checks are green.
- No Production, DNS, stable Worker or secret mutation.
- No Preview deployment until App and Store database identities and proof-secret provenance are independently established.
- No user-facing claim of "complete" without runtime and data evidence.
