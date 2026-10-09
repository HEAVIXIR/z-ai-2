# HEAVIX — SEO Architecture for Public Pages

- **Status:** Draft — STEP 11.29-SEO
- **Date:** 2026-10-10
- **Owner:** /seo agent (search growth architecture)
- **Scope:** Public-facing, indexable pages only — machine/listing detail, category, brand, model, showroom.
- **Out of scope:** `/admin/*`, `/api/*`, `/dashboard/*`, `/seller/*` (already disallowed in `robots.ts`), authentication flows, the `/knowledge/*` article hub (covered separately by content-SEO, not product-SEO).
- **Hard rule:** Documentation only. No code, schema, or PRs are modified by this document. Every recommendation is grounded in the **actual** schema (`prisma/schema.prisma`) and the **actual** routes under `src/app/`.

---

## 0. Executive Summary — What Exists vs. What's Missing

An audit of the codebase reveals that HEAVIX has a **partial SEO foundation already built but not wired in**. The gap is not "build SEO from scratch"; it is "connect existing infrastructure to public routes and add the missing policies."

**Already implemented (do not rebuild):**
- `src/app/robots.ts` — robots.txt with sensible defaults (`Allow: /`, disallow `/admin/`, `/api/`, `/dashboard/`, `/seller/`, `/login`, `/register`).
- `src/app/sitemap.ts` — Next.js metadata-route sitemap, `revalidate = 3600`, emits URLs for static pages, active categories, active brands, `PUBLISHED` listings, and published articles. **Honors `SEOMetadata.robotsIndex = false`** to skip noindex entities.
- `src/lib/seo.ts` — pure helpers `generateMetaTitle`, `generateMetaDescription`, `generateStructuredData` (emits `Product` + `Offer` + `Brand` + `CollectionPage` + `Article` + `WebPage`), `generateBreadcrumbJsonLd`, `absoluteUrl`, plus `getSEO` / `upsertSEO` for the generic `SEOMetadata` table.
- `prisma/schema.prisma` → `SEOMetadata` model (keyed by `(entityType, entityId)`) with `metaTitle`, `metaDescription`, `keywords`, `canonicalUrl`, `ogImage`, `ogTitle`, `ogDescription`, `structuredData`, `robotsIndex`, `robotsFollow`, `sitemapPriority`, `sitemapChangeFreq`. This is the **canonical** SEO layer for all public entities.
- `src/app/listings/seo/[category]/[city]/page.tsx` — programmatic SEO landing pages with a working `generateMetadata`. The only public route today that exports metadata.
- `ListingImage.alt` — schema field exists for image alt text (optional `String?`).

