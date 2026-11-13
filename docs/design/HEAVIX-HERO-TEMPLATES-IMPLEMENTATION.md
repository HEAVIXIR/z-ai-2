# HEAVIX Hero Templates — Implementation Architecture Notes

Date: 2026-11-12  
Related: Issue #311; HEAVIX-CINEMATIC-INDUSTRIAL-HERO-REFERENCE.md

## Repository findings (verified on the recovery branch)
- Public homepage entry: `src/app/page.tsx`.
- Existing hero renderer: `src/components/home/Hero.tsx`.
- Existing search dock: `src/components/home/HeroSearch.tsx`; it already submits to the real `/listings` query flow.
- Existing owner/admin editor: `src/app/admin/home/hero/page.tsx`.
- Existing protected API: `src/app/api/admin/hero/route.ts`; both GET and PUT require `admin.homepage.manage`, and writes are audit-logged.
- Existing image upload control: `MediaUploader`, using `/api/admin/upload`.
- Existing statistics: `getActiveStats()` and live DB-count fallback in the homepage; do not fabricate values.
- Existing persistence: `HeroConfig` Prisma model. It currently stores the legacy hero's fields and detailed dimension controls, but it has no template selector or independent cinematic-template configuration.
- Existing homepage section configuration is separate from hero configuration; do not conflate hiding/reordering the homepage section with choosing the hero design.

## Required implementation shape
1. Keep the current `Hero` renderer and all current HeroConfig fields intact.
2. Introduce a typed template discriminator with a safe default of `classic`. Unknown/missing values must render the classic hero.
3. Persist cinematic-template settings independently from classic HeroConfig settings. Prefer an additive, backward-compatible configuration record (or an existing established JSON settings mechanism only if confirmed suitable). Do not serialize cinematic data into unrelated classic fields.
4. Render through a small homepage hero switch/adapter in `src/app/page.tsx`: classic uses the existing `Hero` + `HeroSearch`; cinematic uses a dedicated component and the same canonical marketplace data/search flow.
5. Extend the existing `/admin/home/hero` screen with a clear template selector and separate editing panels. Reuse `MediaUploader`, existing authorization, audit logging, and existing stats/search data sources.
6. The template switch changes only the active template key. It must not reset or overwrite either template's configuration.
7. Add cache invalidation for both template selection and cinematic configuration mutations. Existing hero API currently revalidates `HOMEPAGE_CACHE_TAGS.hero`; keep that contract and verify the current homepage cache behavior.
8. Keep the reference's key image relationship: a shared scene/background layer with the excavator positioned at the left, with controlled overlap/masking that continues behind the first card. Avoid three isolated card images pasted over a generic background.
9. Keep search controls connected to the existing `/listings` filters. Stats must use verified `getActiveStats()` data and hide unavailable rows.
10. Preview only; no Production deployment, DNS change, or automatic database push.

## Proposed cinematic configuration contract
Use a versioned, validated object with fields similar to:
- `version`
- `background: { imageUrl, focalX, focalY, overlay, scale }`
- `cards: [{ id, title, eyebrow, description, imageUrl, focalX, focalY, href, ctaLabel, visible, order, visualPreset }]`
- `metrics: { visible, title, rows: [{ id, label, metricKey, icon, visible, order }] }`
- `search: { visible, placeholder, enabledFilters, enabledModes, ctaLabel }`
- `responsive: { tabletPreset, mobilePreset }`

Only persist administrator-authored presentation configuration. Resolve metric values and marketplace filter options from trusted existing data/services at render time; do not store pretend live counts in the configuration. Validate URLs, dimensions, lengths, enum values and array limits on the server.

## Required test coverage
- Existing hero renders identically when the selected template is missing, classic, or unknown.
- Admin authorization for read/write remains enforced; audit record created on changes.
- Selecting cinematic does not mutate classic HeroConfig.
- Saving and reloading cinematic configuration preserves every editable field.
- Missing/invalid images and empty metrics degrade gracefully.
- Search uses canonical listing query parameters.
- Desktop composition preserves the background/card overlap; tablet/mobile have no overflow.
- Preview health and homepage smoke test after build.

## Important gap to resolve before implementation
The exact migration strategy and generated Prisma-client workflow must be checked against both `prisma/schema.prisma` and `prisma/preview-schema.prisma`, including the repository's migration conventions. Do not update only one schema or hand-edit generated clients. Use an additive migration and the established preview DB migration process; do not run any data-loss or destructive push command.
