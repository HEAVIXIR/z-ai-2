# HEAVIX Canonical Homepage Specification — Legacy Z
Date recorded: 2026-11-11
Status: Owner-described source-of-truth specification; implementation must be reconciled against the legacy Z repository and its original assets/components.

## Purpose and authority
This document records the homepage structure and behaviors explicitly described by the project owner after launching the older version in a ZAI agent sandbox. Treat the legacy Z repository as the primary implementation/reference source. The current recovery homepage is not an acceptable substitute if it omits these sections, content, visual treatments, animations, interactions, or admin controls.

This is a specification, not proof that every item is already implemented in the recovery branch. Before changing a component, inspect the corresponding legacy Z implementation, assets, styles, animation logic, data model, and admin configuration. Reuse/port the original where sound; do not approximate from memory or replace it with generic cards.

## Global visual and behavior requirements
- Preserve the original HEAVIX identity, logos, header composition, typography, colors, spacing, imagery, responsive behavior, and section hierarchy by inspecting the legacy repository.
- The hero is a full-bleed, wide photographic composition: imagery spans both left and right sides and fills the hero area; statistics and information cards overlay the image. It is not a small centered image beside a generic text block.
- Several sections have deliberate motion/animation. The legacy Z repository contains the original animation implementations. Inspect and reuse them rather than inventing unrelated motion. Respect reduced-motion accessibility and ensure content remains usable without animation.
- Homepage statistics and listings must be data-driven and admin-configurable where specified. Numbers quoted below (for example 31 active ads, 629 brands, 400+ categories) are examples of the old screen's displayed snapshot, not constants to hardcode.
- The complete homepage must be responsive and preserve content/interaction on mobile and desktop.
- Section order and names below follow the owner's description. Map these to canonical stable section keys in the CMS/admin editor; reordering and visibility controls must remain functional.

## 1. Header and brand area
- Header contains the HEAVIX logo/brand marks and navigation.
- Include the live/at-a-glance statistics cluster on the right side as in the old design. Owner cited a snapshot with 31 active ads, 629 brands, 400+ categories, and a count of featured ads.
- Values must come from real platform data and update according to the intended live-stat behavior; never hardcode the example values.
- Preserve the old logo assets, layout, responsive menu behavior, and interactions.

