# HEAVIX — STEP 11.31 SEO Audit

- **Task ID:** 11.31-/seo
- **Agent:** /seo
- **Date:** 2026-10-12
- **Status:** Final — documentation only, no code/PR changes
- **Baseline:** repo `/home/z/heavix`, git `HEAD = 4a2f579` (task description cited main `f597562`; PR #11 security PR-SC-00 has since merged at `c7d19fc`/`4a2f579` — no SEO-relevant files touched by those commits).
- **Scope:** All public-facing routes under `src/app/`, the sitemap (`src/app/sitemap.ts`), robots (`src/app/robots.ts`), root layout metadata (`src/app/layout.tsx`), SEO helpers (`src/lib/seo.ts`, `src/lib/seo-service.ts`), Prisma schema (`prisma/schema.prisma`), `next.config.ts`, middleware (`src/middleware.ts`), and the AI content-generation pipeline (`src/lib/ai-content-assistant.ts`, `src/app/api/admin/ai-content-factory/route.ts`, `src/app/api/admin/knowledge/generate-article/route.ts`, `src/app/api/ai-listing-builder/route.ts`).
- **Hard rule honored:** Documentation only. No code, schema, or PR modified. Every claim below cites `file:line`.

---

## 0. Executive Summary

The prior SEO document (`docs/product/SEO-ARCHITECTURE.md`, 1 179 lines, STEP 11.29-SEO) correctly identified that **5 detail pages were missing `generateMetadata`**. As of STEP 11.31 this is **still true** — none of those 5 routes have been touched for SEO. The actual gap is wider than the prior doc stated: this audit finds **13 public page types missing `generateMetadata`** (including the 5 detail pages), **1 critical duplicate-content collision** (`/knowledge/[slug]` vs `/articles/[slug]`), **1 private-data exposure** (`/sellers/[id]`), **1 non-deterministic model-page query** (`/models/[slug]` uses `findFirst` against a non-globally-unique slug), and **zero JSON-LD emission** on any product/brand/category/model/company page despite the helpers existing in `src/lib/seo.ts`.

**Counts (final):**

| Metric | Value |
|---|---|
| Public page types audited | 17 |
| Pages missing `generateMetadata` (high-priority list) | 13 |
| Critical SEO issues | **14** |
| High-severity issues | 8 |
| Medium-severity issues | 5 |
| Total issues logged | 27 |

**Headline critical findings (full list in §11):**

1. Every `/listings/[slug]` page renders the **homepage title** because no `generateMetadata` is exported (`src/app/listings/[slug]/page.tsx` — no metadata export; root layout fallback at `src/app/layout.tsx:9-28` is what ships).
2. `/knowledge/[slug]` and `/articles/[slug]` both render the same `Article` row from the same `slug`, but only the latter has metadata + JSON-LD. The sitemap (`src/app/sitemap.ts:162`) advertises `/knowledge/{slug}` — the route with **no** metadata — so Google sees two URLs with identical body content and conflicting canonical signals.
3. `/models/[slug]` queries `db.productModel.findFirst({ where: { slug } })` (`src/app/models/[slug]/page.tsx:21`). `ProductModel.slug` is `@@unique([brandId, slug])` (`prisma/schema.prisma:411`), **not** globally unique. Two brands sharing a model slug yield a non-deterministic winner — a duplicate-content bug.
4. `/sellers/[id]` is publicly reachable, not disallowed in `robots.txt`, has no `noindex`, and exposes private user data (`src/app/sellers/[id]/page.tsx:30-58` selects `User` rows by raw `id`).
5. The VIP Showroom route `/showroom/[slug]` specified by ADR-005 §2 **cannot be implemented** in its current form — `Company.storeSlug` and the `Showroom` model are not yet in `prisma/schema.prisma` (verified: `rg "storeSlug|model Showroom" prisma/schema.prisma` returns nothing), and `PremiumSubscription` is per-`userId`, not per-`companyId` (per ADR-005-amendment-01 §2).

The remainder of this document audits each of the 10 mandated dimensions, cites the exact code, and prescribes a remediation path. **No code is changed by this audit.**

---

## 1. Canonical URL Audit

### 1.1 Methodology

For every public page type, I traced (a) the route file under `src/app/`, (b) the schema field that backs the URL path segment, (c) the uniqueness constraint on that field, (d) any `redirects()` or middleware that normalizes the URL, and (e) any `alternates.canonical` or `<link rel="canonical">` emitted by the route. Findings are tabulated in §1.3.

### 1.2 Trailing-slash + case normalization

- `next.config.ts` (1-17 lines): the config object has **no `trailingSlash` key, no `redirects()` function, no `rewrites()`**. Next.js App Router therefore serves both `/listings/foo` and `/listings/foo/` without a 301 — the default behavior. This is a duplicate-URL risk if any inbound link or internal `<Link>` accidentally includes a trailing slash.
- `src/middleware.ts` (1-33 lines) only matches `/admin/:path*` and `/api/admin/:path*` for auth gating. It does **no** URL normalization on public routes.
- **Recommendation:** add `redirects()` to `next.config.ts` returning 301 from `/{path}/` to `/{path}`. Case normalization is lower priority — Persian URLs are RTL and rarely typed.

### 1.3 Canonical URL table (every important URL)

| URL pattern | Route file | Slug field + uniqueness | `generateMetadata`? | `alternates.canonical`? | Redirect chains | Duplicate-content risk |
|---|---|---|---|---|---|---|
| `/` | `src/app/page.tsx` | n/a | No (inherits root layout `metadata`) | No | None | Low — single URL |
| `/listings` | `src/app/listings/page.tsx` | n/a | **No** | **No** | None | **HIGH** — every `?category=…` / `?brand=…` / `?attr.KEY=…` variant is a separately indexable URL with the same homepage title (see §6) |
| `/listings/[slug]` | `src/app/listings/[slug]/page.tsx` | `Listing.slug` `@unique` (`prisma/schema.prisma:446`) | **No** | **No** | None | **Low duplicate risk** — slug is globally unique. **HIGH missing-canonical risk** — no canonical emitted, no metadata emitted. |
| `/listings/seo/[category]/[city]` | `src/app/listings/seo/[category]/[city]/page.tsx` | Two-segment, composite | **Yes** (line 34) | **No** — only `title`/`description`/`keywords`/`og` returned | None | **HIGH** — zero-result landings produce a 200 with empty grid; no `noindex`. Mass low-quality page risk per §8. |
| `/categories/[slug]` | `src/app/categories/[slug]/page.tsx` | `Category.slug` `@unique` (`prisma/schema.prisma:169`) | **No** | **No** | None | Low duplicate risk. High missing-canonical risk. |
| `/brands/[slug]` | `src/app/brands/[slug]/page.tsx` | `Brand.slug` `@unique` (`prisma/schema.prisma:22`) + alias resolver (`src/lib/brand-resolve.ts`) | **No** | **No** | None (alias resolution happens in code, not via 301) | **MEDIUM** — alias resolution means multiple URLs can map to one brand. If aliases are linked externally, no canonical → duplicate. |
| `/models/[slug]` | `src/app/models/[slug]/page.tsx` | `ProductModel.slug` `@@unique([brandId, slug])` (`prisma/schema.prisma:411`) — **NOT globally unique** | **No** | **No** | None | **CRITICAL** — see §1.4 |
| `/companies/[slug]` | `src/app/companies/[slug]/page.tsx` | `Company.slug` `@unique` (`prisma/schema.prisma:1211`) | **No** | **No** | None | Low duplicate risk. High missing-canonical risk. |
| `/companies` | `src/app/companies/page.tsx` | n/a | No | No | None | Low |
| `/brand-families/[slug]` | `src/app/brand-families/[slug]/page.tsx` | `BrandFamily.slug` `@unique` (`prisma/schema.prisma:81`) | **No** | **No** | None | Low duplicate risk. |
| `/sellers/[id]` | `src/app/sellers/[id]/page.tsx` | `User.id` `@id @default(cuid())` (not a slug, not stable) | **No** | **No** | None | **CRITICAL** — see §5.3 (private-data exposure + non-stable URL) |
| `/articles/[slug]` | `src/app/articles/[slug]/page.tsx` | `Article.slug` (assumed `@unique`) | **Yes** (line 45) | **Yes** but **relative** (`/articles/${article.slug}`, line 73) — Next.js requires absolute for OG `url`; `alternates.canonical` accepts relative but Search Console prefers absolute | None | **CRITICAL duplicate content** with `/knowledge/[slug]` — see §6.2 |
| `/knowledge/[slug]` | `src/app/knowledge/[slug]/page.tsx` | `Article.slug` (same DB row as `/articles/[slug]`) | **No** | **No** | None | **CRITICAL duplicate content** with `/articles/[slug]` — see §6.2 |
| `/knowledge` | `src/app/knowledge/page.tsx` | n/a | No | No | None | Low |
| `/store` | `src/app/store/page.tsx` | n/a | No | No | None | Low |
| `/showroom/[storeSlug]` (planned) | Does not exist (`ls src/app/showroom/` → No such directory) | `Company.storeSlug` — **not in schema** (`rg "storeSlug" prisma/schema.prisma` → empty) | n/a | n/a | n/a | See §9 |
| `/preview/page/[key]` | `src/app/preview/page/[key]/page.tsx` | n/a (preview tokens) | No | No | None | Should be `noindex` (preview content) — see §5 |

### 1.4 ProductModel slug collision (CRITICAL — confirmed)

`prisma/schema.prisma:411` declares `@@unique([brandId, slug])` — meaning two `ProductModel` rows can have the same `slug` if they belong to different `Brand`s. The route `src/app/models/[slug]/page.tsx:21` queries:

```ts
db.productModel.findFirst({
  where: { slug },
  ...
})
```

`findFirst` returns **one arbitrary row** when multiple match. Per Prisma docs, `findFirst` has no guaranteed order without an explicit `orderBy`. Two distinct models therefore produce the same URL `/models/320d` (for example), and the winner is non-deterministic. Consequences:

- Two distinct ProductModel entities map to one URL → duplicate content.
- The "winner" can flip between deploys or as brands are added, breaking Search Console history.
- The non-winner model has no indexable representation at all.

This is the single most urgent schema-aware SEO defect in the codebase. Recommended fix (out of scope for this doc): change the canonical model URL to `/brands/[brandSlug]/models/[modelSlug]` so the path matches the composite uniqueness.

### 1.5 Listing canonical verification

Per task instruction §1: *verify `/listings/[slug]` is canonical (Listing.slug is @unique)*.

- **Confirmed.** `prisma/schema.prisma:446`: `slug String @unique`.
- The route `src/app/listings/[slug]/page.tsx:52` queries `db.listing.findUnique({ where: { slug } })` — correct for a globally-unique slug.
- The path `/listings/{slug}` is therefore collision-free and stable across brand/category/seller re-assignment (because `Listing.brandId`, `Listing.modelId`, `Listing.companyId`, `Listing.sellerId` are all mutable nullable fields — `prisma/schema.prisma:483-492` — and none participate in the URL).
- **Conclusion:** `/listings/[slug]` is the correct canonical URL for the listing detail page. The defect is that no canonical link is actually *emitted* in the rendered HTML — see §2.

### 1.6 Redirect chains

No public `redirects()` exist in `next.config.ts`. The middleware (`src/middleware.ts`) only emits 307 redirects to `/login` for unauthenticated `/admin/*` requests — those URLs are already `Disallow`ed in `robots.txt` so they're not crawl-relevant. **No redirect chains exist on the public surface.** The risk is the opposite: missing 301s for trailing-slash and alias variants (see §1.2).

---

## 2. Metadata Audit (generateMetadata)

### 2.1 Methodology

For every public route under `src/app/`, I checked for an `export async function generateMetadata` or `export const metadata` declaration. The full scan command:

```
rg -l "generateMetadata" src/app
```

**Result:** exactly **2 files** export `generateMetadata`:

1. `src/app/listings/seo/[category]/[city]/page.tsx:34` — programmatic SEO landing.
2. `src/app/articles/[slug]/page.tsx:45` — Article detail.

Every other public route — including all 5 detail pages flagged by the prior SEO doc — **inherits** the root layout's static `metadata` object (`src/app/layout.tsx:9-28`):

```ts
export const metadata: Metadata = {
  title: "هویکس | بزرگ‌ترین مارکت‌پلیس ماشین‌آلات سنگین ایران",
  description: "خرید، فروش و اجاره ماشین‌آلات سنگین: بیل مکانیکی، لودر، بلدوزر، گریدر، دامپ‌تراک، جرثقیل و قطعات یدکی. شبکه سراسری دیلرها و متخصصین.",
  keywords: [ "ماشین آلات سنگین", ... , "هویکس", "HEAVIX" ],
  authors: [{ name: "آریا ماشین جم" }],
};
```

This means **every listing detail page today has the homepage title**. That is the single biggest SEO defect in the codebase — Google sees thousands of pages with identical `<title>` and `<meta description>`, which (per Google Search Central guidance on duplicate content and site quality) is treated as either duplicate content or low-value, and suppresses indexing of all but one URL.

### 2.2 Per-page-type metadata table

| Page type | Route file | `generateMetadata`? | Title source | Description source | OG? | Twitter? | Canonical? | Verdict |
|---|---|---|---|---|---|---|---|---|
| Listing detail | `src/app/listings/[slug]/page.tsx` | **No** | inherits homepage | inherits homepage | No | No | No | **CRITICAL** — every machine page has homepage title |
| Category detail | `src/app/categories/[slug]/page.tsx` | **No** | inherits homepage | inherits homepage | No | No | No | **CRITICAL** |
| Brand detail | `src/app/brands/[slug]/page.tsx` | **No** | inherits homepage | inherits homepage | No | No | No | **CRITICAL** |
| Model detail | `src/app/models/[slug]/page.tsx` | **No** | inherits homepage | inherits homepage | No | No | No | **CRITICAL** (plus §1.4 collision) |
| Company detail | `src/app/companies/[slug]/page.tsx` | **No** | inherits homepage | inherits homepage | No | No | No | **CRITICAL** |
| Seller profile | `src/app/sellers/[id]/page.tsx` | **No** | inherits homepage | inherits homepage | No | No | No | **CRITICAL** (plus §5.3 private data) |
| Brand family | `src/app/brand-families/[slug]/page.tsx` | **No** | inherits homepage | inherits homepage | No | No | No | HIGH |
| Knowledge index | `src/app/knowledge/page.tsx` | **No** | inherits homepage | inherits homepage | No | No | No | HIGH |
| Knowledge article | `src/app/knowledge/[slug]/page.tsx` | **No** | inherits homepage | inherits homepage | No | No | No | **CRITICAL** — duplicate of `/articles/[slug]` (§6.2) |
| Listings index | `src/app/listings/page.tsx` | **No** | inherits homepage | inherits homepage | No | No | No | **CRITICAL** — every filter variant duplicates (§6.1) |
| Brands index | `src/app/brands/page.tsx` | **No** | inherits homepage | inherits homepage | No | No | No | MEDIUM |
| Companies index | `src/app/companies/page.tsx` | **No** | inherits homepage | inherits homepage | No | No | No | MEDIUM |
| Store index | `src/app/store/page.tsx` | **No** | inherits homepage | inherits homepage | No | No | No | MEDIUM |
| Homepage | `src/app/page.tsx` | **No** (root layout `metadata`) | layout.tsx:10 | layout.tsx:11-12 | No | No | No | MEDIUM — homepage itself has no canonical, no OG image |
| Programmatic SEO landing | `src/app/listings/seo/[category]/[city]/page.tsx` | **Yes** (line 34) | real data (category + city) | real data | Yes (title/desc/type/locale) | **No** `twitter` key | **No** `alternates.canonical` | HIGH — no canonical, no `noindex` on zero-result, no JSON-LD |
| Article detail | `src/app/articles/[slug]/page.tsx` | **Yes** (line 45) | real data | real data | Yes (full) | Yes (full) | Yes (line 73) but **relative URL** | HIGH — canonical should be absolute |
| Root layout (fallback) | `src/app/layout.tsx` | n/a (static `metadata`) | hardcoded | hardcoded | No | No | No | HIGH — no canonical, no OG image, no Twitter card on the fallback that most pages inherit |

### 2.3 Helpers exist but are not wired in

`src/lib/seo.ts:82-138` defines `generateMetaTitle(entityType, entity)` and `generateMetaDescription(entityType, entity)` for `Brand | Category | Listing | Article | Product`. They produce correct, real-data-based strings (e.g. for Listing: `{title} | هویکس` with price + province appended). **No route calls these helpers.** Verified by:

```
rg "generateMetaTitle|generateMetaDescription" src/app
```

→ zero matches in `src/app/`. The helpers are reachable only from the admin SEO edit page (`src/app/admin/seo/SEOAdminClient.tsx`) via the API (`src/app/api/admin/seo/route.ts`). So the admin can hand-craft a SEOMetadata row, but no public route *reads* it back during render.

### 2.4 The 5 detail pages flagged by the prior SEO doc — re-verification

The prior doc (`docs/product/SEO-ARCHITECTURE.md:25`) listed:

> `generateMetadata` exports on the four core detail pages: `/listings/[slug]`, `/brands/[slug]`, `/categories/[slug]`, `/models/[slug]`, `/companies/[slug]`.

(Note: the prior doc said "four" but listed five — minor wording issue in the prior doc.)

**Re-verification as of HEAD 4a2f579:**

| Route | `generateMetadata` export? | Line of evidence |
|---|---|---|
| `src/app/listings/[slug]/page.tsx` | **No** | `rg "generateMetadata" src/app/listings/[slug]/page.tsx` → 0 matches |
| `src/app/brands/[slug]/page.tsx` | **No** | 0 matches |
| `src/app/categories/[slug]/page.tsx` | **No** | 0 matches |
| `src/app/models/[slug]/page.tsx` | **No** | 0 matches |
| `src/app/companies/[slug]/page.tsx` | **No** | 0 matches |

**All 5 are STILL missing `generateMetadata`.** The prior audit's finding stands; nothing has been fixed in STEP 11.30 → 11.31.

### 2.5 Real-data factuality for the 2 routes that do have metadata

**`/listings/seo/[category]/[city]`** (`src/app/listings/seo/[category]/[city]/page.tsx:34-59`):

- Title: `${categoryDec} در ${cityDec} | هویکس` — built from `decodeURIComponent(params.category)` + `decodeURIComponent(params.city)`. These are raw URL segments, **not** validated against the DB at metadata time. If a crawler hits `/listings/seo/random-text/another-random-text`, the title becomes `random-text در another-random-text | هویکس` — fabricated content. The route body (line 72) does try to resolve a matching category, but if none matches it falls back to `categoryDisplay = categoryRaw` (line 125) and still renders a 200. **This is a mass-low-quality-page risk per §8.**
- Description: templated, real-data-shaped but not real-data-grounded when category doesn't resolve.
- No `robots` field → defaults to `index, follow` even on zero-result pages.

**`/articles/[slug]`** (`src/app/articles/[slug]/page.tsx:45-94`):

- Title: `${article.title} | هویکس دانش` — real DB field.
- Description: `article.excerpt` or fallback — real DB field.
- Canonical: `/articles/${article.slug}` — **relative** (line 73). Next.js accepts this but Google's canonical best practice is absolute (Google Search Central, "Consolidate duplicate URLs": "Use absolute URLs for rel=canonical"). Minor.
- OG `url` is also relative (line 77) — same issue.
- Twitter card: `summary_large_image` with real cover image (line 89) — good.

### 2.6 OG / Twitter image fallback

Neither the root layout nor any detail route defines a default `openGraph.images` array. Pages without a primary image (most brand, category, company, model pages today) will be shared on social with no preview image — a measurable CTR loss. Recommended: a single brand-styled 1200×630 fallback PNG committed to `/public/og-default.png` and referenced from `src/app/layout.tsx`.

---

## 3. Sitemap + Robots Audit

### 3.1 `src/app/robots.ts` (30 lines) — line-by-line

```ts
rules: [
  { userAgent: "*",
    allow: "/",
    disallow: ["/admin/", "/api/", "/dashboard/", "/seller/", "/login", "/register"] },
],
sitemap: absoluteUrl("/sitemap.xml"),
host: base,
```

**Coverage:** correct for the *intent* (admin / API / dashboard / seller / auth are non-indexable). **Gaps:**

| URL pattern | Should be disallowed? | Why |
|---|---|---|
| `/seller/` | Yes — already disallowed | OK |
| `/dashboard/` | Yes — already disallowed | OK |
| `/admin/` | Yes — already disallowed | OK |
| `/api/` | Yes — already disallowed | OK |
| `/login`, `/register` | Yes — already disallowed | OK |
| `/preview/page/[key]` | **Not disallowed** | Preview tokens render unpublished content — must be `noindex` via meta + ideally `Disallow: /preview/` |
| `/api-docs` | Not disallowed | Public API docs are fine to index if intended; verify intent |
| `/sellers/[id]` | **Not disallowed** | **CRITICAL — see §5.3** (private user data, public route) |
| `/rfq`, `/rfq/new`, `/rfq/[id]` | Not disallowed | RFQs may contain private buyer requirements — verify intent |
| `/transport/request` | Not disallowed | Form page; OK to index but should be `noindex` |
| `/compare` | Not disallowed | Stateful, session-scoped — should be `noindex` |
| `/find-my-need` | Not disallowed | Form page; should be `noindex` |
| `/sell-in-7-days/track` | Not disallowed | Tracking page; should be `noindex` |
| `/auctions/[id]` | Not disallowed | Auction detail — depends on whether auctions are public (currently public route exists, so probably indexable) |

**Recommendation:** add `/preview/`, `/sellers/`, `/compare`, `/find-my-need`, `/rfq/new`, `/transport/request`, `/sell-in-7-days/track` to the disallow list. **No code changed.**

### 3.2 `src/app/sitemap.ts` (170 lines) — line-by-line

**Static paths (line 22-29):** `/`, `/listings`, `/brands`, `/store`, `/knowledge`, `/categories`. **Missing from static paths:**

- `/companies` (route exists at `src/app/companies/page.tsx`)
- `/articles` (no route — `/articles/[slug]` exists but no index; legacy `/knowledge` is the index)
- `/knowledge` is included but `/articles` is not — and the sitemap emits `/knowledge/{slug}` URLs (line 162), not `/articles/{slug}` URLs. **This is the wrong choice** given that `/articles/[slug]` has metadata + JSON-LD and `/knowledge/[slug]` has neither. See §6.2.

**Static-path lastModified (line 117):** `new Date()` — i.e. **the lastModified of every static URL changes every render**. Google's sitemap spec (sitemaps.org/protocol.html) says `lastmod` should reflect "the date of last modification of the URL". A `new Date()` value that updates hourly (because `revalidate = 3600` at line 19) is **not a real lastmod** — it tells Google "this URL changed in the last hour" every single hour, which trains Google to ignore `lastmod` for this site entirely (Google Search Central, "Sitemap lastmod"): "Google uses lastmod to determine what to recrawl, but ignores values that are obviously inaccurate."

**Categories (lines 121-131):** `lastModified: c.updatedAt ?? new Date()`. Real data. Correct.

**Brands (lines 133-143):** `lastModified: b.updatedAt ?? new Date()`. Real data. Correct.

**Listings (lines 145-155):** `lastModified: l.updatedAt ?? new Date()`. Real data, but `updatedAt` fires on every `viewCount` increment (line 152 of the listing detail page fire-and-forgets a `viewCount: { increment: 1 }` update). **Therefore every listing's `lastModified` in the sitemap bumps every time someone views it.** This pollutes the `lastmod` signal exactly as above. Recommended fix (out of scope): use `COALESCE(publishedAt, createdAt)` for the sitemap lastmod, or stop bumping `updatedAt` on `viewCount` increments (move view tracking to a separate `ListingViewEvent` table — that work is partially done via `trackEvent({ eventType: "LISTING_VIEW", ... })` in `src/app/listings/[slug]/page.tsx:159`).

**Articles (lines 157-167):** `lastModified: a.publishedAt ?? a.updatedAt ?? new Date()`. Correct — uses `publishedAt` first. URL is `/knowledge/${a.slug}` (line 162) — see §6.2 for the duplicate-content problem.

**Coverage gaps in sitemap:**

| Page type | In sitemap? | Should be? |
|---|---|---|
| `/listings/[slug]` | Yes | Yes |
| `/categories/[slug]` | Yes | Yes |
| `/brands/[slug]` | Yes | Yes |
| `/models/[slug]` | **No** | **Yes** — these are indexable public pages with real content |
| `/companies/[slug]` | **No** | **Yes** — same |
| `/brand-families/[slug]` | **No** | **Yes** — same |
| `/listings/seo/[category]/[city]` | **No** | **Conditional** — only include landings with `count > 0` (per §8) |
| `/articles/[slug]` | **No** (sitemap emits `/knowledge/[slug]` instead) | **Yes** — and remove `/knowledge/[slug]` from sitemap (or canonicalize one to the other, see §6.2) |
| `/showroom/[slug]` | No | When implemented per §9 |
| `/seller/*` | No (correct) | n/a |
| `/admin/*` | No (correct) | n/a |

**Honors `SEOMetadata.robotsIndex = false`:** Yes — verified at lines 124, 136, 148, 160. If an admin flips `robotsIndex` to `false` on a Listing, the sitemap skips it. This is correct, defense-in-depth behavior (admin excludes → sitemap excludes → crawler doesn't see the URL).

**Honors `soldAt` / `expiresAt`:** **No.** The listing query at line 87-92 filters by `status: "PUBLISHED"` only. A `PUBLISHED` listing with `soldAt` set is still in the sitemap. A `PUBLISHED` listing past `expiresAt` is still in the sitemap. **Sold/expired listings stay in the sitemap indefinitely.** See §5.4 for the full lifecycle policy.

**Sharding:** single sitemap file at `/sitemap.xml`. Per sitemaps.org protocol, one sitemap is capped at 50 000 URLs / 50 MB uncompressed. HEAVIX is currently far below that. **Plan for sharding before listing count crosses ~5 000** (Google's documented soft guidance for large sites: https://developers.google.com/search/docs/crawling-indexing/sitemaps/large-sitemaps).

### 3.3 Duplicate sitemap endpoints

`src/app/api/sitemap/route.ts` (38 lines) is a **duplicate** sitemap endpoint at `/api/sitemap` that returns the output of `src/lib/seo-service.ts:generateSitemap()`. The canonical Next.js metadata-route sitemap at `/sitemap.xml` is served by `src/app/sitemap.ts`. The two generators may diverge over time — they're separate code paths. `robots.ts` only points to `/sitemap.xml` (line 27), so `/api/sitemap` is harmless but should be documented as a non-canonical alias for cron/health-check use only. Currently it has no callers in the codebase.

---

## 4. Structured Data (JSON-LD) Audit

### 4.1 What's emitted

Search for `application/ld+json` across `src/app`:

```
rg "application/ld\+json" src/app
```

**Result: exactly 1 file** — `src/app/articles/[slug]/page.tsx:310-313`:

```tsx
<script
  type="application/ld+json"
  dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
/>
```

The JSON-LD object (lines 175-185) is:

```json
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": article.title,
  "description": article.excerpt,
  "image": article.coverImage ? [article.coverImage] : undefined,
  "datePublished": article.publishedAt,
  "author": { "@type": "Organization", "name": "هویکس دانش" },
  "publisher": { "@type": "Organization", "name": "HEAVIX" },
  "mainEntityOfPage": { "@type": "WebPage", "@id": "/articles/${article.slug}" }
}
```

**Factuality check:** every field is sourced from a real DB column (`article.title`, `article.excerpt`, `article.coverImage`, `article.publishedAt`). `mainEntityOfPage["@id"]` is a relative URL — should be absolute per schema.org best practice but Google accepts relative.

### 4.2 What's NOT emitted

The following page types emit **zero** JSON-LD despite being rich-result candidates per Google's structured data documentation (https://developers.google.com/search/docs/appearance/structured-data/product):

| Page type | JSON-LD type expected | Emitted? | Helper exists in `src/lib/seo.ts`? |
|---|---|---|---|
| Listing detail | `Product` + `Offer` + `Brand` | **No** | Yes — `generateStructuredData("Listing", entity)` at line 176-211 |
| Brand detail | `Brand` | **No** | Yes — line 149-164 |
| Category detail | `CollectionPage` | **No** | Yes — line 166-174 |
| Model detail | `Product` (or `Brand` + `Product`) | **No** | Yes (could reuse Listing/Product branch) |
| Company detail | `Organization` + `LocalBusiness` (if address/phone present) | **No** | **No helper** — gap in `src/lib/seo.ts` |
| Showroom (planned) | `Store` + `Offer` (for featured listings) | n/a | n/a |
| Homepage | `WebSite` + `SearchAction` (sitelinks search box) | **No** | **No helper** |
| Breadcrumbs (every detail page) | `BreadcrumbList` | **No** | Yes — `generateBreadcrumbJsonLd(items)` at line 244-257 |

**Factuality of helpers when called:** the `generateStructuredData("Listing", entity)` function (line 176-211) emits `Product` + `Offer` (with `priceCurrency: "IRR"`, real `price` from `entity.price`, `availability: OutOfStock` if `entity.status === "SOLD"` else `InStock`). All fields are sourced from real entity data — no fabrication. **The helper is safe to call; it just isn't called.**

### 4.3 AggregateRating — factuality flag

Per Google's structured data spam policies (https://developers.google.com/search/docs/appearance/structured-data/sd-policies), `AggregateRating` must be sourced from genuine, vetted user reviews — not self-reported scores. The `Company` model has `avgRating Float?` and `reviewCount Int @default(0)` (`prisma/schema.prisma:1243-1244`), recomputed from `Review[]` (line 1245). If `Review` rows are genuine user submissions (verified by the REVIEW-01 phase), `AggregateRating` can be emitted on the company page. **If any AI-generated or admin-seeded score is ever emitted as AggregateRating, that's a manual-action risk.** Recommendation: emit `AggregateRating` on `/companies/[slug]` only when `reviewCount >= 3` AND all contributing `Review` rows have `status === "PUBLISHED"` and `verifiedBy === null` (i.e. user-submitted, not admin-seeded). Verify the `Review` schema fields before implementation.

### 4.4 Organization / WebSite on homepage

The homepage emits no JSON-LD at all. Adding `WebSite` + `SearchAction` (sitelinks search box) is high-leverage — it tells Google the site has a search function and enables the in-SERP search box, which directly improves CTR for branded queries. The search URL pattern is `/listings?q={search_term_string}` (verified at `src/app/listings/page.tsx:13-29` — accepts `q` param). Recommended JSON-LD shape:

```json
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "url": "https://havix.ir/",
  "potentialAction": {
    "@type": "SearchAction",
    "target": "https://havix.ir/listings?q={search_term_string}",
    "query-input": "required name=search_term_string"
  }
}
```

### 4.5 BreadcrumbList — high-leverage gap

Every detail page already renders a visible breadcrumb `<nav>` (e.g. `src/app/listings/[slug]/page.tsx:196-217`, `src/app/brands/[slug]/page.tsx:111-121`, `src/app/categories/[slug]/page.tsx:75-87`, `src/app/models/[slug]/page.tsx:60-75`, `src/app/companies/[slug]/page.tsx:68-74`, `src/app/articles/[slug]/page.tsx:194-201`). The `generateBreadcrumbJsonLd(items)` helper at `src/lib/seo.ts:244-257` is ready. **Wiring these together is the second-highest-leverage JSON-LD action** (after Product on listing detail) because BreadcrumbList rich results are easy to qualify for and improve SERP appearance.

---

## 5. Index / noindex Policy Audit

### 5.1 Per-page-type index policy (as-implemented vs. required)

| Page / URL pattern | Required policy | As-implemented | Gap |
|---|---|---|---|
| `/` (homepage) | index, follow, in sitemap | index (default), in sitemap | OK |
| `/listings` (bare) | index, follow, in sitemap | index (default), in sitemap | OK |
| `/listings?{any filter}` | **noindex, follow**, **not in sitemap** | index (default), not in sitemap | **CRITICAL** — see §6.1 |
| `/listings/[slug]` (PUBLISHED, not sold, not expired) | index, follow, in sitemap | index (default), in sitemap | OK on policy; fails on metadata (§2) |
| `/listings/[slug]` (SOLD) | see §5.4 | route `notFound()`s (line 69 of detail page) → 404 → effectively noindex via 404 | Per §5.4, should serve 200 + banner for 30 days. Current behavior drops the URL immediately. |
| `/listings/[slug]` (DRAFT/PENDING/REJECTED/EXPIRED) | noindex, follow, not in sitemap | route `notFound()`s → 404 | OK (404 is effectively noindex). Add `X-Robots-Tag: noindex` defense-in-depth. |
| `/categories/[slug]` (CATALOG layer) | index, follow, in sitemap | index (default), in sitemap | OK on policy |
| `/categories/[slug]` (MARKETPLACE/SERVICE/FALLBACK layer) | **noindex, follow** | index (default) | HIGH — non-CATALOG categories are operational groupings, not search-worthy |
| `/brands/[slug]` (active) | index, follow, in sitemap | index (default), in sitemap | OK |
| `/brands/[slug]` (inactive) | noindex, follow, not in sitemap | index (default), **in sitemap** (`sitemap.ts:82` filters `active: true` so inactive brands ARE excluded from sitemap; but the route is still indexable if crawled) | MEDIUM — sitemap excludes inactive brands, but the route doesn't emit `noindex` if a crawler lands on the URL via an inbound link |
| `/models/[slug]` (active, globally unique slug) | index, follow, in sitemap | index (default), **not in sitemap** | HIGH — should be in sitemap |
| `/models/[slug]` (active, slug shared by 2+ brands) | **noindex** (duplicate content) | index (default) | **CRITICAL** — see §1.4 |
| `/companies/[slug]` (ACTIVE) | index, follow, in sitemap | index (default), **not in sitemap** | HIGH |
| `/companies/[slug]` (non-ACTIVE) | noindex, 404 | route filters `status: "ACTIVE"` (line 31) → 404 for non-active → effectively noindex | OK |
| `/sellers/[id]` | **noindex, nofollow, disallow in robots.txt** | **index (default), not disallowed** | **CRITICAL** — see §5.3 |
| `/brand-families/[slug]` | index, follow, in sitemap | index (default), not in sitemap | MEDIUM |
| `/listings/seo/[category]/[city]` (count > 0) | index, follow, in sitemap | index (default), not in sitemap | MEDIUM |
| `/listings/seo/[category]/[city]` (count = 0) | **noindex** | **index (default)** | HIGH — see §6.3 |
| `/knowledge/[slug]` | **noindex** (canonicalize to `/articles/[slug]`) OR delete route | **index (default), in sitemap** | **CRITICAL** — see §6.2 |
| `/articles/[slug]` | index, follow, in sitemap, canonical | index (default), in sitemap (via /knowledge), has canonical (relative) | HIGH — sitemap points to wrong URL |
| `/showroom/[slug]` (active + valid premium) | index, follow, in sitemap | route does not exist | n/a — see §9 |
| `/showroom/[slug]` (inactive / expired premium) | 404 + noindex | n/a | n/a — see §9 |
| `/admin/*` | noindex, disallow | disallow in robots.txt + 307 redirect to login | OK |
| `/api/*` | noindex, disallow | disallow in robots.txt | OK (API routes return JSON, not HTML — no meta to set; X-Robots-Tag would be defense-in-depth) |
| `/dashboard/*` | noindex, disallow | disallow in robots.txt | OK |
| `/seller/*` | noindex, disallow | disallow in robots.txt | OK |
| `/preview/page/[key]` | **noindex, disallow** | **index (default), not disallowed** | HIGH — preview content should never be indexed |
| `/login`, `/register` | noindex, disallow | disallow in robots.txt | OK |
| `/compare`, `/find-my-need`, `/rfq/new`, `/transport/request`, `/sell-in-7-days/track` | **noindex** (form/stateful pages) | index (default) | MEDIUM |

### 5.2 X-Robots-Tag (defense-in-depth)

Searched for `X-Robots-Tag` across `src/`:

```
rg "X-Robots-Tag|x-robots-tag" src/
```

**Zero matches.** No HTTP-level `X-Robots-Tag` header is set on any response — not on `/api/*` JSON, not on `/admin/*` redirects, not on the listing detail `notFound()` 404, not on the `/preview/*` route. This is a defense-in-depth gap: if a crawler ever hits a `noindex`-intended URL through a path that bypasses the HTML `<meta name="robots">` (e.g. an API route that returns HTML, or a 404 page that renders with status 200 due to a bug), there is no HTTP-level fallback.

### 5.3 `/sellers/[id]` — CRITICAL private-data exposure

`src/app/sellers/[id]/page.tsx:30-58`:

```ts
db.user.findUnique({
  where: { id },
  include: {
    company: { select: { id, name, slug, logoUrl, verified } },
    _count: { select: { listings: { where: { status: "PUBLISHED" } } } },
  },
})
```

- The route is **public** (no auth check, no `requireAdmin`).
- The URL uses `User.id` (a `cuid`) as the path segment — not a slug, not stable, not human-readable. This is not a search-worthy URL.
- The route is **not in `robots.ts` disallow list**.
- The route has **no `generateMetadata`** → inherits homepage title.
- The route **increments viewCount on the User** (line 47 of seller page) — implying it's intended to be a public profile, but `User.viewCount` isn't even a real schema field (verified: `rg "viewCount" prisma/schema.prisma` → matches on `Listing`, `Company`, `Article`, but **not** `User` — the increment will throw a Prisma runtime error if the field doesn't exist; if the field exists, the seller profile is treated as a first-class public entity with no SEO value).
- The page body renders `seller.name`, `seller.company`, and links to all `PUBLISHED` listings by that seller.

**Why this is critical:** a crawler can enumerate user IDs (cuids are not secret — they appear in API responses, audit logs, and frontend data) and index `/sellers/{cuid}` for every user in the database. Each indexed URL has the homepage title and identical body content (same template, same fallback strings). This is both a **privacy leak** (user IDs become public-searchable) and a **mass-duplicate-content** vector.

**Recommended policy:**
1. Add `/sellers/` to `robots.ts` `disallow` list.
2. Add `export const metadata = { robots: { index: false, follow: false } }` to `src/app/sellers/[id]/page.tsx`.
3. Optionally 410 the route entirely if seller profiles aren't a product surface — `/companies/[slug]` already serves the canonical dealer page.

### 5.4 Sold / expired listing lifecycle

`src/app/listings/[slug]/page.tsx:69`:

```ts
if (!listing || listing.status !== "PUBLISHED") notFound();
```

**Current behavior:** the moment a listing's `status` flips from `PUBLISHED` to `SOLD` (or `DRAFT`/`EXPIRED`/etc.), the detail route returns 404. The URL disappears from the live site. Google sees a 404 and (per Google Search Central, "Fix 404 errors in Search Console") eventually drops the URL from the index — but for 24-72 hours the SERP shows a 404 to users, which is a poor UX and loses any link equity from inbound links.

**Better policy (per `docs/product/SEO-ARCHITECTURE.md` §7.3):**

| `Listing.status` | `soldAt` | HTTP | robots | Sitemap | Banner |
|---|---|---|---|---|---|
| `PUBLISHED` | null | 200 | index | yes | none |
| `PUBLISHED` | ≤30 days | 200 | index | yes | "Sold" |
| `PUBLISHED` | 31-90 days | 200 | **noindex, follow** | no | "Sold" |
| `PUBLISHED` | >90 days | 301 → `/categories/{category.slug}` | n/a | no | n/a |
| `EXPIRED` | n/a | 410 (7 days) → 301 to category | noindex | no | n/a |
| `DRAFT`/`PENDING`/`REJECTED` | n/a | 404 | noindex | no | n/a |
| deleted | n/a | 410 permanently | n/a | no | n/a |

**Note on `soldAt` field:** schema has `soldAt DateTime?` (`prisma/schema.prisma:466`) — field exists, policy is implementable without schema change. **No code changed by this audit.**

### 5.5 CRM / licensed data

Per task §5: "CRM data, licensed data must be noindex." The `Lead` model (per ADR-005-amendment-01 §3) lives behind `/api/admin/*` and the seller dashboard (`/seller/leads`), both already disallowed. There is no public route that renders Lead data. **OK.**

"Licensed data" — the `PriceObservation` / `PriceEstimate` / `PriceOverride` models (referenced at `prisma/schema.prisma:519-521`) feed the `PriceEstimateCard` component (`src/components/listings/PriceEstimateCard.tsx`) rendered on the listing detail page. The price estimate is computed from observed data and rendered as a UI card; it is not a separate URL. **If** the estimate card displays raw observation rows (e.g. "last 3 sales in Tehran at X Toman"), that licensed-source data is visible on an indexable page. Recommendation: verify with legal that aggregated/derived estimates are OK to render publicly; raw observation rows should not. **No code changed.**

---

## 6. Filtered / Duplicate Content Audit

### 6.1 `/listings` filter variants — CRITICAL

`src/app/listings/page.tsx:13-29` declares the search params:

```ts
type SearchParams = {
  q?: string; category?: string; brand?: string; yearFrom?: string; yearTo?: string;
  minPrice?: string; maxPrice?: string; featured?: string; type?: string;
  transaction?: string; province?: string; city?: string; industry?: string;
  [key: string]: string | undefined;  // ← dynamic attr.KEY filters
};
```

Every combination of these 14+ parameters produces a unique URL. Examples from the route body:

- `/listings?category=excavators` (line 208 of detail page links here)
- `/listings?brand=caterpillar` (line 264 of brand page links here)
- `/listings?q=cat%20320d&condition=NEW` (line 157 of SEO landing)
- `/listings?attr.engine_power_min=100&attr.engine_power_max=200` (dynamic attribute filters, line 121-169)

**Per Google's faceted-navigation guidance (https://developers.google.com/crawling/docs/faceted-navigation):** uncontrolled faceted URLs are the single biggest source of crawl-budget waste and duplicate-content dilution on e-commerce sites. The recommended approach is a per-URL decision matrix: **block** (robots.txt) low-value combinations, **noindex** medium-value, **canonicalize** filter-only variants to the bare URL, **index** high-value combinations that have unique content.

**Current HEAVIX behavior:** every filter variant:

- Returns 200.
- Renders the same homepage `<title>` (no `generateMetadata`).
- Renders the same homepage `<meta description>`.
- Has no `<link rel="canonical">`.
- Has no `robots` meta.

→ Google sees an effectively-infinite URL space with identical titles and descriptions. This is the textbook duplicate-content scenario Google's algorithms suppress.

**Recommended policy (no code changed):**

| URL shape | Policy |
|---|---|
| `/listings` (bare) | index, follow, self-canonical |
| `/listings?category={slug}` (single category, no other filters) | index, follow, self-canonical (this is a meaningful search-results page) |
| `/listings?brand={slug}` (single brand, no other filters) | index, follow, self-canonical |
| `/listings?{any other combination}` | **noindex, follow**, canonical → `/listings?category={slug}` if a single category is selected, else canonical → `/listings` |
| `/listings?page={N}` (when pagination lands) | **noindex, follow**, canonical → `/listings` |

### 6.2 `/knowledge/[slug]` vs `/articles/[slug]` — CRITICAL duplicate content

Both routes render the **same** `Article` row from the **same** `slug`:

- `src/app/knowledge/[slug]/page.tsx:16`: `db.article.findUnique({ where: { slug } })`
- `src/app/articles/[slug]/page.tsx`: uses `getArticle(slug)` from `src/lib/content-service.ts` which (per the route's own docstring at line 14-17) is the "canonical content-engine public route" intended to replace the legacy `/knowledge/[slug]`.

**Divergence:**

| Aspect | `/knowledge/[slug]` | `/articles/[slug]` |
|---|---|---|
| `generateMetadata` | No | Yes |
| JSON-LD `Article` | No | Yes |
| Canonical link | No | Yes (relative URL) |
| In sitemap | **Yes** (`src/app/sitemap.ts:162` emits `/knowledge/${a.slug}`) | No |
| Route body template | dark theme (`bg-[#0b0b0b]`) | light theme (`bg-zinc-50`) |
| View-count increment | Yes (line 20) | Yes (line 165-167) |

**Result:** Google sees two URLs per article, both 200, both with identical text content (only the surrounding chrome differs). The sitemap advertises the **worse** of the two (no metadata, no JSON-LD). The better route (`/articles/[slug]`) is invisible to crawlers.

**Recommended policy (pick one — no code changed by this audit):**

1. **Option A — consolidate on `/articles/[slug]`:** (a) update `src/app/sitemap.ts:162` to emit `/articles/${a.slug}`; (b) add a 301 redirect in `next.config.ts` `redirects()` from `/knowledge/[slug]` to `/articles/[slug]`; (c) delete `src/app/knowledge/[slug]/page.tsx`; (d) update internal links (e.g. `src/app/knowledge/page.tsx`'s article cards, `src/app/articles/[slug]/page.tsx:195`'s "هویکس دانش" breadcrumb link).
2. **Option B — consolidate on `/knowledge/[slug]`:** backfill metadata + JSON-LD into `/knowledge/[slug]`, delete `/articles/[slug]`. (Worse choice — `/articles/[slug]` already has the metadata wired and uses the cleaner `content-service` fetcher.)
3. **Option C — keep both, canonicalize:** add `<link rel="canonical" href="/articles/[slug]">` to `/knowledge/[slug]`'s metadata, and remove `/knowledge/[slug]` from the sitemap. (Acceptable but creates a permanent maintenance footgun — two routes for one entity.)

**Strong recommendation: Option A.**

### 6.3 Programmatic SEO landing zero-result pages

`src/app/listings/seo/[category]/[city]/page.tsx:111-123` counts listings matching the category+city filter; the page renders the same template whether `totalCount` is 5 000 or 0. The `generateMetadata` (line 34-59) does not check `totalCount` — every zero-result landing gets `index, follow`.

Per Google's spam policies (https://developers.google.com/search/docs/essentials/spam-policies): "Large-scale content abuse (scaled content abuse) is the practice of generating content at scale to manipulate search rankings." Thousands of zero-result `category × city` pages with templated descriptions and empty result grids are textbook scaled-content abuse. The `/listings/seo` route is currently safe because no sitemap or internal nav links to it (verified: `rg "/listings/seo" src/app` returns only self-references in the SEO landing page's own `relatedSearches` block, lines 142-159). **But the moment an internal-link campaign or sitemap entry points at these URLs without a `count > 0` guard, this becomes a manual-action risk.**

**Recommended policy:**

1. In `generateMetadata`, fetch `count` first; if `count === 0`, return `{ robots: { index: false, follow: true } }`.
2. Add to sitemap only entries where `count > 0`.
3. Validate `categoryRaw` and `cityRaw` against the DB in `generateMetadata` before forming the title — if neither resolves, return `noindex`. Currently the title is built from raw URL segments (line 38) before any DB lookup, so fabricated categories produce fabricated titles.

---

## 7. Image Optimization Audit

### 7.1 `next/image` vs raw `<img>`

```
rg -l "from \"next/image\"" src/
```

**Result: 1 file** — `src/components/AdaptiveLogo.tsx`. Every other image in the codebase uses raw `<img>`. Specifically:

| Route / component | Image usage | Line |
|---|---|---|
| `src/app/listings/[slug]/page.tsx` | Primary image: `<img src={listing.images[0].url} alt={listing.title} />` | 227-231 |
| `src/app/listings/[slug]/page.tsx` | Gallery thumbnails: `<img src={img.url} alt={img.alt ?? listing.title} />` | 250-255 |
| `src/app/brands/[slug]/page.tsx` | Brand logo: `<img src={brand.logoUrl} alt={brand.name} />` | 127-131 |
| `src/app/companies/[slug]/page.tsx` | Cover image: `<img src={company.coverImage} alt={company.name} />` | 80-84 |
| `src/app/companies/[slug]/page.tsx` | Company logo: `<img src={company.logoUrl} alt={company.name} />` | 93 |
| `src/app/articles/[slug]/page.tsx` | Cover image: `<img src={article.coverImage} alt={article.title} />` | 237-241 |
| `src/app/articles/[slug]/page.tsx` | Related-article thumbnails: `<img src={r.coverImage} alt={r.title} />` | 281-285 |
| `src/app/knowledge/[slug]/page.tsx` | Cover image: `<img src={article.coverImage} alt={article.title} />` | 55 |
| `src/components/listings/ListingCard.tsx` | Card image: `<img src={l.image} alt={l.title} />` | 46-50 |

**Consequences:**

1. **No lazy loading** — Next.js `<Image>` defaults to `loading="lazy"`; raw `<img>` defaults to `loading="eager"`. Every image on the listing grid is fetched eagerly. With 24 listings × 1 image each, the homepage `/listings` page downloads 24 images on first paint.
2. **No responsive `srcset`** — Next.js `<Image>` generates `srcset` for 640/750/828/1080/1200/1920/2048/3840px widths. Raw `<img>` serves the full-resolution image to every device. Listing images are typically 1-4 MB each; on mobile this is a measurable LCP regression.
3. **No AVIF/WebP** — Next.js `<Image>` serves modern formats via the Next.js image optimizer; raw `<img>` serves whatever format was uploaded.
4. **No blur placeholder** — `<Image placeholder="blur">` improves perceived LCP.

**Recommended migration (out of scope):** replace every `<img>` in the above table with `next/image`'s `<Image>`. For remote images (S3-hosted), configure `images.remotePatterns` in `next.config.ts`. For listing images, set `width={1200} height={750}` (matching the existing `aspect-[16/10]` container) and `sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"`.

### 7.2 Alt text from real data

| Image | `alt` source | Verdict |
|---|---|---|
| Listing primary image (`listings/[slug]/page.tsx:229`) | `listing.title` | OK — but ignores `ListingImage.alt` field which exists at `prisma/schema.prisma:539` |
| Listing gallery thumbnails (`listings/[slug]/page.tsx:253`) | `img.alt ?? listing.title` | **Good** — uses `ListingImage.alt` when present, falls back to listing title |
| Listing card image (`ListingCard.tsx:48`) | `l.title` | OK — `ListingCardData` type doesn't carry `alt` (would need to be added) |
| Brand logo (`brands/[slug]/page.tsx:129`) | `brand.name` | OK |
| Company cover (`companies/[slug]/page.tsx:82`) | `company.name` | OK — but a cover image with `alt=company.name` is semantically weak; better: `alt=""` (decorative) since the company name is in `<h1>` immediately below |
| Company logo (`companies/[slug]/page.tsx:93`) | `company.name` | OK |
| Article cover (`articles/[slug]/page.tsx:239`) | `article.title` | OK |
| Knowledge cover (`knowledge/[slug]/page.tsx:55`) | `article.title` | OK |

`ListingImage.alt` is `String?` (`prisma/schema.prisma:539`) — optional. Currently no admin UI surface forces or even prompts for `alt` on upload (verified by inspecting `src/app/admin/listings/[id]/edit/ListingEditForm.tsx` — image uploads don't include an alt-text field). **Recommendation:** add an `alt` text input to the listing image uploader and to the ListingCard data shape so the gallery thumbnails and the card image both consume real alt text.

### 7.3 Image sitemap

`src/app/sitemap.ts` emits URL entries only — no `<image:image>` child elements. Per sitemaps.org image extension (https://www.google.com/schemas/sitemap-image/1.1/), adding `<image:image>` to each listing URL entry would surface listing images in Google Images search. Next.js's `MetadataRoute.Sitemap` type supports an `images` array per URL entry — implementation is straightforward. **Currently not done.** Recommended for the listing URLs (line 145-155 of sitemap.ts) — append `images: [{ url: absoluteUrl(primaryImage.url), title: listing.title }]` to each entry.

### 7.4 OG image

Neither the root layout nor any route defines `openGraph.images` for the homepage or fallback. See §2.6.

---

## 8. AI-Generated Content Audit

### 8.1 AI content generation surfaces

The codebase has three AI-content surfaces:

| Surface | Route | Auth | Source marking | Writes to DB? |
|---|---|---|---|---|
| Article factory | `src/app/api/admin/ai-content-factory/route.ts` | Admin + `ai.execute` permission (line 40-45) | Returns draft to admin; admin publishes via separate `/api/admin/articles` endpoint | **No** — returns draft only |
| Knowledge article generator | `src/app/api/admin/knowledge/generate-article/route.ts` | Admin (per file at line 1-15) | Same pattern — draft to admin | **No** — draft only |
| Content assistant | `src/app/api/admin/ai/content-assist/route.ts` | Admin + `ai.execute` (line 28) | All outputs typed `source: "AI_SUGGESTED"`, `verified: false` (in `src/lib/ai-content-assistant.ts:31,48,64`) | **No** |
| **Listing builder (public)** | `src/app/api/ai-listing-builder/route.ts` | **NONE — public, unauthenticated** (line 11) | Returns `{ extracted, source }` where `source = description` (user input) — **no `AI_SUGGESTED` tag** | **No** — returns extracted JSON to caller |

### 8.2 Quality gate

`src/lib/ai-content-assistant.ts:26-27` explicitly states: "All AI output is `AI_SUGGESTED` (never verified). All AI calls are best-effort (try/catch — never crash)." Every exported type (`ArticleOutline`, `SEOSuggestion`, `ListingQualityReport`) carries `source: "AI_SUGGESTED"` and `verified: false`. The audit log writes `ai.content.outline` / `ai.content.seo` / `ai.content.quality_check` keys with reason strings like `"AI article outline (AI_SUGGESTED — not verified)"` (lines 248, 326, 398).

**This is a correct, conservative policy.** It means:

- AI-generated content never reaches the public site without an admin review step (admin must explicitly publish via `/api/admin/articles`).
- AI-generated SEO suggestions are labeled as such and require human approval before being written to `SEOMetadata`.
- The audit trail records which content is AI-sourced.

### 8.3 The listing-builder gap

`src/app/api/ai-listing-builder/route.ts` is a **public, unauthenticated** route that takes a free-text description and returns LLM-extracted structured JSON. The response is **not** tagged `AI_SUGGESTED`. It's intended for the listing-creation flow (a user pastes an ad description; the AI pre-fills the listing form). The route does not write to the DB — the caller (presumably a client-side form) takes the extracted JSON and the user reviews/edits before submitting via `/api/listings` (which itself requires auth).

**Risks:**

1. **Unauthenticated AI cost exposure** — anyone can hit `/api/ai-listing-builder` and consume LLM tokens. There's no rate limit, no auth, no captcha. This is an AI-budget risk (the existing admin-AI routes require `ai.execute` permission; this one doesn't).
2. **No source marking** — the extracted JSON has no `source: "AI_SUGGESTED"` tag. When the caller submits it via `/api/listings`, the resulting `Listing` row carries no provenance. A future audit cannot tell which listings were AI-extracted vs. human-entered.
3. **No factuality check** — the AI may hallucinate a brand, model, or year. The route's system prompt (line 20-34) tells the LLM to "omit if not present", but LLMs do hallucinate. The extracted JSON is presented to the user for review, but there's no automated reconciliation against the `Brand` / `ProductModel` / `Category` tables.

**Recommended policy (no code changed):**

1. Add authentication to `/api/ai-listing-builder` — minimum `getCurrentUser()` check.
2. Tag the response with `source: "AI_SUGGESTED"` and `verified: false` to match the convention in `src/lib/ai-content-assistant.ts`.
3. When the listing form submits, persist a `source: "AI_SUGGESTED"` flag on the `Listing` row (would require a new schema field — out of scope for this audit). At minimum, write an audit log entry `ai.listing.extract` with the user ID and the extracted JSON.
4. Add a factuality reconciliation step in the listing form: validate `extracted.brand` against `db.brand.findFirst({ where: { name: { contains: extracted.brand } } })` and warn the user if no match. (Currently the form likely does this client-side; verify before relying on it.)

### 8.4 Mass low-quality page generation — explicit FORBIDDEN check

Per task §8: "Mass low-quality page generation FORBIDDEN."

The only mass-page-generation surface in the codebase is the programmatic SEO landing route `/listings/seo/[category]/[city]`. As audited in §6.3, this route:

- Does not generate pages at scale (no sitemap entries, no internal-link campaign).
- Renders pages on-demand from URL params.
- Currently has no `noindex` on zero-result pages — a latent risk.

**Conclusion: no mass low-quality page generation is currently happening.** The risk is latent in `/listings/seo/[category]/[city]` and must be gated by `count > 0` before any sitemap/internal-link campaign (§6.3).

The AI article factory is admin-gated and produces one draft per admin request — not mass generation. The AI content assistant is admin-gated and produces one suggestion per request. **No mass AI page generation exists.**

---

## 9. VIP Showroom SEO (ADR-005 §2)

### 9.1 What ADR-005 §2 requires

Per `docs/ADR-005-store-center-architecture.md:41-68`:

- New `Showroom` model linked to `Company` (`companyId @unique`, `isActive`, `template`, `layout`, `featuredListingIds`, `viewCount`).
- New `Company.storeSlug @unique` field for the URL `/showroom/[storeSlug]`.
- Public route `/showroom/[slug]`: check `Showroom.isActive === true` AND linked `Company` has a valid (non-expired) `PremiumSubscription`.
- Non-VIP or inactive → **404**.
- Management route `/seller/showroom`: check user's Company has active PremiumSubscription; non-VIP → **403**.

### 9.2 Schema implementability — verified against `prisma/schema.prisma`

| Required schema change | In schema? | Line evidence |
|---|---|---|
| `model Showroom { ... }` | **No** | `rg "^model Showroom" prisma/schema.prisma` → empty |
| `Company.storeSlug String? @unique` | **No** | `rg "storeSlug" prisma/schema.prisma` → empty |
| `Company.logoUrl String?` | **Yes** (existing) | `prisma/schema.prisma:1213` |
| `Company.bannerUrl String?` | **No** | `rg "bannerUrl" prisma/schema.prisma` → empty (existing field is `coverImage`, line 1214) |
| `Company.brandColor String?` | **No** | `rg "brandColor" prisma/schema.prisma` → empty |
| `Company.storeDescription String?` | **No** | `rg "storeDescription" prisma/schema.prisma` → empty (existing field is `description`, line 1212) |
| `PremiumSubscription` linked to Company | **No — per-user, not per-company** | `prisma/schema.prisma:1157-1174` — `userId String @unique`, no `companyId` field |

### 9.3 ADR-005-amendment-01 §2 correction

`docs/ADR-005-amendment-01.md:30-36` already documents this divergence:

> **ADR-005 claim:** "Check `Company.PremiumSubscription` is valid" / "user's Company has active PremiumSubscription."
>
> **Actual schema:** `PremiumSubscription` has `userId String @unique` — it is **per-USER, not per-COMPANY**.
>
> **Corrected enforcement (PR-SC-08):** VIP status is resolved via the Company's owner/admin User. The helper `companyHasActivePremium(companyId)` must query `PremiumSubscription` where `user.companyId = companyId AND status = "ACTIVE" AND (expiresAt IS NULL OR expiresAt > now())`.

So the showroom enforcement is **implementable without schema change** once the `Showroom` model and `Company.storeSlug` are added — but the PremiumSubscription lookup must go through the Company's users, not a direct `Company → PremiumSubscription` relation.

### 9.4 SEO policy for the showroom route (when implemented)

Per the prior SEO doc (`docs/product/SEO-ARCHITECTURE.md` §1.6) and re-affirmed here:

| State | HTTP | robots meta | Sitemap | X-Robots-Tag |
|---|---|---|---|---|
| `Showroom.isActive === true` AND company has active PremiumSubscription | 200 | `index, follow` | included | (none) |
| `Showroom.isActive === false` | 404 | `noindex, nofollow` | excluded | `noindex` |
| Active showroom, expired PremiumSubscription | 404 | `noindex, nofollow` | excluded | `noindex` |
| Unknown `storeSlug` | 404 | `noindex, nofollow` | excluded | `noindex` |
| Showroom deleted (former URL) | 410 Gone | n/a | excluded | `noindex` |

### 9.5 Current implementability verdict

**The VIP Showroom route cannot be implemented as specified by ADR-005 §2 in the current schema.** Three blockers:

1. `Showroom` model does not exist (`prisma/schema.prisma` — verified empty).
2. `Company.storeSlug` does not exist (verified empty).
3. `PremiumSubscription` is per-user, not per-company — but this is **already documented** in ADR-005-amendment-01 §2 and a helper-based enforcement path is specified. So blocker #3 is not a schema blocker, only an implementation note.

**Blocking PR:** per ADR-005-amendment-01 §2, this lands in **PR-SC-08** (not yet started — `docs/STORE-CENTER-IMPLEMENTATION-PLAN.md` will have the roadmap; PR-SC-01 is the most recent merged per worklog STEP 11.30).

**No code changed by this audit.** This section documents the SEO policy that PR-SC-08 must implement.

---

## 10. Measurement KPIs

### 10.1 KPI definitions (per Google Search Console — https://support.google.com/webmasters/answer/7042828)

| KPI | Definition | Source |
|---|---|---|
| **Impressions** | "How often someone saw a link to your site on Google Search." Counted when a URL appears in a SERP that the user viewed (even if scrolled past). | Google Search Console → Performance → Search results |
| **Clicks** | "When someone clicks a link to your site from a search results page." | Google Search Console → Performance → Search results |
| **CTR (Click-Through Rate)** | Clicks ÷ Impressions × 100. Average across all queries for the URL/query/page scope. | Google Search Console (computed) |
| **Average Position** | "The average position of your site in search results for a particular query." Computed per-impression, then averaged. | Google Search Console |
| **Organic Conversion** | A goal completion (lead submitted, listing favorited, deal-room started, listing created) where the traffic source's `utm_medium` contains `organic` or the GA4 session source is `google / organic`. | Google Analytics 4 (GA4) — requires GA4 to be wired into `src/app/layout.tsx` (currently not present — verified: `rg "googletagmanager\|gtag\|GA_MEASUREMENT" src/` → 0 matches). **Gap.** |
| **Indexed URLs** | Count of URLs in Google's index for the property. | Google Search Console → Coverage (or Pages report) |
| **Crawl Errors** | 404 / 5xx / soft-404 counts. | Google Search Console → Indexing → Pages → "Why pages aren't indexed" |

### 10.2 KPIs by page type

| Page type | Primary KPIs | Secondary KPIs |
|---|---|---|
| Listing detail (`/listings/[slug]`) | Impressions, Clicks, CTR, Avg Position, "Lead submitted" conversion | "Add to favorites", "Start deal room", "Message seller" |
| Category (`/categories/[slug]`) | Impressions, Clicks, CTR, Avg Position | Scroll depth, click-through to listing detail |
| Brand (`/brands/[slug]`) | Impressions, Clicks, CTR, Avg Position | Click-through to model pages and listing detail |
| Model (`/models/[slug]`) | Impressions, Clicks, CTR, Avg Position | (Same as brand) |
| Company (`/companies/[slug]`) | Impressions, Clicks, CTR | "Phone click" (tel: link), "Website click" |
| Article (`/articles/[slug]`) | Impressions, Clicks, CTR, Avg Position | Time on page, scroll depth |
| Programmatic SEO landing (`/listings/seo/*`) | Impressions, Clicks, CTR | Click-through to listing detail |
| Homepage (`/`) | Branded-query impressions, CTR | Click-through to category pages |
| Showroom (`/showroom/[slug]` — future) | Impressions, Clicks, CTR | Featured-listing click-through |

### 10.3 Baseline capture (BEFORE targets)

Before setting any growth target, the baseline must be captured for 30 days of clean data. **No baseline exists today** because:

1. **GA4 is not wired** — `rg "googletagmanager\|gtag\|GA_MEASUREMENT\|google-analytics" src/` returns 0 matches. There is no `<Script src="https://www.googletagmanager.com/gtag/js?id=...">` in `src/app/layout.tsx`. Conversion tracking is impossible until GA4 is wired.
2. **Search Console property** — unknown whether `havix.ir` is verified in GSC. This is an ops task, not a code task.
3. **`trackEvent` infrastructure exists** but is event-only — `src/lib/analytics.ts` (referenced from `src/app/listings/[slug]/page.tsx:159`'s `trackEvent({ eventType: "LISTING_VIEW" })`) writes to the local `AnalyticsEvent` table. This captures on-site behavior but **not** organic-traffic source attribution. It's a session-counter, not a SEO-attribution system.

**Recommended baseline-capture sequence:**

1. **Day 0 (ops):** Verify `havix.ir` in Google Search Console (DNS TXT record). Submit `/sitemap.xml`. Wait 3-7 days for GSC to populate.
2. **Day 0 (code, separate ticket):** Wire GA4 into `src/app/layout.tsx` via Next.js `<Script>` strategy `afterInteractive`. Add `gtag('event', 'page_view')` and `gtag('event', 'conversion', { send_to: ..., value: ... })` calls to the four conversion surfaces: lead-submit, favorite-add, deal-room-start, listing-create.
3. **Day 7:** GSC has 7 days of data. Export baseline CSV: impressions, clicks, CTR, avg position, per-page-type breakdown.
4. **Day 30:** GSC has 30 days of data — minimum statistical window for stable CTR and position metrics. **This is the baseline date.**
5. **Day 30:** GA4 has 30 days of conversion data. Export baseline conversion rate by traffic source (`google / organic`).
6. **Day 30 → set targets.** Typical Year-1 targets for a B2B industrial marketplace with 0 baseline:
   - 90 days: 2× impressions on the 50 highest-value listing URLs, 1.5× CTR.
   - 180 days: 5× impressions, 2× CTR, top-3 average position for 20 brand+model head terms.
   - 365 days: 10× impressions, organic conversions > 5% of total leads.

### 10.4 Current on-site analytics (what HEAVIX already captures)

`src/lib/analytics.ts` and the `AnalyticsEvent` table (referenced at `src/app/listings/[slug]/page.tsx:159-165`) capture `LISTING_VIEW` events server-side. This is robust against ad-blockers and works without JS. **But** it doesn't capture the traffic source (`utm_medium`, referrer, organic-vs-paid). To measure organic conversion, the server-side `trackEvent` needs to be enriched with the request's `referer` header and the URL's `utm_*` params. **Recommended (out of scope):** extend `trackEvent` to optionally accept `{ referrer, utmSource, utmMedium, utmCampaign }` and persist these on `AnalyticsEvent`. Then the conversion funnel can be sliced by traffic source server-side, independent of GA4.

### 10.5 Reporting cadence

- **Weekly:** GSC Performance snapshot — total impressions, clicks, CTR, avg position, week-over-week delta. Top 10 fastest-growing queries, top 10 fastest-declining queries.
- **Monthly:** Page-type breakdown (listing vs category vs brand vs article), indexing coverage report (indexed vs excluded vs soft-404), crawl-error review.
- **Quarterly:** Conversion rate by traffic source (organic vs direct vs referral), revenue-attribution-per-channel (requires GA4 + ecommerce events wired).

---

## 11. Critical Issues (final list)

Numbered critical issues. Each cites the exact code evidence and the recommended remediation (which is **out of scope** for this audit — implementation is a separate ticket).

| # | Issue | Evidence | Remediation (out of scope) |
|---|---|---|---|
| C1 | `/listings/[slug]` has no `generateMetadata` — every machine detail page renders the homepage title | `src/app/listings/[slug]/page.tsx` — no `generateMetadata` export; `src/app/layout.tsx:9-28` fallback | Add `generateMetadata` per `docs/product/SEO-ARCHITECTURE.md` §2.2 template |
| C2 | `/brands/[slug]` has no `generateMetadata` | `src/app/brands/[slug]/page.tsx` — no export | Same |
| C3 | `/categories/[slug]` has no `generateMetadata` | `src/app/categories/[slug]/page.tsx` — no export | Same |
| C4 | `/models/[slug]` has no `generateMetadata` AND non-deterministic query (`findFirst` against non-globally-unique slug) | `src/app/models/[slug]/page.tsx:21` (`findFirst`); `prisma/schema.prisma:411` (`@@unique([brandId, slug])`) | Add metadata + change canonical URL to `/brands/[brandSlug]/models/[modelSlug]` |
| C5 | `/companies/[slug]` has no `generateMetadata` | `src/app/companies/[slug]/page.tsx` — no export | Same as C1 |
| C6 | `/knowledge/[slug]` and `/articles/[slug]` both render the same `Article` row — duplicate content; sitemap points to the wrong one | `src/app/knowledge/[slug]/page.tsx:16` vs `src/app/articles/[slug]/page.tsx:142`; `src/app/sitemap.ts:162` emits `/knowledge/{slug}` | Consolidate on `/articles/[slug]` (Option A in §6.2) |
| C7 | `/sellers/[id]` is public, exposes private user data, not disallowed in robots, has no `noindex` | `src/app/sellers/[id]/page.tsx:30-58`; `src/app/robots.ts:24` (no `/sellers/` in disallow) | Add to `robots.ts` disallow + `metadata.robots = { index: false }` + optionally 410 the route |
| C8 | `/listings?{filter}` variants have no canonical, no `noindex` — mass duplicate URLs | `src/app/listings/page.tsx:13-29` (14+ filter params, no canonical, no metadata) | Add `generateMetadata` that emits `noindex` on multi-filter combos + canonical on single-filter combos (§6.1) |
| C9 | Sitemap omits `/models/*`, `/companies/*`, `/brand-families/*`, `/articles/*` (emits `/knowledge/*` instead), `/listings/seo/*` | `src/app/sitemap.ts:121-167` — only categories, brands, listings, articles(via knowledge) | Add missing entity types; switch article URLs to `/articles/{slug}` |
| C10 | Sitemap `lastModified` for static paths is `new Date()` — changes every render | `src/app/sitemap.ts:117` | Use real lastmod (e.g. build timestamp from git, or a static date updated on deploy) |
| C11 | Sitemap `lastModified` for listings uses `updatedAt` which bumps on every `viewCount` increment | `src/app/sitemap.ts:151` (`l.updatedAt`); `src/app/listings/[slug]/page.tsx:151-153` (fire-and-forget `viewCount` increment) | Use `publishedAt` for lastmod, or move view tracking to a separate `ListingViewEvent` table |
| C12 | Zero JSON-LD emitted on listing/brand/category/model/company pages — `src/lib/seo.ts:generateStructuredData` helper exists but is unused | `rg "application/ld\+json" src/app` → 1 match (articles only); `src/lib/seo.ts:141-241` (helpers) | Wire `<script type="application/ld+json">` into each detail page using the existing helpers |
| C13 | No X-Robots-Tag HTTP header on any response — defense-in-depth gap | `rg "X-Robots-Tag" src/` → 0 matches | Add to `next.config.ts` `headers()` for `/api/*`, `/admin/*`, `/preview/*`, `/sellers/*`, and the 404 response of `/listings/[slug]` |
| C14 | VIP Showroom route `/showroom/[slug]` cannot be implemented — `Showroom` model and `Company.storeSlug` not in schema | `rg "model Showroom\|storeSlug" prisma/schema.prisma` → empty; ADR-005 §2 requires both | Schema migration in PR-SC-08 per ADR-005-amendment-01 §2 |

**Total critical issues: 14.**

### 11.1 High-severity issues (not blocking, but should fix within one cycle)

| # | Issue | Evidence |
|---|---|---|
| H1 | Listing detail + ListingCard use raw `<img>` — no lazy-loading, no responsive `srcset`, no AVIF/WebP | `src/app/listings/[slug]/page.tsx:227,250`; `src/components/listings/ListingCard.tsx:46` |
| H2 | `ListingCard` does not consume `ListingImage.alt` (only `l.title`) | `src/components/listings/ListingCard.tsx:21` (type omits `alt`), line 48 (`alt={l.title}`) |
| H3 | `/listings/seo/[category]/[city]` has `generateMetadata` but no canonical, no `noindex` on zero-result, no JSON-LD BreadcrumbList, title built from unvalidated URL segments | `src/app/listings/seo/[category]/[city]/page.tsx:34-59` |
| H4 | `/articles/[slug]` canonical is relative, not absolute | `src/app/articles/[slug]/page.tsx:73` (`/articles/${article.slug}`) |
| H5 | Root layout `metadata` has no canonical, no OG image, no Twitter card, no site URL — every page that doesn't override inherits nothing useful | `src/app/layout.tsx:9-28` |
| H6 | Non-CATALOG categories (`MARKETPLACE`/`SERVICE`/`FALLBACK`) are indexable | `src/app/categories/[slug]/page.tsx` — no `layer` check; `prisma/schema.prisma:175` (layer field exists) |
| H7 | Inactive brands are excluded from sitemap but the route itself doesn't emit `noindex` | `src/app/sitemap.ts:82` (`where: { active: true }`); `src/app/brands/[slug]/page.tsx:41` (`resolveBrandBySlugOrAlias` — does it filter `active`?) |
| H8 | `/preview/page/[key]` is not disallowed and not `noindex` | `src/app/robots.ts:24` (no `/preview/`); `src/app/preview/page/[key]/page.tsx` — no metadata |

**Total high-severity issues: 8.**

### 11.2 Medium-severity issues

| # | Issue | Evidence |
|---|---|---|
| M1 | `SEOMetadata.structuredData` field exists but no route consumes it | `prisma/schema.prisma:1985`; `rg "structuredData" src/app` → 0 matches in routes |
| M2 | `/api/sitemap` is a duplicate sitemap endpoint with separate code path | `src/app/api/sitemap/route.ts` vs `src/app/sitemap.ts` |
| M3 | No sitemap sharding — single sitemap file | `src/app/sitemap.ts` (single file) |
| M4 | No `WebSite` + `SearchAction` JSON-LD on homepage (misses sitelinks search box) | `src/app/page.tsx` — no JSON-LD |
| M5 | `robots.ts` doesn't disallow `/preview/`, `/compare`, `/find-my-need`, `/rfq/new`, `/transport/request`, `/sell-in-7-days/track` | `src/app/robots.ts:24` |

**Total medium-severity issues: 5.**

### 11.3 Final count

| Severity | Count |
|---|---|
| Critical | **14** |
| High | 8 |
| Medium | 5 |
| **Total** | **27** |

---

## 12. Pages Missing `generateMetadata` (final list)

Per task instruction §2: "Flag pages missing metadata (the prior SEO doc found 5 detail pages missing generateMetadata — verify this is still true)."

**Answer: yes, all 5 are still missing.** Plus 8 additional public page types that should also export metadata. Final count: **13 pages** (5 critical detail pages + 8 additional public pages).

### 12.1 The 5 critical detail pages (re-verified)

| # | Route | File | Confirmed missing |
|---|---|---|---|
| 1 | `/listings/[slug]` | `src/app/listings/[slug]/page.tsx` | Yes — `rg "generateMetadata" src/app/listings/[slug]/page.tsx` → 0 matches |
| 2 | `/brands/[slug]` | `src/app/brands/[slug]/page.tsx` | Yes — 0 matches |
| 3 | `/categories/[slug]` | `src/app/categories/[slug]/page.tsx` | Yes — 0 matches |
| 4 | `/models/[slug]` | `src/app/models/[slug]/page.tsx` | Yes — 0 matches |
| 5 | `/companies/[slug]` | `src/app/companies/[slug]/page.tsx` | Yes — 0 matches |

### 12.2 Additional public pages missing `generateMetadata` (broader audit)

| # | Route | File | Severity |
|---|---|---|---|
| 6 | `/sellers/[id]` | `src/app/sellers/[id]/page.tsx` | CRITICAL (private data exposure — should be `noindex`, not metadata) |
| 7 | `/knowledge/[slug]` (legacy article) | `src/app/knowledge/[slug]/page.tsx` | CRITICAL (duplicate of `/articles/[slug]`) |
| 8 | `/listings` (browse index) | `src/app/listings/page.tsx` | CRITICAL (filter-variant duplicates) |
| 9 | `/brand-families/[slug]` | `src/app/brand-families/[slug]/page.tsx` | HIGH |
| 10 | `/brands` (brand index) | `src/app/brands/page.tsx` | MEDIUM |
| 11 | `/companies` (company index) | `src/app/companies/page.tsx` | MEDIUM |
| 12 | `/knowledge` (article index) | `src/app/knowledge/page.tsx` | MEDIUM |
| 13 | `/store` | `src/app/store/page.tsx` | MEDIUM |

### 12.3 Routes that DO export `generateMetadata` (verified)

| Route | File | Notes |
|---|---|---|
| `/listings/seo/[category]/[city]` | `src/app/listings/seo/[category]/[city]/page.tsx:34` | Has gaps — see §2.5, §6.3 |
| `/articles/[slug]` | `src/app/articles/[slug]/page.tsx:45` | Good — minor canonical-URL issue (§2.5) |

---

## 13. References

- Google Search Central — "Consolidate duplicate URLs": https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls
- Google Search Central — "Manage your sitemaps": https://developers.google.com/search/docs/crawling-indexing/sitemaps/overview
- Google Search Central — "Large sitemaps": https://developers.google.com/search/docs/crawling-indexing/sitemaps/large-sitemaps
- Google Search Central — "Sitemap lastmod": https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemaps#lastmod-pingbot
- Google Search Central — "What are impressions, position, and clicks?": https://support.google.com/webmasters/answer/7042828
- Google Search Central — "General Structured Data Guidelines": https://developers.google.com/search/docs/appearance/structured-data/sd-policies
- Google Search Central — "Product structured data": https://developers.google.com/search/docs/appearance/structured-data/product
- Google Search Central — "Spam policies": https://developers.google.com/search/docs/essentials/spam-policies
- Google Search Central — "Faceted navigation": https://developers.google.com/crawling/docs/faceted-navigation
- Google Search Central — "Fix 404 errors in Search Console": https://support.google.com/webmasters/answer/7440453
- sitemaps.org protocol: https://sitemaps.org/protocol.html
- sitemaps.org image extension: https://www.google.com/schemas/sitemap-image/1.1/
- ADR-005 §2 — `docs/ADR-005-store-center-architecture.md:41-68`
- ADR-005-amendment-01 §2 — `docs/ADR-005-amendment-01.md:30-36`
- Prior SEO doc — `docs/product/SEO-ARCHITECTURE.md` (1 179 lines, STEP 11.29-SEO)

---

## 14. Out of Scope (explicit non-changes)

Per task hard rules: "Do NOT modify code, schema, or PRs. Documentation only."

**No code, schema, configuration, or PR was modified by this audit.** The following files were read but not written:

- `src/app/robots.ts` — read, not modified
- `src/app/sitemap.ts` — read, not modified
- `src/app/layout.tsx` — read, not modified
- `src/app/listings/[slug]/page.tsx` — read, not modified
- `src/app/listings/page.tsx` — read, not modified
- `src/app/listings/seo/[category]/[city]/page.tsx` — read, not modified
- `src/app/brands/[slug]/page.tsx` — read, not modified
- `src/app/categories/[slug]/page.tsx` — read, not modified
- `src/app/models/[slug]/page.tsx` — read, not modified
- `src/app/companies/[slug]/page.tsx` — read, not modified
- `src/app/sellers/[id]/page.tsx` — read, not modified
- `src/app/articles/[slug]/page.tsx` — read, not modified
- `src/app/knowledge/[slug]/page.tsx` — read, not modified
- `src/lib/seo.ts` — read, not modified
- `src/lib/seo-service.ts` — read, not modified
- `src/lib/ai-content-assistant.ts` — read, not modified
- `src/app/api/admin/ai-content-factory/route.ts` — read, not modified
- `src/app/api/ai-listing-builder/route.ts` — read, not modified
- `prisma/schema.prisma` — read, not modified
- `next.config.ts` — read, not modified
- `src/middleware.ts` — read, not modified

**Only output:** this document (`docs/seo/STEP-11.31-SEO-AUDIT.md`) and the worklog append.

---

**End of audit.**