**Missing (this document specifies them; implementation is a separate ticket):**
1. `generateMetadata` exports on the four core detail pages: `/listings/[slug]`, `/brands/[slug]`, `/categories/[slug]`, `/models/[slug]`, `/companies/[slug]`.
2. JSON-LD `<script>` injection on those same pages (helpers exist in `lib/seo.ts` but are not called by any route).
3. `<link rel="canonical">` on the listings index (`/listings`) and on all filter/facet/sort/pagination variants.
4. A `noindex` policy on filtered/sorted/paginated variants of `/listings` and on the programmatic SEO landing pages when they have zero results.
5. Sold / expired / private listing behavior (the detail page currently `notFound()`s on anything that isn't `PUBLISHED`, which produces a `404` — see §7).
6. Sitemap entries for `/models/*`, `/companies/*`, and the programmatic `/listings/seo/[category]/[city]` pages.
7. Sitemap **sharding** (`sitemap-index.xml` + per-type child sitemaps) once listing count exceeds ~5,000 — Google's documented soft limit per sitemap is 50,000 URLs / 50 MB uncompressed (sitemaps.org spec).
8. Next.js `<Image>` adoption on listing detail (currently raw `<img>` — see §6).
9. `X-Robots-Tag` HTTP headers on API-served renders of private content (defense in depth).
10. The `/showroom/[slug]` route itself — ADR-005 §2 specifies it but it is **not yet implemented**. This document specifies its index policy conditionally (see §1.6 and §8).

The remainder of this document defines each policy in detail.

---

## 1. URL Architecture

### 1.1 Design Principles
1. **One canonical URL per logical entity.** A listing has exactly one canonical URL even if it's reachable through multiple paths (brand page, category page, search result).
2. **Slugs are stable.** A canonical URL must not change when a listing's brand, category, or seller is re-assigned. Therefore the canonical URL must be keyed on a field that is **never updated after publication**.
3. **Slugs are globally unique where the URL path is single-segment.** Multi-segment paths (e.g. `/machines/[brand]/[model]/[slug]`) require composite uniqueness and introduce collision + instability risk.
4. **Lowercase, hyphenated, ASCII-only in the path.** Persian characters are allowed (the site is RTL/fa_IR) and are URL-encoded by Next.js; we accept Persian slugs because they improve CTR for the local market. English slugs are preferred where they exist (`Brand.nameEn`, `Category.nameEn`, `ProductModel.nameEn`).
5. **No trailing slash.** Next.js App Router is consistent about this; we do not add a trailing slash and we 301 any trailing-slash variant to the non-slash form.

### 1.2 Canonical URL Patterns (per page type)

| Page type | Canonical URL | Slug source (schema) | Uniqueness | Current route |
|---|---|---|---|---|
| Listing / machine detail | `/listings/{slug}` | `Listing.slug` | `@unique` (global) | `/listings/[slug]/page.tsx` ✅ exists |
| Category | `/categories/{slug}` | `Category.slug` | `@unique` (global) | `/categories/[slug]/page.tsx` ✅ exists |
| Brand | `/brands/{slug}` | `Brand.slug` | `@unique` (global) | `/brands/[slug]/page.tsx` ✅ exists |
| Product model | `/models/{slug}` | `ProductModel.slug` | `@@unique([brandId, slug])` (per-brand) | `/models/[slug]/page.tsx` ✅ exists |
| Company / dealer page | `/companies/{slug}` | `Company.slug` | `@unique` (global) | `/companies/[slug]/page.tsx` ✅ exists |
| VIP Showroom (planned, ADR-005 §2) | `/showroom/{storeSlug}` | `Company.storeSlug` (to be added per ADR-005 §1) | `@unique` (planned) | **Not yet implemented** |
| Programmatic SEO landing | `/listings/seo/{category}/{city}` | `Category.slug` + city name | n/a (two-segment) | `/listings/seo/[category]/[city]/page.tsx` ✅ exists |
| Listings index (search/browse) | `/listings` (bare) | n/a | n/a | `/listings/page.tsx` ✅ exists |

### 1.3 Machine Page: `/listings/[slug]` vs `/machines/[brand]/[model]/[listingSlug]`

**Recommendation: keep `/listings/[slug]` as the canonical URL.**

Rationale, grounded in the actual schema:

- `Listing.slug` is declared `@unique` (line 446 of `schema.prisma`) — globally unique. A single-segment path is therefore collision-free.
- `Listing.brandId` and `Listing.modelId` are both **nullable** (`String?` on lines 483 and 487). A `/machines/[brand]/[model]/[slug]` path would either (a) break for the (common) case of a listing with no model, or (b) require a fallback path like `/machines/unknown/unknown/[slug]`, which is worse than `/listings/[slug]`.
- `ProductModel.slug` is **not** globally unique — it is `@@unique([brandId, slug])` (line 411). Two brands can each have a model named `320`. A path `/machines/[brand]/[model]/[slug]` works only because `brand` disambiguates, but it forces the brand segment to be authoritative and means re-branding a model (e.g. Caterpillar re-organizing a sub-brand) **changes the canonical URL**, breaking inbound links and Search Console history.
- Brand and model re-assignment is a real scenario in this codebase (`Listing.brandId` and `Listing.modelId` are mutable; the admin UI in `src/app/admin/listings/[id]/edit/` edits them). A canonical URL that depends on mutable foreign keys is an SEO liability.
- Keyword-rich paths (`/machines/caterpillar/320d/...`) give marginal ranking benefit; modern Google ranks page content and links, not path keywords. The brand + model keywords belong in `<title>`, `<h1>`, breadcrumbs, internal anchor text, and JSON-LD `Brand`/`Product` markup — all of which are specified in §2 and §5 below.
- `/listings/[slug]` is already live, indexed, and linked internally across the site. Changing it would require 301-ing every existing URL for zero net SEO gain.

**Optional future enhancement (not part of this recommendation):** if marketing wants keyword-rich vanity URLs, add `/machines/[brand]/[model]/[slug]` as a **non-canonical alias** that 301-redirects to `/listings/[slug]`. The 301 preserves link equity without introducing instability. Do not implement this before the core metadata work in §2 is done.

### 1.4 ProductModel page collision risk

`ProductModel.slug` is `@@unique([brandId, slug])`, not globally unique. The current route `/models/[slug]` queries `db.productModel.findFirst({ where: { slug } })` — which silently returns **one arbitrary** row when two brands share a model slug. This is an SEO correctness bug:

- Two distinct models can produce the same canonical URL → duplicate content.
- The "winner" is non-deterministic (Prisma `findFirst` has no guaranteed order).

**Recommended fix (schema-aware):** change the canonical URL for model pages to `/brands/[brandSlug]/models/[modelSlug]` and update the route + sitemap. This makes the path self-disambiguating and matches the composite uniqueness. Until this is done, the model page is a duplicate-content risk and should be `noindex` if more than one `ProductModel` row matches the slug (detectable at request time with `count`).

### 1.5 Company vs Showroom

The `Company` model already has `slug @unique` (line 1180). ADR-005 §1 specifies adding `storeSlug @unique` to `Company` and §2 specifies a new `Showroom` model with `isActive` and a `companyId @unique` link. The current public company page is `/companies/[slug]`. When the VIP showroom ships:

- `/companies/[slug]` remains the canonical public company page (always indexable if `Company.status === "ACTIVE"`).
- `/showroom/[storeSlug]` is a **separate, premium** page (the "VIP Virtual Showroom") with its own canonical URL, its own metadata, and the index policy in §1.6.

The two pages must not canonicalize to each other — they serve different search intents (company = "who is this dealer", showroom = "what does this dealer's curated catalog look like"). Cross-link them with `<a href>` and `BreadcrumbList` instead.

### 1.6 VIP Showroom index policy (per ADR-005 §2)

ADR-005 §2 mandates server-side enforcement: the public route `/showroom/[slug]` checks `Showroom.isActive === true` **and** the linked `Company` has a valid (non-expired) `PremiumSubscription`. Non-VIP or inactive → `404`.

SEO policy on top of that enforcement:

| State | HTTP status | robots meta | Sitemap | X-Robots-Tag | Notes |
|---|---|---|---|---|---|
| Active + valid subscription | `200` | `index, follow` | included | (none) | Indexable. |
| Inactive showroom (`Showroom.isActive === false`) | `404` | `noindex, nofollow` (on the 404 page) | excluded | `noindex` | Per ADR-005 §2. The 404 itself is non-indexable. |
| Active showroom, expired `PremiumSubscription` | `404` | `noindex, nofollow` | excluded | `noindex` | Treat as inactive. |
| Unknown `storeSlug` | `404` | `noindex, nofollow` | excluded | `noindex` | Standard 404. |
| Showroom deleted (former URL) | `410 Gone` | n/a | excluded | `noindex` | See §7. Use `410` rather than `404` so Google drops the URL faster (Google treats `410` as more permanent than `404`). |

**Until the `/showroom/[slug]` route is implemented, this section is forward-looking.** When implementation lands, the route handler must set `X-Robots-Tag: noindex` on the `404` response in addition to rendering the 404 page — this prevents the 404 template itself from being indexed if it's ever served with a `200` status by mistake (defense in depth).

### 1.7 Trailing-slash and case policy

- All canonical URLs are lowercase, no trailing slash.
- Next.js App Router does not add trailing slashes by default (no `trailingSlash: true` in `next.config.ts` — verified).
- If a request arrives with a trailing slash or uppercase letters in the path, the route should `301` redirect to the canonical form. Implement via `next.config.ts` `redirects()` (static, build-time) for trailing-slash normalization; case normalization requires a middleware and is lower priority.

### 1.8 URL examples (real, from current data shape)

```
https://havix.ir/                                    ← homepage
https://havix.ir/listings                            ← browse/search index
https://havix.ir/listings?category=excavators        ← filtered (noindex, see §4)
https://havix.ir/listings/bellt-caterpillar-320d-2021  ← listing detail (canonical)
https://havix.ir/categories/excavators               ← category page
https://havix.ir/brands/caterpillar                  ← brand page
https://havix.ir/models/320d                         ← model page (collision risk — see §1.4)
https://havix.ir/companies/arya-mashin-jam           ← company page
https://havix.ir/listings/seo/excavators/tehran      ← programmatic SEO landing
https://havix.ir/showroom/arya-mashin-jam            ← VIP showroom (planned, ADR-005 §2)
```

---

## 2. Metadata — Per-Page-Type Templates

### 2.1 General rules

- **`<title>`**: ≤ 60 characters (Persian characters count as 1; Google truncates at ~600px which is roughly 30-60 Persian chars depending on width). Format: `{Primary keyword} — {secondary} | هویکس`.
- **`<meta name="description">`**: ≤ 155 characters. Must contain real entity data (price, year, city, brand). Google may ignore it and generate its own, but a good one improves CTR.
- **`og:title`**, **`og:description`**: mirror title/description unless A/B testing shows a different CTA performs better.
- **`og:image`**: 1200×630, brand-styled. Use the listing's primary image (`ListingImage` where `isPrimary = true`) when available; fall back to a category-styled OG template (generated server-side from `Category.icon` + `Category.imageUrl`).
- **`og:type`**: `website` for browse/index pages, `product` for listing detail (per https://ogp.me/ → `og:type=product` is valid and enables richer Facebook/Pinterest cards).
- **`og:locale`**: `fa_IR`. If a future English version ships, add `og:locale:alternate` entries.
- **`twitter:card`**: `summary_large_image` for listing detail (we have a strong hero image); `summary` for index pages.
- **`<link rel="canonical">`**: every indexable page must emit one. See §1 and §4.

### 2.2 Listing detail page (`/listings/[slug]`)

Real fields available (from `schema.prisma` `Listing`): `title`, `description`, `shortDesc`, `price: BigInt?`, `priceType` (`NEGOTIABLE` default), `listingType` (`SALE` default), `condition`, `province`, `city`, `year`, `workingHours`, `status`, `featured`, `verified`, `viewCount`, `favoriteCount`, `publishedAt`, `expiresAt`, `soldAt`. Related: `Brand.name`/`nameEn`, `Category.name`, `ListingImage.url`/`alt`, `ProductModel.name`.

**`generateMetadata` template (pseudocode — actual implementation is a separate ticket):**

```ts
// /listings/[slug]/page.tsx
export async function generateMetadata({ params }): Promise<Metadata> {
  const { slug } = await params;
  const listing = await db.listing.findUnique({
    where: { slug },
    select: { /* real fields */ title, shortDesc, description, price, priceType,
              condition, year, city, province, brand: { select: { name: true } },
              category: { select: { name: true } },
              images: { where: { isPrimary: true }, take: 1, select: { url: true, alt: true } } }
  });
  if (!listing || listing.status !== "PUBLISHED") {
    return { robots: { index: false, follow: false } }; // noindex on 404 path
  }

  const title = `${listing.title} — ${listing.brand?.name ?? ""} ${listing.year ?? ""}`.trim()
                .slice(0, 60) + " | هویکس";
  const description = [
    listing.shortDesc ?? listing.description?.slice(0, 120),
    listing.price ? `قیمت: ${formatFullPrice(listing.price)}` : "قیمت: توافقی",
    listing.city ? `در ${listing.city}` : "",
  ].filter(Boolean).join(" — ").slice(0, 155);

  return {
    title,
    description,
    canonical: absoluteUrl(`/listings/${slug}`),
    openGraph: {
      title,
      description,
      type: "website",          // use 'product' only when ogp.me/product is wired
      locale: "fa_IR",
      url: absoluteUrl(`/listings/${slug}`),
      images: listing.images[0]
        ? [{ url: absoluteUrl(listing.images[0].url), width: 1200, height: 630,
             alt: listing.images[0].alt ?? listing.title }]
        : undefined,
      siteName: "هویکس",
    },
    twitter: {
      card: "summary_large_image",
      title, description,
      images: listing.images[0] ? [absoluteUrl(listing.images[0].url)] : undefined,
    },
    robots: { index: true, follow: true },
    alternates: { canonical: absoluteUrl(`/listings/${slug}`) },
  };
}
```

**Title template** (real, using real fields):
- Default: `{listing.title} | هویکس`
- If brand + year: `{listing.title} — {brand.name} {year} | هویکس`
- Never fabricate: do not add "خرید ارزان" / "بهترین قیمت" — those are spam signals.

**Description template** (real):
- `{shortDesc or first 120 chars of description} — قیمت {formatted price or "توافقی"} — {city}, {province} — کارکرد {workingHours} ساعت — هویکس.`

### 2.3 Brand page (`/brands/[slug]`)

Real fields: `Brand.name`, `nameEn`, `shortName`, `country`, `description`, `logoUrl`, `website`, `manufacturer`, `foundedYear`, `verification`, `parentBrand.name`.

```
title:        {brand.name} — خرید و فروش ماشین‌آلات {brand.name} | هویکس
description:  {brand.description or "خرید و فروش ماشین‌آلات {brand.name} نو و دست‌دوم با قیمت روز و کارشناسی هویکس. بررسی مشخصات فنی، مقایسه مدل‌ها و تماس با دیلرهای معتبر."}  (≤155)
canonical:    /brands/{brand.slug}
og:image:     brand.logoUrl (fallback: category OG template)
robots:       index, follow  (only if brand.active === true)
```

The existing helper `generateMetaTitle("Brand", entity)` in `src/lib/seo.ts` already produces `{name} — برند صنعتی | هویکس`. Wire it in.

### 2.4 Category page (`/categories/[slug]`)

Real fields: `Category.name`, `nameEn`, `description`, `icon`, `imageUrl`, `parentId`, `taxPath`, `domain`, `layer` (`CATALOG` | `MARKETPLACE` | `SERVICE` | `FALLBACK`).

```
title:        {category.name} — خرید، فروش و اجاره ماشین‌آلات | هویکس
description:  {category.description or "لیست کامل آگهی‌های {category.name} نو و کارکرده با قیمت روز و کارشناسی هویکس. مقایسه، تماس با فروشنده و درخواست کارشناسی."}  (≤155)
canonical:    /categories/{category.slug}
robots:       index, follow  (only if category.active === true AND category.layer === "CATALOG")
```

**noindex rule:** categories with `layer` ∈ `{ "MARKETPLACE", "SERVICE", "FALLBACK" }` are operational groupings, not search-worthy catalog pages. `noindex, follow` them. Only `CATALOG` categories are indexable. This matches the existing `/listings` page filter sidebar, which already restricts to `layer: "CATALOG"`.

### 2.5 Product model page (`/models/[slug]`)

Real fields: `ProductModel.name`, `nameEn`, `description`, `brand.name`, `category.name`, `generations[].name`/`yearFrom`/`yearTo`.

```
title:        {model.name} — {brand.name} — مشخصات و آگهی‌ها | هویکس
description:  {model.description or "مشخصات فنی {model.name} از {brand.name}، لیست آگهی‌های نو و دست‌دوم با قیمت روز و کارشناسی هویکس."}  (≤155)
canonical:    /models/{model.slug}     ← see §1.4 collision risk; recommend /brands/{brand.slug}/models/{model.slug}
robots:       index, follow  (only if model.status === "ACTIVE" AND slug is globally unique — else noindex)
```

### 2.6 Company page (`/companies/[slug]`)

Real fields: `Company.name`, `description`, `logoUrl`, `coverImage`, `website`, `phone`, `email`, `address`, `city`, `province`, `verified`, `premium`, `metaTitle`, `metaDescription` (legacy columns), `avgRating`, `reviewCount`.

```
title:        {company.metaTitle or company.name + " — دیلر ماشین‌آلات سنگین | هویکس"}
description:  {company.metaDescription or company.description or "ماشین‌آلات سنگین نو و دست‌دوم از {company.name} در {company.city}. آگهی‌های فعال، کارشناسی هویکس و خدمات پس از فروش."}  (≤155)
canonical:    /companies/{company.slug}
robots:       index, follow  (only if company.status === "ACTIVE")
```

**Phone/email policy:** do **not** put `company.phone` or `company.email` in `meta description` or `og:description`. They can appear in visible page content (they're already rendered in the contact section) but search-engine snippets should not contain raw phone numbers — they pollute SERP appearance and attract scrapers. See §8.

### 2.7 Showroom page (`/showroom/[storeSlug]` — planned)

When implemented per ADR-005 §2, real fields will come from `Showroom` (id, isActive, template, layout, featuredListingIds, viewCount) joined to `Company` (name, logoUrl, storeDescription, brandColor).

```
title:        نمایشگاه {company.name} — ماشین‌آلات سنگین | هویکس
description:  {company.storeDescription or "نمایشگاه مجازی {company.name} — گالری ماشین‌آلات سنگین ویژه، کارشناسی‌شده توسط هویکس. تماس مستقیم و شروع معامله امن."}  (≤155)
canonical:    /showroom/{company.storeSlug}
robots:       index, follow  ONLY IF Showroom.isActive AND PremiumSubscription valid (ADR-005 §2)
              otherwise: noindex, nofollow + 404 status
```

### 2.8 Programmatic SEO landing (`/listings/seo/[category]/[city]`)

Already has `generateMetadata`. **Additions:**
- Emit `<link rel="canonical">` to the same URL (self-canonical).
- Add `robots: { index: count > 0, follow: true }` — **noindex zero-result landing pages**. Generating thousands of empty city×category combinations is a "mass low-quality page generation" risk explicitly forbidden by §10.
- Add `BreadcrumbList` JSON-LD (see §5.4).

### 2.9 Default/fallback metadata (already in `src/app/layout.tsx`)

The root `layout.tsx` exports a `Metadata` object with title/description/keywords. This is the fallback for any page that doesn't export its own `generateMetadata`. **Do not change it** — but be aware that the four detail pages currently inherit this fallback, which means every listing detail page today has the **homepage title** ("هویکس | بزرگ‌ترین مارکت‌پلیس..."). That is the single biggest SEO defect in the codebase. Fixing it (per §2.2-2.5) is the highest-leverage action in this document.

---

## 3. Sitemap + Index Policy

### 3.1 Sitemap structure (current vs. recommended)

**Current** (`src/app/sitemap.ts`): a single flat sitemap at `/sitemap.xml`, `revalidate = 3600` (1 hour). Includes:
- 6 static paths (`/`, `/listings`, `/brands`, `/store`, `/knowledge`, `/categories`)
- All active categories
- All active brands
- All `PUBLISHED` listings
- All `PUBLISHED` articles

Honors `SEOMetadata.robotsIndex = false` (skips noindex entities). This is correct behavior.

**Gaps in current sitemap:**
1. **No `/models/*` entries.** ProductModel pages are indexable but not in the sitemap.
2. **No `/companies/*` entries.** Company pages are indexable but not in the sitemap.
3. **No `/listings/seo/*` entries.** Programmatic landing pages are not in the sitemap.
4. **No `/showroom/*` entries.** (Acceptable for now — route doesn't exist.)
5. **No lastmod accuracy for listings.** `l.updatedAt` is used, but `publishedAt` is more semantically correct for a listing (it's when the content became publicly visible). Use `COALESCE(publishedAt, updatedAt)`.
6. **Single sitemap file.** Acceptable today; will break at scale. The sitemaps.org protocol (https://sitemaps.org/protocol.html) caps a single sitemap at 50,000 URLs / 50 MB uncompressed. Google's documented guidance is the same (https://developers.google.com/search/docs/crawling-indexing/sitemaps/large-sitemaps). Plan for sharding (§3.3) before listing count crosses ~5,000.

### 3.2 Per-page-type index policy

| Page / URL pattern | Index? | Follow? | Sitemap? | Rationale |
|---|---|---|---|---|
| `/` (homepage) | index | follow | yes (priority 1.0, daily) | Primary landing. |
| `/listings` (bare) | index | follow | yes (priority 0.9, daily) | Browse-all page; primary search entry. |
| `/listings?{any query param}` | **noindex** | follow | no | Filtered variants — see §4. |
| `/listings/{slug}` (PUBLISHED, not sold, not expired) | index | follow | yes (priority 0.7, weekly) | Core product page. |
| `/listings/{slug}` (status `SOLD`) | see §7 | follow | no (after 30-day grace) | Sold listing policy. |
| `/listings/{slug}` (status other than PUBLISHED — DRAFT, REJECTED, PENDING, EXPIRED) | **noindex** | follow | no | Not public. The route already `notFound()`s — add `X-Robots-Tag: noindex` to the 404 response. |
| `/categories/{slug}` (active, `layer=CATALOG`) | index | follow | yes (priority 0.6, weekly) | Catalog taxonomy page. |
| `/categories/{slug}` (`layer` ∈ MARKETPLACE/SERVICE/FALLBACK, or `active=false`) | **noindex** | follow | no | Operational grouping, not search-worthy. |
| `/brands/{slug}` (active) | index | follow | yes (priority 0.6, weekly) | Brand hub. |
| `/brands/{slug}` (inactive) | **noindex** | follow | no | Brand withdrawn. |
| `/models/{slug}` (ACTIVE, globally unique slug) | index | follow | yes (priority 0.5, weekly) | Model hub. |
| `/models/{slug}` (slug collides across brands — see §1.4) | **noindex** | follow | no | Disambiguation needed; emit `noindex` until URL is namespaced. |
| `/companies/{slug}` (status=ACTIVE) | index | follow | yes (priority 0.5, weekly) | Dealer page. |
| `/companies/{slug}` (status≠ACTIVE) | **noindex** | follow | no | Inactive company. |
| `/showroom/{storeSlug}` (active + valid VIP) | index | follow | yes (priority 0.6, weekly) | VIP showroom — ADR-005 §2. |
| `/showroom/{storeSlug}` (inactive / expired VIP) | **noindex** | nofollow | no | 404 per ADR-005 §2. |
| `/listings/seo/{category}/{city}` (≥1 result) | index | follow | yes (priority 0.5, weekly) | Programmatic landing. |
| `/listings/seo/{category}/{city}` (0 results) | **noindex** | follow | no | Empty landing = thin content. |
| `/knowledge/{slug}` (PUBLISHED article) | index | follow | yes (priority 0.5, monthly) | Already handled by `sitemap.ts`. |
| `/auctions`, `/auctions/{id}` | **noindex** | follow | no | Auction listings are time-bound; indexable versions lead to dead SERPs. Re-evaluate if auction index becomes a primary entry. |
| `/rfq`, `/rfq/{id}`, `/rfq/new` | **noindex** | nofollow | no | User-generated, often private. |
| `/compare`, `/compare/{id}` | **noindex** | nofollow | no | Ephemeral session state. |
| `/sell-in-7-days/*` | **noindex** | follow | no | Conversion funnel, not search content. |
| `/transport/request`, `/find-my-need`, `/machine-hunt`, `/community` | **noindex** | follow | no | Tools / community, not catalog. |
| `/market-insights` | **noindex** | follow | no | Dashboard-style. |
| `/preview/page/{key}` | **noindex** | nofollow | no | Preview links — must never be indexed. |
| `/admin/*`, `/api/*`, `/dashboard/*`, `/seller/*`, `/login`, `/register` | disallow in robots.txt | n/a | no | Already in `robots.ts`. |

### 3.3 Sitemap sharding plan (forward-looking)

When total URL count approaches 50,000 (estimate: 5,000 listings × 10 supporting pages each = 50,000), migrate from a single `sitemap.ts` to a sitemap index:

```
/sitemap.xml              ← sitemap index (lists child sitemaps)
/sitemap-categories.xml
/sitemap-brands.xml
/sitemap-models.xml
/sitemap-listings-001.xml ← shard by 50,000-listing buckets
/sitemap-listings-002.xml
/sitemap-companies.xml
/sitemap-showrooms.xml
/sitemap-seo-landings.xml
/sitemap-articles.xml
/sitemap-static.xml
```

Next.js 16 supports this via multiple `sitemap.ts` files in `src/app/sitemap-{name}.xml/route.ts` or by returning a sitemap index from `src/app/sitemap.ts`. Implementation is a separate ticket. The trigger threshold is **5,000 listings** or **25,000 total URLs**, whichever comes first.

### 3.4 robots.txt policy

Current `src/app/robots.ts` is mostly correct. **Recommended additions** to the `disallow` list:

```
disallow: [
  "/admin/", "/api/", "/dashboard/", "/seller/", "/login", "/register",
  "/compare",            // ephemeral
  "/rfq",                // user-generated, often private
  "/requests",           // user-generated
  "/preview/",           // preview links — critical
  "/favorites",          // user-scoped
  "/messages",           // private
  "/sell-in-7-days/",    // funnel, not search content
  "/transport/request",  // form page
  "/find-my-need",       // tool
  "/machine-hunt",       // tool
  "/community",          // community
  "/market-insights",    // dashboard-style
  "/auctions/",          // time-bound (re-evaluate later)
  "*?*",                 // block all query-string variants globally; canonical URLs are query-free
]
```

The `*?*` rule is the single most important addition: it tells crawlers not to crawl any URL with a query string, which collapses the duplicate-content surface from `n` filter combinations to 1 canonical URL per entity. **However**, this is aggressive — it also blocks crawling of legitimate `?page=2` pagination. The recommended approach is:

- **`*?*` disallow in robots.txt** (blocks crawling of all query-string URLs — simplest, most robust).
- **Self-canonical + `noindex` on the same URLs** (handles the case where Google indexes a URL despite the disallow, which happens when an external site links to it).
- **Pagination**: use `rel="next"` / `rel="prev"` HTML link tags on the rare paginated page that should be indexed (e.g. `/categories/{slug}` if it grows beyond 60 listings). Google deprecated `rel=next/prev` as a ranking signal in 2019, but it's still a valid crawl hint.

**Sitemap reference:** `Sitemap: https://havix.ir/sitemap.xml` — already emitted by `robots()`.

**Crawl-delay:** do not add `Crawl-delay` — it's ignored by Google and slows Bing/Yandex unnecessarily. If crawl budget becomes an issue (verifiable in Search Console > Crawl Stats), address it via the `*?*` disallow + sitemap pruning, not via `Crawl-delay`.

### 3.5 lastmod, changefreq, priority

- **`lastmod`**: must reflect real last-modified time. For listings, use `COALESCE(publishedAt, updatedAt)`. For brands/categories, `updatedAt`. For companies, `updatedAt`. **Do not** use `new Date()` (the current sitemap does this for static paths — it's misleading and Search Console flags it).
- **`changefreq`**: hint only, largely ignored by Google. Use realistic values: `daily` for `/` and `/listings`, `weekly` for entity pages, `monthly` for articles. Never `always` — it's a red flag.
- **`priority`**: relative hint. `1.0` for homepage, `0.9` for `/listings`, `0.7` for listing detail, `0.6` for categories/brands, `0.5` for models/articles, `0.4` and below for everything else. Honored from `SEOMetadata.sitemapPriority` when set.

---

## 4. Filtered / Duplicate Content — Faceted SEO Policy

### 4.1 The duplicate-content surface

The `/listings` page (`src/app/listings/page.tsx`) accepts **21+ query parameters**: `q`, `category`, `brand`, `yearFrom`, `yearTo`, `minPrice`, `maxPrice`, `featured`, `type`, `transaction`, `province`, `city`, `industry`, plus dynamic `attr.{KEY}`, `attr.{KEY}_min`, `attr.{KEY}_max` filters, and arbitrary `[key: string]` passthrough. There is **no pagination** (the page hard-caps at `take: 60` results), **no canonical tag**, and **no robots meta**. 

This is a textbook faceted-navigation SEO problem. With ~10 brands, ~50 categories, ~30 provinces, ~10 industries, ~5 transaction types, and continuous price/year ranges, the combinatorial space of indexable URLs is effectively infinite. Google's "Managing faceted navigation URLs" guidance (https://developers.google.com/crawling/docs/faceted-navigation) explicitly calls this out as a crawl-budget and duplicate-content risk.

### 4.2 Canonical strategy

**Rule: every URL with a query string canonicalizes to the bare path.**

| Requested URL | Canonical |
|---|---|
| `/listings` | `/listings` (self) |
| `/listings?category=excavators` | `/listings` |
| `/listings?category=excavators&brand=caterpillar&minPrice=100000000` | `/listings` |
| `/listings?brand=caterpillar` | `/listings` |
| `/listings?sort=price-asc` | `/listings` |
| `/listings?page=2` | `/listings` (no pagination yet, but rule applies if added) |

This means: **filtered URLs are never the canonical URL of any content.** The canonical is always the bare `/listings`. Filtered URLs are crawlable (for users who arrive via them) but `noindex` (so they don't pollute the index).

### 4.3 Faceted-SEO policy (Google Search Central aligned)

Google's documented preference order for faceted navigation (https://developers.google.com/crawling/docs/faceted-navigation) is:

1. **Don't link to low-value facets** (preferred where possible).
2. **`robots.txt` disallow** of facet URL patterns (e.g. `Disallow: /*?*`).
3. **`noindex` tag** on facet pages.
4. **rel="canonical"** to the canonical category/listings page.

HEAVIX adopts **(2) + (3) + (4) combined**:

- **(2)** robots.txt disallows `*?*` — blocks crawling of all query-string URLs.
- **(3)** `generateMetadata` on `/listings` emits `robots: { index: false, follow: true }` whenever any filter parameter is present (detectable by checking `searchParams` keys against the known filter set).
- **(4)** the same `generateMetadata` emits `alternates.canonical = absoluteUrl("/listings")` (bare) regardless of filters.

The combination is robust: even if Google crawls a filtered URL despite the robots.txt disallow (which happens when external sites link to filtered URLs), the `noindex` + canonical prevents it from being indexed or from competing with the canonical URL.

### 4.4 Sort parameters

Sort params (`?sort=price-asc`, `?sort=newest`, etc.) are the **same content** in a different order. They must canonicalize to the bare URL and `noindex`. They're already covered by the `*?*` disallow + the canonical rule above. No special handling needed beyond what §4.3 specifies.

### 4.5 Pagination (when added)

When `/listings` adds pagination (`?page=2`, `?page=3`):

- **Self-canonical per page**: page 2 canonicalizes to `/listings?page=2` (not to `/listings`). This is the Google-recommended approach for true pagination (as opposed to filtering) — each page has distinct content (different listings) and should be a separate canonical URL.
- **`noindex, follow`** on pages 2+ is acceptable but not required; the self-canonical is sufficient.
- **Do not** use `rel=next`/`rel=prev` — Google deprecated them as ranking signals in 2019. They remain valid crawl hints but are no longer required.
- **Include page 1 in the sitemap only.** Pages 2+ are discoverable via internal links (the pagination UI), not via sitemap. This keeps the sitemap lean.

### 4.6 Category-page filters

`/categories/{slug}` currently fetches 24 listings with no filtering UI. If filters are added later (price/brand/year within a category), the same §4.3 policy applies: filtered variants canonicalize to `/categories/{slug}` (bare) and are `noindex`.

### 4.7 Programmatic SEO landing pages (`/listings/seo/[category]/[city]`)

These are intentionally generated as indexable landing pages. Policy:

- **Indexable only when ≥1 listing exists** for the (category, city) combination. Zero-result landings are `noindex`.
- **Self-canonical** to the exact landing URL.
- **Cap the count** of generated landings to (active categories × cities-with-listings). Do not generate landings for (category, city) pairs that have never had a listing — that is "mass low-quality page generation," forbidden by §10.
- **Sitemap inclusion**: include only landings with ≥1 listing (re-evaluated on each sitemap rebuild, `revalidate = 3600`).
- **Unique content**: each landing must render a unique `<h1>` and unique first-paragraph copy derived from the real category name + city name + listing count. The existing `generateMetadata` in `/listings/seo/[category]/[city]/page.tsx` does this correctly.

### 4.8 Cross-domain duplicate content

If HEAVIX syndicates listings to other marketplaces (the `Listing.sourceUrl` / `Listing.sourceSite` fields suggest scraping/scraped-from scenarios), the inverse risk exists: HEAVIX's content appearing on other sites. Policy:

- HEAVIX listing pages must always point their canonical to the HEAVIX URL, never to the source.
- If a listing is scraped FROM another site (`sourceSite` is set), the listing description should be augmented (not just copied) with HEAVIX-specific data: inspection score, trust badge, price estimate, working hours verification. This makes the HEAVIX page substantively different from the source and avoids being filtered as duplicate.
- AI-generated rewrites (§10) are explicitly **not** a duplicate-content solution — they're for description polish, not for evading duplicate-content detection.

---

## 5. Structured Data (JSON-LD)

### 5.1 General rules

- Emit JSON-LD in `<script type="application/ld+json">` blocks. Multiple types per page are allowed and encouraged (e.g. `Product` + `BreadcrumbList` on a listing page).
- **Never emit a property whose value is `null`, `undefined`, or empty string.** Schema.org parsers and Google's Rich Results Test treat missing properties as "not provided"; empty values trigger warnings. The existing `generateStructuredData` in `src/lib/seo.ts` correctly uses `?? undefined` to omit empty fields.
- **Validate** every JSON-LD payload with the [Rich Results Test](https://search.google.com/test/rich-results) before shipping. CI should run a structural validator (e.g. `schema-dts` TypeScript types) on emitted payloads.
- **Do not** emit `AggregateRating` for the page about the entity being rated (Google's "self-serving review" rule — see §5.6 and https://developers.google.com/search/docs/appearance/structured-data/review-snippet).

### 5.2 Listing detail page — `Product` + `Offer` + `Brand` + `BreadcrumbList`

The listing represents a single machine for sale/rent. The correct schema.org type is `Product` (https://schema.org/Product) with an `Offer` (https://schema.org/Offer). Google's merchant-listing structured-data guide (https://developers.google.com/search/docs/appearance/structured-data/merchant-listing) confirms `Product` + `Offer` is the right pair for product detail pages.

**Required `Product` properties (per schema.org):**
- `name` ← `Listing.title`
- `description` ← `Listing.description` or `Listing.shortDesc`

**Recommended `Product` properties (when data exists):**
- `image` ← array of `ListingImage.url` (absolute URLs)
- `brand` ← `{ "@type": "Brand", "name": Brand.name }` (only if `Listing.brandId` is set)
- `category` ← `Category.name`
- `model` ← `ProductModel.name` (only if `Listing.modelId` is set)
- `sku` ← **omit** (HEAVIX does not assign SKUs to listings; do not fabricate one)
- `mpn` ← **omit** (manufacturer part number — not collected)
- `url` ← canonical URL

**`Offer` (only when `Listing.price` is set and `> 0`):**
- `priceCurrency` ← `"IRR"` (Iranian Rial — all HEAVIX prices are in IRR per `lib/format.ts` `formatFullPrice`)
- `price` ← `String(Number(Listing.price))` (schema.org requires a number or string; `BigInt` must be coerced)
- `availability` ←
  - `https://schema.org/InStock` when `Listing.status === "PUBLISHED"` and `Listing.soldAt === null`
  - `https://schema.org/OutOfStock` when `Listing.soldAt !== null` (see §7 — sold listings)
  - `https://schema.org/Discontinued` when `Listing.status === "EXPIRED"` (rare)
- `url` ← canonical URL
- `priceValidUntil` ← `Listing.expiresAt` (only if set)
- `itemCondition` ← map `Listing.condition` to schema.org enum:
  - `NEW` → `https://schema.org/NewCondition`
  - `USED` → `https://schema.org/UsedCondition`
  - `REFURBISHED` → `https://schema.org/RefurbishedCondition`
  - `DEMOS` / `FAIR` / `GOOD` / `EXCELLENT` → `https://schema.org/UsedCondition` (no fine-grained schema.org enum)
- `areaServed` ← `{ "@type": "City", "name": Listing.city }` (only if `city` is set; Iran-only marketplace)

**Do NOT emit:**
- `Offer.shipping` — HEAVIX does not ship; transport is a separate negotiated service (`TransportRequest` model), not a fixed shipping rate. Emitting fake `shippingDetails` triggers Google Merchant Center rejections.
- `Offer.gtin` / `gtin13` / `gtin8` — not collected.
- `Offer.seller` as a self-review-risky `Organization` with `aggregateRating` — see §5.6.

**Existing helper**: `generateStructuredData("Listing", entity)` in `src/lib/seo.ts` already emits a correct `Product` + `Offer` + `Brand` payload with `priceCurrency: "IRR"` and `availability` mapping for `SOLD` status. **It only needs to be called from the route.**

### 5.3 Should we use `Vehicle` instead of `Product`?

Some HEAVIX listings are vehicles (the schema has a separate `CarModel` model and `domain: "VEHICLE"` on Category). schema.org defines `Vehicle` (https://schema.org/Vehicle) as a subtype of `Product`. Google does not currently produce rich results for `Vehicle` beyond what `Product` already provides, but `Vehicle` adds properties like `vehicleConfiguration`, `vehicleEngine`, `fuelType`, `numberOfForwardGears`, `vehicleTransmission`, which could be filled from `ListingAttributeValue` for vehicle listings.

**Recommendation:**
- Default to `Product` for all listings (consistent, supported).
- For listings where `Category.domain === "VEHICLE"`, **additionally** emit `Vehicle` properties inside the same `Product` node (`"@type": ["Product", "Vehicle"]`). This is valid schema.org (multi-type entities).
- Do not emit `Vehicle`-only properties (`vehicleEngine`, etc.) unless the corresponding `ListingAttributeValue` rows exist for that listing. Emitting empty/null properties is forbidden by §5.1.

### 5.4 `BreadcrumbList` on every indexable page

Use `generateBreadcrumbJsonLd()` from `lib/seo.ts`. Required on:
- `/listings/{slug}` — Home → Listings → {Category} → {Listing title}
- `/categories/{slug}` — Home → Categories → {Parent category?} → {Category}
- `/brands/{slug}` — Home → Brands → {Brand}
- `/models/{slug}` — Home → Brands → {Brand} → {Model}
- `/companies/{slug}` — Home → Companies → {Company}
- `/showroom/{storeSlug}` — Home → Showrooms → {Company}
- `/listings/seo/{category}/{city}` — Home → Listings → {Category} → {City}

`BreadcrumbList` is the single highest-ROI structured-data type: it directly controls the breadcrumb line in Google SERPs, improving CTR. The existing helper is correct and only needs wiring.

### 5.5 `Organization` (on `/companies/{slug}` and `/showroom/{storeSlug}`)

For company/showroom pages, emit `Organization` (https://schema.org/Organization) with real fields:

- `name` ← `Company.name`
- `url` ← `Company.website` or canonical HEAVIX URL
- `logo` ← `{ "@type": "ImageObject", url: Company.logoUrl }` (only if set)
- `description` ← `Company.description`
- `address` ← `{ "@type": "PostalAddress", addressLocality: Company.city, addressRegion: Company.province, streetAddress: Company.address }` (only if at least one of city/province/address is set)
- `telephone` ← `Company.phone` (only if set — see §8 on PII policy; company phone is not PII, it's published business contact)
- `email` ← `Company.email` (only if set)
- `sameAs` ← array of `[Company.website]` (only entries that exist)

Do NOT emit `Organization.foundingDate`, `numberOfEmployees`, `taxID`, `vatID` — not collected, and emitting fabricated values violates §5.1 and §10.

### 5.6 `AggregateRating` — when allowed, when forbidden

Google's review-snippet guidelines (https://developers.google.com/search/docs/appearance/structured-data/review-snippet) explicitly forbid "self-serving" reviews: an entity cannot have reviews about itself displayed as rich results. Google stopped showing review stars for `Organization` and `LocalBusiness` schema in 2019.

The `Review` model in HEAVIX's schema is keyed to `companyId` OR `sellerId` (one must be set), optionally anchored to a `listingId`/`dealRoomId`/`dealId`/`orderId`. Reviews are about **companies or sellers**, not about listings.

**Policy:**

- **`/listings/{slug}` page**: emit `AggregateRating` on the `Product` node **only if** there exist ≥3 `Review` rows where `Review.listingId === listing.id` AND `Review.status === "PUBLISHED"`. Currently the schema supports this (`Review.listingId` exists), but it's rarely populated (most reviews target companies). The existing `lib/seo.ts` `generateStructuredData` does NOT emit `AggregateRating` — correct default. Add it conditionally when review volume justifies.
- **`/companies/{slug}` page**: **do not** emit `AggregateRating` on the `Organization` node. Google will not show stars for Organization anyway, and emitting it risks a manual action if reviews are deemed self-serving. The visible rating UI on the company page (rendered from `Company.avgRating` / `reviewCount`) is fine — it's just not schema-emitted.
- **`/showroom/{storeSlug}` page**: same as company — no `AggregateRating` in JSON-LD.
- **`/brands/{slug}` page**: no reviews are collected for brands. Do not emit `AggregateRating`.
- **`/categories/{slug}` page**: no reviews. Do not emit.

When `AggregateRating` IS emitted (on a `Product` with genuine third-party reviews):
- `ratingValue` ← average of `Review.rating` (1-5)
- `reviewCount` ← count of `PUBLISHED` reviews for that `listingId`
- `bestRating` ← 5, `worstRating` ← 1 (explicit; schema.org defaults differ)
- **Do not** round or inflate. Compute from real `Review` rows.

### 5.7 `WebSite` + `SearchAction` (sitelinks search box)

On the homepage only, emit `WebSite` (https://schema.org/WebSite) with a `potentialAction` of type `SearchAction`. This enables Google's sitelinks search box (when Google chooses to show it).

```json
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "url": "https://havix.ir/",
  "name": "هویکس",
  "potentialAction": {
    "@type": "SearchAction",
    "target": {
      "@type": "EntryPoint",
      "urlTemplate": "https://havix.ir/listings?q={search_term_string}"
    },
    "query-input": "required name=search_term_string"
  }
}
```

This is safe — `/listings?q=...` is the real search endpoint (verified in `src/app/listings/page.tsx` `SearchParams.q`).

### 5.8 `FAQPage` — not recommended (yet)

`FAQPage` schema can produce rich results, but Google significantly reduced FAQ rich results in 2023 (now shown only for "authoritative government and health websites"). HEAVIX is unlikely to qualify. Skip `FAQPage` until Google broadens eligibility again.

### 5.9 `Article` (on `/knowledge/{slug}`)

Already handled by `lib/seo.ts` `generateStructuredData("Article", entity)`. Correctly emits `headline`, `description`, `datePublished`, `image`, `author`, `publisher`. No changes needed beyond wiring it into the route.

---

## 6. Image Optimization

### 6.1 Current state — a defect

The listing detail page (`src/app/listings/[slug]/page.tsx`, lines 226-256) renders images with raw `<img>` tags:

```tsx
<img src={listing.images[0].url} alt={listing.title} className="h-full w-full object-cover" />
```

This bypasses Next.js Image optimization entirely. Consequences:
- No automatic WebP/AVIF conversion.
- No responsive `srcset`.
- No lazy loading by default (the gallery is above the fold, but the thumbnail strip is below).
- No `width`/`height` attributes → Cumulative Layout Shift (CLS) penalty.
- No `priority`/`preload` hint for the LCP image → slower LCP.

### 6.2 Required migration to `next/image`

Replace all `<img>` in public routes with `next/image`'s `<Image>` component. Next.js 16 (verified `next.config.ts` doesn't pin a version, but the codebase uses App Router conventions consistent with 16) introduces `preload` (deprecating `priority` per https://nextjs.org/docs/app/api-reference/components/image). Use:

```tsx
import Image from "next/image";

// Hero (LCP) image — preload
<Image
  src={listing.images[0].url}
  alt={listing.images[0].alt ?? listing.title}
  fill
  sizes="(min-width: 1024px) 66vw, 100vw"
  className="object-cover"
  preload   // Next.js 16 — replaces `priority`
/>

// Thumbnail strip — lazy
{listing.images.slice(1).map((img) => (
  <Image
    key={img.id}
    src={img.url}
    alt={img.alt ?? listing.title}
    width={112}
    height={80}
    sizes="112px"
    className="h-20 w-28 shrink-0 rounded-lg object-cover"
    loading="lazy"
  />
))}
```

### 6.3 `next.config.ts` image config

The current `next.config.ts` has no `images` config. Add (in a future implementation ticket):

```ts
images: {
  formats: ["image/avif", "image/webp"],
  remotePatterns: [
    { protocol: "https", hostname: "**" },  // listing images are user-uploaded to S3/CDN
  ],
  minimumCacheTTL: 86400,
}
```

The `remotePatterns: [{ hostname: "**" }]` is broad — tighten it to the actual CDN hostname once known (do not leave `**` in production; it's an open optimization relay).

### 6.4 Alt-text rules (grounded in real data)

- **Primary image alt**: `ListingImage.alt` if set, else `{Listing.title} — {Brand.name} {year} در {city}`. Never empty alt on the primary image (it's the LCP and conveys content).
- **Gallery thumbnails alt**: `ListingImage.alt` if set, else `"{Listing.title} - تصویر {index}"`. Index makes them distinguishable in screen readers and image search.
- **Category icon alt**: empty `alt=""` (decorative) when the icon is purely visual; the adjacent `<h1>` already names the category.
- **Brand logo alt**: `{Brand.name} لوگو` (e.g. "Caterpillar لوگو"). Logos are content.
- **Company logo alt**: `{Company.name} لوگو`.
- **Decorative UI imagery** (backgrounds, gradients): `alt=""` and `aria-hidden="true"`.

Never put the price, phone number, or "خرید" in alt text — those are spam signals.

### 6.5 Width / height / aspect ratio

- **Hero image**: 16:10 aspect ratio (matches the current `aspect-[16/10]` container). Serve at `1920×1200` max via `next/image` `sizes="(min-width: 1024px) 66vw, 100vw"`.
- **Thumbnails**: 112×80 (current `h-20 w-28`). Fixed dimensions, no responsive variation needed.
- **OG image**: 1200×630 (OGP standard). Generate server-side from the listing's primary image + brand logo + price overlay; cache per-listing.

### 6.6 Image sitemap

Next.js does not auto-generate image sitemaps. Add an image-sitemap section to each listing URL entry in `sitemap.ts`:

```ts
{
  url: `${base}/listings/${l.slug}`,
  lastModified: l.updatedAt,
  images: l.images.map((img) => ({
    url: absoluteUrl(img.url),
    title: l.title,
    caption: img.alt ?? l.title,
    license: absoluteUrl("/license"), // optional
  })),
}
```

This requires fetching `ListingImage` rows alongside listings in `sitemap.ts` (currently not selected — only `id, slug, updatedAt` are fetched). The fetch cost is acceptable; cap at 5 images per listing to bound sitemap size.

### 6.7 Image-named-file SEO

When users upload images, the original filename is often `IMG_20210915_1234.jpg` or `image (1).png` — useless for image search. The CDN should rename uploads to `{brand-slug}-{model-slug}-{listing-slug}-{index}.webp` on ingest. This is a backend change outside this document's scope but worth noting: image search is a meaningful traffic source for industrial machinery (buyers search "Caterpillar 320D" in Google Images).

---

## 7. Sold / Expired Listing Behavior

### 7.1 The lifecycle states

The `Listing` model has these status/lifecycle fields (verified in schema):
- `status` (`String`, default `"PUBLISHED"`) — the primary state. Other values used in the codebase: `DRAFT`, `PENDING`, `REJECTED`, `EXPIRED`, `SOLD` (the latter is referenced in `lib/seo.ts` availability mapping, though the detail page today `notFound()`s on anything non-`PUBLISHED`).
- `soldAt` (`DateTime?`) — when the listing was sold.
- `expiresAt` (`DateTime?`) — when the listing expires.
- `publishedAt` (`DateTime?`) — when it went public.

### 7.2 Current behavior — a defect

The detail page (`/listings/[slug]/page.tsx` line 69):

```ts
if (!listing || listing.status !== "PUBLISHED") notFound();
```

This produces a **404** for every sold, expired, draft, rejected, or pending listing. From an SEO perspective:

- **404 is the wrong signal for sold listings.** Google treats 404 as "temporary error, retry." It keeps re-crawling the URL for days before dropping it. Worse, the 404 wastes the link equity inbound to that URL (e.g. from blog posts, forum mentions, partner sites).
- **404 is acceptable for drafts/rejected/pending** (the page never should have been public).
- **404 is wrong for expired listings** if they have inbound links.

### 7.3 Recommended behavior per state

| `Listing.status` | `soldAt` | Behavior | HTTP | robots | Sitemap | Redirect target |
|---|---|---|---|---|---|---|
| `PUBLISHED` | null | Normal detail page | 200 | index | yes | n/a |
| `PUBLISHED` | set (recent: ≤30 days) | **Keep page live with "Sold" banner** (see §7.4) | 200 | index | yes (for 30 days) | n/a |
| `PUBLISHED` | set (31-90 days) | Keep page live with "Sold" banner; remove from sitemap | 200 | **noindex, follow** | no | n/a |
| `PUBLISHED` | set (>90 days) | **301 redirect** to parent category page | 301 | n/a | no | `/categories/{category.slug}` |
| `SOLD` (explicit status) | set | Same as `PUBLISHED + soldAt` policy above | 200/301 | per age | per age | per age |
| `EXPIRED` | n/a | **410 Gone** for 7 days, then 301 to category | 410 → 301 | noindex | no | `/categories/{category.slug}` |
| `DRAFT` / `PENDING` / `REJECTED` | n/a | **404** (never was public) | 404 | noindex | no | n/a |
| Listing deleted from DB | n/a | **410 Gone** permanently | 410 | n/a | no | n/a |

### 7.4 "Sold" banner page (link-equity preservation)

For the first 30 days after `soldAt`, keep the page live with:
- A prominent "این دستگاه فروخته شد" (sold) banner.
- The original `<h1>`, description, specs, and images intact (so the page remains substantively the same content Google indexed).
- The sidebar CTA replaced with "دستگاه‌های مشابه را ببینید" → links to 4-6 related listings (same category, same brand, ±20% price range).
- `Offer.availability` JSON-LD updated to `https://schema.org/OutOfStock`.
- `<meta name="robots" content="noindex, follow">` after 30 days (keeps the page out of the index but preserves internal link flow to related listings).

This pattern is Google-documented for out-of-stock products (https://www.1digitalagency.com/blog/seo-for-out-of-stock-products-the-definitive-2026-playbook-404-vs-301-vs-do-noth — cites consolidated SEO research; corroborated by Google Search Central's product-page guidance). The principle: don't 404 a page that has inbound links; convert it to a soft-landing page that channels equity to live inventory.

### 7.5 Why 410 for deleted listings (not 404)

Google treats `410 Gone` as "permanently removed, do not retry" and drops the URL from the index faster than `404` (which it interprets as "temporarily unavailable, retry for a few days"). For listings that are intentionally deleted (not sold, not expired — just removed by admin/seller), `410` is the correct signal. Source: Google's John Mueller has confirmed this in multiple Webmaster Central office-hours (corroborated by https://johnpuno.com/blog/when-to-use-410-instead-of-301 and the Google Search Central thread https://support.google.com/webmasters/thread/113895140/correctly-using-a-410-vs-a-301).

### 7.6 Why 301 to category after 90 days

After 90 days of `noindex`, the sold listing has been de-indexed. Continuing to serve a 200 with a sold banner provides diminishing value (the related-listings recommendations become stale as inventory turns over). A `301` to the parent category page:
- Preserves remaining link equity (Google states 301s pass "the vast majority" of PageRank — consolidated research cited by 1digitalagency above).
- Sends users to a live, relevant page (more listings in the same category).
- Avoids the long-tail of dead "sold" URLs accumulating in the sitemap/internal-link graph.

Do NOT 301 to the homepage — that's a "soft 404" pattern Google penalizes. Always 301 to the closest topically-relevant live page (the category).

### 7.7 Implementation note (no code change in this document)

The current route handler does `notFound()` for non-`PUBLISHED` listings. Implementing §7.3-7.4 requires:
1. Loosen the status check: allow `PUBLISHED` + `soldAt != null` (and a separate `SOLD` status if used).
2. Branch on `soldAt` age to render the banner vs. redirect.
3. Add a `notFound()`-equivalent that returns `410` for deleted listings (Next.js supports this via `NextResponse` in route handlers, or by throwing a custom error in a server component caught by `error.tsx` — implementation detail beyond this doc).

---

## 8. Private / Customer Data Protection

### 8.1 What counts as private

The `Listing` model carries several fields that must NEVER appear in indexed HTML, JSON-LD, or sitemaps:

| Field | Sensitivity | Public rendering allowed? |
|---|---|---|
| `Listing.sellerId` | Internal ID | No — never render as text or in JSON-LD `seller.identifier` |
| `Listing.sellerName` | Personal name (PII if individual seller) | Only if seller is a registered company; otherwise no |
| `Listing.sellerPhone` | PII | No — render only the HEAVIX platform phone (`02191008000` as currently done) or behind a "request contact" form |
| `Listing.sourceUrl` | Operational (scraper provenance) | No — never expose; would reveal competitor URLs |
| `Listing.sourceSite` | Operational | No |
| `Listing.adminNotes` | Internal moderation notes | No |
| `Listing.companyId` | Internal ID | No as raw ID; the company public page (`/companies/{slug}`) is fine to link |
| `Listing.seller` (User relation) | Personal data | No — never render `User.email`, `User.phone`, `User.name` directly |

### 8.2 Routes that must remain `noindex` (already in robots.txt)

Verified in `src/app/robots.ts`:
- `/admin/` — admin panel (also auth-gated)
- `/api/` — API surface (returns JSON, not HTML; some endpoints may serve public data but should set `X-Robots-Tag: noindex` on responses)
- `/dashboard/` — user dashboard (auth-gated)
- `/seller/` — seller workspace (auth-gated)
- `/login`, `/register` — auth pages

**Recommended additions** (per §3.4):
- `/preview/` — preview links (`/preview/page/{key}`) must be `noindex, nofollow` unconditionally. Preview keys are shareable but must never be indexed. Add `X-Robots-Tag: noindex, nofollow` to the response headers in `src/app/preview/page/[key]/page.tsx`.
- `/favorites`, `/messages`, `/compare`, `/rfq`, `/requests` — user-scoped or UGC routes.

### 8.3 `X-Robots-Tag` HTTP header (defense in depth)

For API routes that return JSON containing potentially private data (e.g. `/api/listings/[id]` returns the full listing including `sellerPhone`), set the `X-Robots-Tag: noindex` response header. Even though `/api/` is disallowed in robots.txt, the `X-Robots-Tag` header is the authoritative signal that Google respects for non-HTML responses. Pattern:

```ts
// src/app/api/listings/[id]/route.ts
return Response.json(data, {
  headers: { "X-Robots-Tag": "noindex" }
});
```

This is especially important for the listing API because it returns `sellerPhone` and `sellerName` to authenticated clients; even though authentication is required, the response itself must be marked non-indexable in case a misconfigured proxy or CDN caches it publicly.

### 8.4 JSON-LD `seller` field — PII trap

Schema.org `Offer.seller` accepts an `Organization` or `Person`. **Never emit `Person`** for the seller — that would put a personal name + phone into structured data Google can index. Always emit `Organization` referencing the `Company` (when `Listing.companyId` is set):

```json
"seller": {
  "@type": "Organization",
  "name": "Company.name",
  "url": "https://havix.ir/companies/{company.slug}"
}
```

For individual sellers (no `companyId`), **omit `seller` from the Offer entirely**. Do not emit a `Person` node with the seller's name — that's PII in JSON-LD.

### 8.5 Review author privacy

The `Review` model has `authorId` (User) and optional `author` display name. When rendering reviews publicly (on company pages), display only:
- The review rating, title, body.
- A display name (NOT the User's real name or email) — either a screen name or "خریدار تأییدشده" (verified buyer).
- `verifiedDeal: true` badge (from `Review.verifiedDeal`).

Never render `authorId`, `author.email`, `author.phone`, `dealRoomId`, `dealId`, `orderId` in public HTML or JSON-LD. The `Review` JSON-LD node (when emitted per §5.6) should include only `reviewRating`, `author` (as `Person` with `name` = display name only), `datePublished`, `reviewBody`.

### 8.6 Sitemap privacy

The sitemap (`src/app/sitemap.ts`) currently includes only `PUBLISHED` listings, active categories/brands, and published articles. This is correct. **Do not** add:
- Draft/pending/rejected listings (would leak upcoming inventory to competitors).
- Private companies (status ≠ `ACTIVE`).
- Inactive brands.
- Admin/internal pages.

The sitemap is a public document — anyone can fetch `/sitemap.xml` and see the full list of indexable URLs. Treat it as such.

### 8.7 Search-result snippet PII

Per §2.6, never put `Company.phone` or `Company.email` in `meta description` or `og:description`. Google may display the meta description verbatim in SERPs, exposing the phone number to scrapers and bots that harvest contact info. Phone/email belong in visible page content (where the user has chosen to visit HEAVIX) but not in machine-readable snippet fields.

---

## 9. Measurement — KPIs and Baselines

### 9.1 KPI definitions

| KPI | Definition | Source | Frequency |
|---|---|---|---|
| **Impressions** | Times HEAVIX URLs appeared in Google search results | Google Search Console (GSC) | daily |
| **Clicks** | Clicks from Google search to HEAVIX | GSC | daily |
| **CTR** (click-through rate) | Clicks ÷ Impressions, per page type | GSC | weekly |
| **Average position** | Mean ranking position for queries triggering HEAVIX results | GSC | weekly |
| **Indexed pages** | Count of HEAVIX URLs in Google's index (Page Indexing report) | GSC | weekly |
| **Coverage gap** | Submitted URLs (sitemap) − Indexed URLs | GSC | weekly |
| **Organic sessions** | Sessions landing on HEAVIX with source = organic search | GA4 (or server-side analytics via `trackEvent`) | daily |
| **Organic conversion** | Organic-search sessions that produce a `LISTING_VIEW` → `MESSAGE_SEND` → `DEAL_ROOM_START` funnel completion | `trackEvent` analytics (`src/lib/analytics.ts`) joined with session source | weekly |
| **Organic RFQ submissions** | RFQ forms submitted from organic-search sessions | `trackEvent` (`RFQ_SUBMIT`) + session source | weekly |
| **Per-page-type CTR** | CTR broken down by `/listings/{slug}` vs `/categories/{slug}` vs `/brands/{slug}` vs `/listings/seo/*` | GSC (URL filter) | weekly |
| **Crawl budget burn** | Pages crawled per day by Googlebot | GSC > Crawl Stats | weekly |
| **Core Web Vitals** | LCP, INP, CLS per URL | GSC > Core Web Vitals + CrUX | monthly |
| **Structured-data errors** | Rich Results Test errors + GSC > Enhancements report | GSC | weekly |
| **Sitemap submission vs. indexed** | Sitemap-reported URLs vs. indexed URLs | GSC > Sitemaps | weekly |

### 9.2 Baseline capture (BEFORE targets)

Before setting any SEO growth target, capture a 30-day baseline of every KPI above. This is non-negotiable: without a baseline, "we improved SEO by 30%" is unfalsifiable.

**Baseline procedure:**
1. Verify the property in Google Search Console (DNS TXT record or HTML file). The site URL is `https://havix.ir` (from `NEXT_PUBLIC_SITE_URL` default in `lib/seo.ts`).
2. Submit `/sitemap.xml` in GSC > Sitemaps.
3. Wait 30 days. Do not deploy any SEO changes during the baseline window (the metadata fixes in §2 are tempting — resist; ship them after baseline).
4. Export GSC performance data (Impressions, Clicks, CTR, Position) filtered by:
   - All URLs
   - `/listings/*` (regex: `^/listings/`)
   - `/categories/*`
   - `/brands/*`
   - `/models/*`
   - `/companies/*`
   - `/listings/seo/*`
5. Record the baseline in a dated doc (e.g. `docs/product/SEO-BASELINE-2026-10.md`).
6. After baseline, deploy the §2 metadata fixes and resume measurement. Compare 30-day-post-fix vs. 30-day-baseline.

### 9.3 Targets (post-baseline only)

Targets are set **after** the baseline is captured, not before. Tentative targets (to be calibrated against baseline):

| KPI | Baseline | 90-day target | 180-day target |
|---|---|---|---|
| Impressions (total) | TBD | +50% vs baseline | +150% vs baseline |
| Clicks (total) | TBD | +40% | +120% |
| Average CTR (listing detail) | TBD | ≥ 3.0% | ≥ 4.5% |
| Indexed pages | TBD | ≥ 90% of sitemap | ≥ 95% of sitemap |
| Coverage gap | TBD | ≤ 10% | ≤ 5% |
| Organic sessions | TBD | +40% | +120% |
| Structured-data errors | TBD | 0 critical | 0 critical, ≤ 5 warnings |

These numbers are placeholders. Real targets are derived from baseline + market size + the addressable query volume for "ماشین آلات سنگین" and related queries in Iran.

### 9.4 Instrumentation

- **Google Search Console**: primary source for impressions/clicks/position. No code change needed; just verify the property.
- **GA4**: optional, for organic-session attribution. If GA4 is not desired (privacy/cookie-consent complexity), the existing `trackEvent` server-side analytics (`src/lib/analytics.ts`) can capture organic sessions by inspecting the `Referer` header for `google.com` / `bing.com` / `yandex.com`.
- **Server-side `trackEvent`**: already fires `LISTING_VIEW` on the listing detail page (line 159 of `/listings/[slug]/page.tsx`). Add `LISTING_VIEW_FROM_SEARCH` events by checking `request.headers.get("referer")` for search-engine domains. This gives a server-side organic-conversion signal independent of GA4.
- **CrUX (Chrome User Experience Report)**: real-user Core Web Vitals. Accessible via GSC > Core Web Vitals. No code change; field data is automatic once the site is on HTTPS and has enough traffic.

### 9.5 Dashboard

Build a simple admin dashboard (or extend the existing `/admin/analytics/page.tsx`) showing the 9.1 KPIs over time. The data source is the GSC API (https://developers.google.com/webmaster-tools/v1/searchanalytics) — authenticated via a service account. This is implementation work outside this document.

### 9.6 Anti-metrics (what NOT to optimize)

- **Total page count** — index-bloat is a risk, not a goal. More indexed pages with thin content (e.g. zero-result programmatic landings) HURTS SEO.
- **Keyword density** — Google has ignored keyword density since ~2010. Chasing it produces spam.
- **Domain Authority / Page Authority ( Moz metrics )** — correlation metrics, not ranking signals. Track them as a sanity check, never as a target.
- **Number of backlinks (raw count)** — quality > quantity. One link from an industry-association site outweighs 1,000 directory links.

---

## 10. AI Role — Content Generation with Human Review Gate

### 10.1 What AI MAY do

- **Draft listing descriptions** from structured inputs (brand, model, year, working hours, condition, city). The AI proposes a paragraph of Persian marketing copy; the seller reviews and edits before publishing.
- **Translate** brand/category/model names between Persian and English for `nameEn` fields, `BrandSEO`, `SEOMetadata.metaDescription`.
- **Generate `meta description` candidates** from the listing's real fields (per §2.2 template), presented to the seller/admin as a suggestion. The seller/admin approves or edits.
- **Suggest `keywords`** for the `SEOMetadata.keywords` field (low SEO value today, but populated for internal search).
- **Draft programmatic-SEO landing page copy** for `/listings/seo/{category}/{city}` — the AI generates a unique first paragraph per (category, city) pair, grounded in the real listing count and category description.
- **Generate OG image variations** (background, color, layout) for A/B testing — purely visual, no factual claims.
- **Draft article content** for `/knowledge/*` (the existing `generate-article` admin route already does this).

### 10.2 What AI MUST NOT do

- **Generate technical specifications.** Specs come from `ListingAttributeValue` rows, which are seller-input or expert-verified (per `sourceType` field: `SELLER_INPUT` / `EXPERT_VERIFIED` / etc.). AI must not invent specs to "fill in" missing values. A missing spec is a missing spec — leave it empty.
- **Generate prices or price estimates.** `Listing.price` is seller-set. The HEAVIX Price Estimate Engine (`PriceEstimate` model, `src/components/listings/PriceEstimateCard.tsx`) is a deterministic algorithm, not AI — and its output is clearly labeled as an estimate. AI must not generate "estimated price: X" text.
- **Generate inspection scores or trust claims.** `Inspection.score` is set by a human inspector. `Listing.verified` is set by the moderation team. AI must not generate "کارشناسی‌شده توسط هویکس" or similar trust claims for listings that have not been inspected.
- **Generate reviews or ratings.** `Review` rows must come from real users who completed real deals. AI-generated reviews are fraud and violate Google's review-snippet guidelines (immediate manual action + potential legal liability).
- **Generate "mass" low-quality pages.** Creating 10,000 programmatic landing pages with AI-generated thin content (e.g. "خرید {machine} در {city}" with 50 words of boilerplate) is the textbook "doorway page" pattern Google penalizes (https://developers.google.com/search/docs/essentials/spam-policies). Each programmatic landing MUST have at least one real listing backing it (per §4.7).
- **Auto-publish SEO content without human review.** All AI-generated `meta description`, `keywords`, `structuredData` overrides, and landing-page copy must pass through a human-review gate before being persisted to `SEOMetadata` or rendered publicly.

### 10.3 Human-review gate (mandatory)

Every AI-generated SEO content artifact follows this pipeline:

```
AI generates draft  →  human reviews  →  human approves/edits  →  persist to SEOMetadata  →  public
       ↓                   ↓                    ↓                       ↓                      ↓
   draft state        review queue         approved state         persisted               indexed
```

**Concrete implementation requirements (when built):**
1. AI output is stored in a `SEOMetadataDraft` table (or a `draft` JSON column on `SEOMetadata`) — never directly in `metaTitle`/`metaDescription`/`structuredData`.
2. The admin SEO page (`/admin/seo/SEOAdminClient.tsx`) shows a "Pending AI review" queue with diff view (current vs. AI-proposed).
3. A human reviewer clicks Approve, Edit, or Reject. Only Approve or Edit persists to the live `SEOMetadata` fields.
4. Every approved AI edit is audit-logged (the `AuditLog` model already exists — record `action = "SEO_AI_APPROVE"`, `entityType`, `entityId`, `userId`).
5. The reviewer must be a user with the `seo.manage` permission (per the unified permission matrix in ADR-005 §7).

### 10.4 Reconciliation rule (AI output vs. real data)

When AI generates content that references real entity data (price, year, brand, city, specs), the output MUST be reconciled against the source-of-truth before persistence:

| AI claim | Source of truth | Reconciliation |
|---|---|---|
| "قیمت این دستگاه X تومان" | `Listing.price` | AI's number must equal `Listing.price` (within 0 tolerance). Reject if mismatched. |
| "سال ساخت Y" | `Listing.year` | Must equal `Listing.year`. Reject if mismatched. |
| "برند Z" | `Brand.name` (via `Listing.brandId`) | Must match. Reject if mismatched. |
| "کارکرد W ساعت" | `Listing.workingHours` | Must match. Reject if mismatched. |
| "در شهر C" | `Listing.city` | Must match. Reject if mismatched. |
| "کارشناسی‌شده" | `Listing.verified === true` AND `Inspection.score != null` | Reject AI claim if either is false. |
| "نمایشگاه VIP" | `Showroom.isActive` AND valid `PremiumSubscription` | Reject AI claim if either is false. |

The reconciliation is a deterministic check (not AI). It runs on every AI-proposed draft before the human sees it. Drafts that fail reconciliation are flagged "AI output mismatched real data — do not publish" and discarded.

### 10.5 AI-content provenance

Every public page that includes AI-generated prose (e.g. a listing description written by AI) should be marked in the database with a `contentSource` field (`"AI_DRAFT" | "AI_REVIEWED" | "HUMAN" | "SELLER"`). This is for internal audit and for compliance with future AI-content disclosure regulations. It is NOT rendered in public HTML or JSON-LD (Google does not require AI-content disclosure in schema.org today, but the provenance must be retrievable on demand).

### 10.6 The single forbidden pattern

**Mass low-quality page generation is FORBIDDEN.** Specifically forbidden:

- Generating `/listings/seo/{category}/{city}` pages for (category, city) pairs with zero listings.
- Generating "buying guide" articles (`/knowledge/*`) by AI-templating `{category} buying guide` with boilerplate, without a human editorial pass.
- Generating brand pages for brands with no listings and no real brand data.
- Generating model pages for models with no listings.
- Auto-generating `meta description` for thousands of listings without human spot-check (a sample-based review — e.g. 5% of AI descriptions reviewed by a human — is acceptable; zero review is not).

The principle: **AI scales the SEO team's output; it does not replace the team's judgment.** Every indexable page must have a human-approved reason to exist and human-approved content describing it.

---

## 11. Implementation Sequencing (reference, not a commitment)

This document is specification-only. The following is a suggested implementation order for future tickets; it is NOT a commitment and is NOT executed by this task.

1. **PR-SEO-01 (highest leverage, lowest risk)**: Add `generateMetadata` to the 4 detail pages (`/listings/[slug]`, `/brands/[slug]`, `/categories/[slug]`, `/models/[slug]`, `/companies/[slug]`). Wire in the existing `lib/seo.ts` helpers. No behavior change beyond title/description/OG/canonical.
2. **PR-SEO-02**: Add JSON-LD `<script>` injection to the same 5 pages using `generateStructuredData` + `generateBreadcrumbJsonLd`. Validate with Rich Results Test on staging.
3. **PR-SEO-03**: Add `noindex` + canonical to `/listings` (filter/sort/pagination variants). Update `robots.ts` to disallow `*?*`.
4. **PR-SEO-04**: Implement sold/expired listing behavior per §7.3. Requires loosening the `notFound()` check and adding banner/redirect logic.
5. **PR-SEO-05**: Migrate listing detail images to `next/image` (§6). Add `images` config to `next.config.ts`.
6. **PR-SEO-06**: Add `/models/*`, `/companies/*`, `/listings/seo/*` to `sitemap.ts`. Add image-sitemap entries to listing URLs.
7. **PR-SEO-07**: Sitemap sharding (when listing count crosses 5,000).
8. **PR-SEO-08**: When `/showroom/[slug]` ships (per ADR-005 §2), apply the §1.6 index policy in the same PR.
9. **PR-SEO-09**: AI-content review gate (§10.3) — `SEOMetadataDraft` table, admin review queue, reconciliation logic.
10. **PR-SEO-10**: Measurement — GSC verification, baseline capture, dashboard.

---

## 12. References

### Schema.org (canonical type definitions)
- Product: https://schema.org/Product
- Offer: https://schema.org/Offer
- Vehicle: https://schema.org/Vehicle
- Brand: https://schema.org/Brand
- Organization: https://schema.org/Organization
- BreadcrumbList: https://schema.org/BreadcrumbList
- Review: https://schema.org/Review
- AggregateRating: https://schema.org/AggregateRating
- WebSite / SearchAction: https://schema.org/WebSite
- ImageObject: https://schema.org/ImageObject
- PriceSpecification: https://schema.org/PriceSpecification

### Google Search Central (official guidance)
- Merchant listing structured data: https://developers.google.com/search/docs/appearance/structured-data/merchant-listing
- Review snippet (Review, AggregateRating) — including self-serving review prohibition: https://developers.google.com/search/docs/appearance/structured-data/review-snippet
- Managing faceted navigation URLs: https://developers.google.com/crawling/docs/faceted-navigation
- Large sitemaps (sharding): https://developers.google.com/search/docs/crawling-indexing/sitemaps/large-sitemaps
- Spam policies (doorway pages, mass low-quality content): https://developers.google.com/search/docs/essentials/spam-policies
- Robots meta tag / X-Robots-Tag: https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag
- Canonical URLs: https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls
- Product page best practices (out-of-stock handling): https://developers.google.com/search/docs/appearance/structured-data/product

### sitemaps.org (protocol spec)
- Sitemap protocol (50,000 URLs / 50 MB limit): https://www.sitemaps.org/protocol.html

### Next.js (framework docs)
- Image component (Next.js 16, `preload` deprecates `priority`): https://nextjs.org/docs/app/api-reference/components/image
- Metadata files (sitemap.ts, robots.ts): https://nextjs.org/docs/app/api-reference/file-conventions/metadata
- generateMetadata: https://nextjs.org/docs/app/api-reference/functions/generate-metadata

### Community / practitioner references (cited for context, not canonical)
- 301 vs 410 for deleted/sold product pages (consolidated research): https://www.1digitalagency.com/blog/seo-for-out-of-stock-products-the-definitive-2026-playbook-404-vs-301-vs-do-noth
- Faceted navigation indexation decision matrix: https://www.digitalapplied.com/blog/faceted-navigation-indexation-2026-seo-decision-matrix
- Google Search Central community thread on 410 vs 301: https://support.google.com/webmasters/thread/113895140/correctly-using-a-410-vs-a-301
- AggregateRating self-serving review guidance: https://support.google.com/webmasters/thread/263586515/aggregaterating-guidelines-concerns-solved

### Internal (HEAVIX codebase)
- `prisma/schema.prisma` — Listing (line 444), Brand (line 17), Category (line 162), ProductModel (line 393), Company (line 1177), ListingImage (line 535), Review (line 2290), SEOMetadata (line 1936), BrandSEO (line 138), PremiumSubscription (line 1126), Inspection (line 1351), MachinePassport (line 1149).
- `src/app/robots.ts` — current robots.txt (disallows `/admin/`, `/api/`, `/dashboard/`, `/seller/`, `/login`, `/register`).
- `src/app/sitemap.ts` — current sitemap (static + categories + brands + listings + articles; honors `SEOMetadata.robotsIndex = false`; `revalidate = 3600`).
- `src/lib/seo.ts` — existing helpers (`generateMetaTitle`, `generateMetaDescription`, `generateStructuredData`, `generateBreadcrumbJsonLd`, `getSEO`, `upsertSEO`, `absoluteUrl`). NOT currently consumed by any public route.
- `src/app/listings/[slug]/page.tsx` — listing detail; `notFound()` on non-PUBLISHED; no `generateMetadata`; raw `<img>`.
- `src/app/listings/seo/[category]/[city]/page.tsx` — the only public route with `generateMetadata` today.
- `src/app/listings/page.tsx` — listings index; 21+ query params; `take: 60`; no pagination; no canonical; no robots meta.
- `docs/ADR-005-store-center-architecture.md` — §1 Company.storeSlug, §2 Showroom model + VIP enforcement.

---

## Appendix A — Quick-Reference: Index Policy per Route

```
INDEXABLE (index, follow, in sitemap):
  /                                            priority 1.0  daily
  /listings                                    priority 0.9  daily
  /listings/{slug}  (PUBLISHED, not sold)      priority 0.7  weekly
  /categories/{slug} (active, CATALOG layer)   priority 0.6  weekly
  /brands/{slug}    (active)                   priority 0.6  weekly
  /models/{slug}    (ACTIVE, unique slug)      priority 0.5  weekly
  /companies/{slug} (status=ACTIVE)            priority 0.5  weekly
  /showroom/{storeSlug} (active + valid VIP)   priority 0.6  weekly   [when implemented]
  /listings/seo/{cat}/{city} (≥1 result)       priority 0.5  weekly
  /knowledge/{slug} (PUBLISHED)                priority 0.5  monthly

NOINDEX, FOLLOW (in sitemap: no):
  /listings?{any query}                        filtered/sorted/paginated variants
  /listings/{slug} (sold, 31-90 days)          sold banner page
  /categories/{slug} (MARKETPLACE/SERVICE/FALLBACK layer or inactive)
  /brands/{slug} (inactive)
  /models/{slug} (slug collides across brands — §1.4)
  /companies/{slug} (status ≠ ACTIVE)
  /listings/seo/{cat}/{city} (0 results)
  /auctions, /auctions/{id}
  /sell-in-7-days/*
  /transport/request, /find-my-need, /machine-hunt, /community, /market-insights

NOINDEX, NOFOLLOW (in sitemap: no):
  /rfq, /rfq/{id}, /rfq/new
  /requests
  /compare, /compare/{id}
  /preview/page/{key}
  /showroom/{storeSlug} (inactive / expired VIP — also 404)

DISALLOW in robots.txt (never crawled):
  /admin/, /api/, /dashboard/, /seller/, /login, /register,
  /favorites, /messages
  *?*   (all query-string URLs — §3.4)

HTTP status signals:
  200  normal indexable page
  301  sold listing >90 days → parent category; trailing-slash/case normalization
  404  draft/pending/rejected listing; unknown slug
  410  deleted listing (permanent removal); expired listing (7 days, then 301)
  403  management route access denied (not indexed)
```

---

## Appendix B — Existing Public Routes Audited

The following public (non-`/admin`, non-`/api`, non-`/dashboard`, non-`/seller`) routes were identified in `src/app/` and considered for SEO policy in this document:

**Catalog / marketplace (indexable per §3.2):**
- `/` (homepage)
- `/listings` (browse/search index)
- `/listings/[slug]` (listing detail — the primary machine page)
- `/listings/seo/[category]/[city]` (programmatic SEO landing)
- `/categories/[slug]`
- `/brands`, `/brands/[slug]`
- `/models/[slug]`
- `/companies`, `/companies/[slug]`
- `/brand-families/[slug]`
- `/knowledge`, `/knowledge/[slug]`

**Tools / conversion funnels (noindex per §3.2):**
- `/compare`
- `/rfq`, `/rfq/new`, `/rfq/[id]`
- `/requests/new`
- `/find-my-need`
- `/machine-hunt`
- `/community`
- `/market-insights`
- `/transport/request`
- `/sell-in-7-days`, `/sell-in-7-days/register`, `/sell-in-7-days/track`
- `/auctions`, `/auctions/[id]`
- `/rentals`
- `/store` (the store hub — index policy TBD; currently in sitemap at priority 0.7)
- `/preview/page/[key]`

**Authentication (disallow in robots.txt):**
- `/login`, `/register`

**Not yet implemented (forward-looking):**
- `/showroom/[storeSlug]` — specified in ADR-005 §2; index policy per §1.6.

The document's recommendations apply to the **catalog / marketplace** set. The tools/funnels set is uniformly `noindex, follow` (or `noindex, nofollow` for UGC/private pages).
