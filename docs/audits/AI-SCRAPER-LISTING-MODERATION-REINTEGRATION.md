# HEAVIX AI Scraper → Listing Review Reintegration

**Status:** Implementation patch prepared on `fix/taxonomy-seed-safety-2026-11-14`; CI/runtime verification pending.  
**Scope:** Marketplace listing scraper only. Store parts scraper remains a separate workflow and database.

## Source-backed findings

The current repository already contains the historical capability:

- UI: `src/app/admin/ai-scraper/page.tsx`
- API: `src/app/api/admin/ai-scraper/route.ts`
- Store parts scraper (separate): `src/app/admin/store/ai-scraper/page.tsx` and `src/app/api/admin/store/ai-scraper/route.ts`
- Listing moderation UI: `src/app/admin/listings/AdminListingsClient.tsx`
- Listing review API: `src/app/api/admin/listings/route.ts` and `src/app/api/admin/listings/[id]/route.ts`
- Navigation seed: `prisma/seed-admin-navigation.ts`

The marketplace scraper already recognizes Divar and Sheypoor host families, uses AI extraction to normalize listing title, description, price, location, brand/category, year, hours, condition, phone and images, and retains `sourceUrl` / `sourceSite` provenance.

## Confirmed integration defects

1. The UI's single-item `action: import` path created listings with `status: PUBLISHED` and set `publishedAt` / `expiresAt` immediately.
2. The UI's `action: bulk-import` path did the same.
3. The lower-level `mode: import` helper already used `PENDING`, so the route had inconsistent moderation semantics depending on which interface called it.
4. The scraper was not directly reachable from the main Admin Listings page even though a separate Admin route existed.
5. Navigation seed used `ai.execute`, while the scraper API enforces `ai.scraper.execute`; this permission mismatch could hide the menu item for a correctly scoped user.

## Changes in this patch

- Single and bulk scraper imports now create `PENDING` listings only; they do not set publication or expiry timestamps.
- Bulk import now also persists `sourceUrl`, matching the single-import provenance behavior.
- Scraper UI tells the operator that imported records are waiting for admin review.
- Main Admin Listings header now links to **ورود هوشمند آگهی**.
- Listing manager now exposes a dedicated `PENDING` status label/filter and displays the pending count returned by the listing API.
- Admin navigation seed uses the same `ai.scraper.execute` permission required by the API.
- Existing direct `mode: import` path remains draft/pending-only.

## Intended workflow

```text
Admin opens Listings
        ↓
AI Listing Import
        ↓
Search / scrape source pages
        ↓
AI extracts structured fields
        ↓
Map to HEAVIX category / brand / dynamic form
        ↓
Operator reviews candidate data
        ↓
Import as PENDING
        ↓
Admin Listings → Pending review
        ↓
Admin edits / rejects / approves
        ↓
Explicit publish action
```

AI extraction is a suggestion, not verified truth. Category/brand/model matches, price, condition, year, working hours, seller contact, and media must remain reviewable. AI must never silently verify a listing or publish it.

## Remaining verification and product gaps

- The current extraction result includes a structured category/brand match, but a full dynamic-attribute mapping against each HEAVIX category form still needs to be implemented and tested. Do not mark the "form conformity" requirement complete yet.
- Review the actual admin PATCH/API transition for PENDING → PUBLISHED and add denial-before-side-effect tests for unauthorized users.
- Add regression tests covering single import, bulk import, provenance persistence, pending-only status, no publication timestamp, and explicit admin approval.
- Validate URL parsing and outbound fetch restrictions (SSRF), redirects, DNS/private-network targets, response size, content type, timeouts, and host allowlists. Do not accept arbitrary user-supplied URLs without this gate.
- Review provider/page-reader terms and source-site rules before enabling scheduled/large-scale crawling. Respect robots/terms and rate limits; do not bypass access controls, login walls, CAPTCHAs, or anti-bot protections.
- Review privacy and lawful handling of scraped seller phone numbers. Do not expose source-site personal contact details publicly without an appropriate legal basis and product policy.
- Review image licensing and attribution. Scraped third-party images must not be treated as HEAVIX-owned media; AI-generated illustrative images must be clearly distinguished from actual equipment photos.
- Implement duplicate detection by normalized source URL, source listing ID when available, title/brand/model similarity, and image fingerprints. Preserve source provenance and import history.
- The Store AI scraper imports parts into a separate Store database and is not the same as the marketplace listing workflow. Keep the two domains separate.

## Safety boundary

No scrape/import was executed, no database was mutated, no external site was crawled, and no Preview/Production deployment was triggered by this audit. This patch changes application code only on the isolated feature branch.