# ADR-001: Global brand catalog, category-independent discovery

- Status: Accepted
- Date: 2026-11-22
- Scope: HEAVIX marketplace brand identity and listing discovery

## Decision

A Brand is a canonical, global entity in the marketplace. Brand search MUST search the complete active brand catalog regardless of the category selected earlier in the listing wizard.

Category-to-brand associations are optional metadata. They may be used for relevance ranking, merchandising, analytics, browse facets, or category-specific validation when a domain explicitly requires it. They MUST NOT be a hard visibility constraint in the canonical brand picker.

A category may suggest likely brands, but the user must still be able to search and select any active brand in the central catalog. This prevents a valid cross-industry manufacturer, diversified group, spare-parts brand, or brand with incomplete category metadata from disappearing.

## Industry practice and rationale

- Google Merchant Center models brand as a product attribute and requires/requests the recognizable product brand independently of the Google product category. The category is a separate product classification field.
- eBay uses category-specific item aspects: the category determines which aspects are relevant or required (Brand can be one of them), while its catalog products may map to one or more listing categories. This supports category-aware validation, not making brand identity a child of one category.
- Shopify separates a product's category taxonomy from product/vendor identity. The product has a category and vendor as distinct properties.

Therefore HEAVIX adopts a global Brand entity and keeps category metadata as a secondary relationship rather than a prerequisite for search.

## Data and UX contract

1. Brand is unique by canonical slug and has localized display names (name, nameEn) plus normalized aliases (BrandAlias) for multilingual search.
2. The user selects only an existing active brand from the global picker. User-entered text must not silently create a new Brand.
3. Admin/authorized owner workflows may add, verify, merge, deactivate, and enrich canonical brands.
4. Models are separate from brands. The user may type a model name even when no ProductModel row exists. The typed model text is saved on the listing; it must not create a canonical model automatically.
5. BrandIndustry, BrandCategory, and BrandDomain are descriptive/curation metadata. Missing relations must not block brand search or listing creation.
6. Brand aliases must be normalized consistently for Persian and English search (Arabic/Persian Yeh and Kaf, ZWNJ, Arabic/Persian digits, case-folding, punctuation/spacing).

## Seed policy

- Brand seeds are additive and idempotent; never delete existing brands or aliases as part of catalog refresh.
- Run only against dedicated Preview after a successful paired encrypted Preview backup and explicit Preview target validation.
- Report processed entries, resulting distinct brands, aliases, duplicates/collisions, inactive rows, and failed records.
- Seeded coverage is a curated initial catalog, not a claim that every brand worldwide is present. Continue expanding from trustworthy, provenance-tracked sources and admin curation.

## Consequences

- The brand picker must not pass a category constraint to the search query.
- Category associations can be backfilled later without affecting whether a brand is selectable.
- Product/category-specific required attributes remain category-aware and separate from brand identity.