## 2. Full-width photographic hero + advanced marketplace search
- Hero photo spans the full width, with overlay statistics and cards placed over the image.
- Search panel is integrated into/over the hero and has mode tabs at its top: Buy, Rent, and Exclusive Sale.
- Main input is a typeable text search field.
- Adjacent controls/actions include All Categories, All Brands, and Search Filters.
- The upper-left corner of the search area shows the active category count.
- Beneath the input, show helpful trending/suggested search terms, e.g. excavator, loader, bulldozer, grader, crane, dump truck (owner's examples; actual terms should be data-driven or configured).
- Search controls must be functional and route/filter the actual marketplace data, not be decorative placeholders.

## 3. Sell in 7 Days / HEAVIX Guarantee
- A dedicated section explains: register your machine; HEAVIX matches it with its dealer network and active buyers in Iran; if it is not sold within seven days, the listing fee becomes completely free.
- Four sequential actions/process cards:
  1. Register & Reserve — register the machine with reservation confirmation (owner described registration and reservation/confirmation; inspect legacy labels and exact flow).
  2. Inspection — technical, legal, and body-condition inspection.
  3. Valuation — valuation and price announcement.
  4. Contract & Settlement — contract execution and settlement.
- The process must show per-user/per-order progress/checkmarks for milestones such as technical expert, legal expert, valuation, ownership/identity confirmed, and ready for transfer. A milestone must only be marked complete when its real workflow state supports it; do not show universal fake checkmarks.
- Include the campaign callout: “Ready to enter the campaign?” / “Register your machine ad now”; explain that experts contact the seller in less than 24 hours and start the exclusive-sale process.
- Functional calls to action: View Process and Submit/Register Order.
- Supporting benefits displayed alongside/in the section:
  - Intelligent matching with real buyers
  - Priority access
  - Verified dealers
  - Sale guarantee or listing-fee refund/free listing if not sold in seven days, subject to the actual program terms
  - Dedicated support until sale
- Preserve the legacy illustration/photo assets for this section, including the process image(s) the owner referenced. Locate them in Z; do not substitute generic stock art.

## 4. Featured Ads / HEAVIX Featured
- Four featured listing cards displayed side by side at desktop size, responsive at narrower widths.
- Each card includes, in this order/meaning:
  - Main equipment photo at top
  - Listing title/name
  - Description
  - Location
  - Manufacturing year
  - Brand
  - Operating hours
  - Price
  - “View Details” link/action to the real listing detail page
- The section uses the original legacy animation/motion behavior. Inspect Z for the exact animation and timing; do not guess or remove it.

## 5. Exclusive Sale
- Dedicated Exclusive Sale section, separate from Featured Ads and Fresh Listings.
- Preserve its original legacy content, layout, listing treatment, and animation where present. Inspect Z for exact details; do not collapse it into another listing section.

## 6. Fresh Listings / Latest Ads
- Heading/positioning: “Fresh Listings” / newest equipment added to the HEAVIX market.
- Shows the latest listings, with the original animated movement/carousel behavior described by the owner.
- Each item must link to its actual listing details and use live listing data.

## 7. For You / personalized recommendations
- Recommendations are based on each user's interests and browsing/view history.
- This section is user-specific, not one globally identical set for every visitor. For anonymous users, use the legacy-defined fallback or an honest empty/prompt state; do not fabricate personalization.
- Preserve original card design and behavior from Z.

## 8. Trending Now
- “Today's hottest market” / popular searches and heavy machinery on HEAVIX.
- Trending terms/items should be backed by actual search/listing signals or an explicitly configured source, not fabricated counts.

## 9. HEAVIX Wanted / Active Requests
- Active buyer requests displayed with the original animated reveal/rotation behavior; owner described four items opening/revealing in sequence.
- Below the request titles, provide functional “Submit a Buy Request” and “View Machinery” actions.
- Respect request privacy and permissions; do not expose private buyer information.

## 10. HEAVIX Services
- Full services section, with the legacy taxonomy and all service categories (owner recalled approximately 18 services/categories).
- Examples explicitly named: financial facilities, repair and maintenance, inspection/expertise, marketing, transportation. “Financial facilities” was repeated in the spoken list; verify the exact distinct categories and labels from Z rather than deduplicating by guess.
- Preserve all legacy categories, descriptions, icons/images, links, grouping, and animations/interactions found in Z.
- Service cards must route to real service pages/request flows; do not show empty fake cards.

## 11. Why HEAVIX?
- Static/non-animated differentiator section (owner explicitly said this section has no animation).
- Six differentiators and explanatory copy:
  - Verified Dealers
  - Secure Trade / Trust
  - Smart Matching
  - Nationwide Network
  - Mechanic Service
  - Sell in 7 Days
- Preserve the legacy visual template and descriptions.

## 12. HEAVIX Knowledge
- Animated editorial/knowledge section.
- Right side: image reveals/opens.
- Left side: article/knowledge text appears with a typing effect, synchronized with the image reveal.
- Include links to guides and longer-form articles; clicking must open the actual article/guide.
- Respect reduced motion; typing effect must not prevent reading or accessibility.

## 13. Platform statistics
- Dedicated platform-statistics section with active ads, brands, and covered categories (owner described a cylinder/column visual treatment).
- Statistics are real and data-backed, not hardcoded.
- These statistics and their presentation/order/visibility are configurable/reorderable in the admin panel, as in the old system.

## 14. Machinery Categories
- Categories section with the original rotating/animated presentation.
- Must use the complete legacy category taxonomy and real category links/counts; preserve original imagery/icons and motion.

## 15. Trusted Brands
- Trusted Brands / featured brands section.
- Preserve original logo assets, layout, motion, links, and brand selection logic from Z. Brand count is not a fixed constant.

## 16. Closing CTA
- Message: “Register your ad for free now” and “Find the machine you need in Iran's largest heavy-machinery marketplace” (preserve the actual legacy copy/localization where available).
- Functional actions: Register Ad and View Ads.

## 17. Footer
- Preserve complete footer links, navigation, legal/contact content, and responsive layout from Z.
- Footer's three-brand composition:
  - Right: Arya Machine Jam — parent brand
  - Center: HEAVIX — industrial marketplace
  - Left: Mekanix — heavy-service technicians/services
- Preserve the correct logos and brand descriptors, not text-only approximations.

## Admin/CMS requirements
- Every section that was configurable in the legacy admin must remain configurable: order, visibility, content, media, and relevant data source/settings.
- The platform-statistics section specifically had reorder/change controls in admin.
- Do not reduce the page to a hardcoded static JSX layout if the original architecture supports admin-controlled sections. Conversely, do not let a generic page renderer erase the canonical homepage composition.
- Stable section keys and backward-compatible migration/mapping are required. Admin editor labels must correspond to the canonical sections above.
- Public homepage reads must remain read-only; never seed or write DB data during public GET requests.

## Data, permissions, and correctness
- Listing cards must use actual published/eligible listings and their real photos, location, year, brand, operating hours, and price.
- User-specific recommendations require authenticated/consented user context and privacy-safe behavior.
- Workflow progress in Sell in 7 Days must reflect actual order/case milestones.
- Admin changes must be permission-checked with least privilege and audited as appropriate.
- Counts, trending data, featured selections, service categories, and brand logos must come from their real sources or explicit admin configuration.
- No fabricated listings, brands, category counts, buyer requests, user progress, or platform metrics.

## Required implementation/verification sequence
1. Inspect legacy Z source tree, homepage entry point, all 17 section components, shared cards, media assets, styles, animation libraries/configuration, responsive breakpoints, and admin section editor/data model.
2. Build an inventory mapping each legacy section/component/asset/data source/animation to the recovery branch. Record exact paths and whether copied, adapted, or intentionally replaced.
3. Compare the current recovery homepage to this spec section-by-section. Mark each as: present and faithful, present but incomplete, missing, or blocked by data/runtime.
4. Restore the old visual hierarchy and behavior, reusing legacy code/assets wherever safe. Do not invent new animation styles when the legacy version is available.
5. Validate desktop, tablet, and mobile; validate reduced-motion and keyboard/screen-reader access.
6. Test every CTA, tab, search filter, card detail link, service link, buyer-request action, knowledge link, and footer navigation.
7. Verify admin reorder/visibility/content/media controls and persisted ordering.
8. Verify real data sources and no fake fallback metrics.
9. Capture screenshots/evidence for each section and attach them to the project worklog.
10. Only after CI and the separate Preview database identity/provenance gates pass may a Preview deployment be considered. Preserve the existing Preview URL and do not touch Production/DNS.

## Current known recovery-branch context (must be rechecked before acting)
The recovery branch previously restored a 17-section canonical homepage composition, but that alone does not prove fidelity to the detailed visual/behavioral specification above. Existing live Preview was previously found to serve an older/incomplete build with multiple failing routes. Treat that audit as historical until freshly rechecked. CI success on an earlier code SHA does not prove current-head CI, Preview runtime, or database identity.
