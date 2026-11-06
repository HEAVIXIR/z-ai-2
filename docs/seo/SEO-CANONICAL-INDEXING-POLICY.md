# HEAVIX SEO canonical and indexing policy

**Status:** implementation proposal in Draft PR #216  
**Last reviewed:** 2026-11-06

## Canonical public routes

| Content | Canonical URL | Legacy/alternate behavior |
|---|---|---|
| Articles | `/articles/{slug}` | `/knowledge/{slug}` permanently redirects to the canonical article route |
| Product models | `/brands/{brandSlug}/models/{modelSlug}` | `/models/{slug}` redirects when exactly one active model matches; ambiguous slugs show a noindex brand selector |
| Companies | `/companies/{slug}` | Existing company page remains canonical |
| Brands | `/brands/{slug}` | Existing brand page remains canonical |
| Listings | `/listings/{slug}` | Only published listings are included in the sitemap |

Model slugs are unique within a brand, not necessarily across all brands. A global `/models/{slug}` lookup must never select an arbitrary first result.

## Sitemap inclusion rules

Include only:
- Active categories and brands.
- Published listings and articles.
- Active companies with at least one published listing.
- Active product models with at least one published listing and an active brand.

Honor each entity's `SEOMetadata.robotsIndex`, priority, and change-frequency overrides. Preview deployments return an empty sitemap. The static `/knowledge` URL remains the knowledge index; article detail URLs use `/articles/{slug}`.

## Noindex pages

The following pages are user-specific, transactional, or utility experiences and must not be indexed:
- `/compare`
- `/find-my-need`
- `/admin/*`, `/dashboard/*`, and `/seller/*`
- `/login` and `/register`
- `/compare`, `/find-my-need`, and `/listings/new`
- `/requests/new`, `/rfq/new`, and `/rfq/{id}`
- `/transport/request`
- `/sell-in-7-days/register` and `/sell-in-7-days/track`
- `/auctions/*` (time-sensitive inventory)
- `/sellers/{id}` (personal seller profile)
- Preview page tokens under `/preview/page/{key}`
- Legacy ambiguous model selector pages under `/models/{slug}`

Use page metadata/layout metadata with `robots.index=false`. Do not block these paths in robots.txt if doing so would prevent crawlers from seeing the noindex directive. The robots.txt currently disallows `/api/*` only. Do not disallow private UI routes at crawl level: crawlers must be able to fetch their pages and observe `noindex`. Authentication and authorization remain enforced by server components and APIs; noindex is not access control.

## SEO administration

The SEO entity picker supports `Company` and `ProductModel` in addition to existing entity types. Product-model metadata and URLs must include the owning brand. Structured data uses Organization for companies and ProductModel for catalog models.

## Privacy and release notes

- Never place tracking codes, RFQ identifiers, comparison-session IDs, private seller data, or transactional query parameters in the sitemap.
- Public entity pages must be backed by published/active data; noindex is not a substitute for API authorization.
- This policy does not authorize Production deployment or any database migration.
