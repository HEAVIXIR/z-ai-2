# Catalog Seed Reconciliation & Write-Safety Follow-up — 2026-11-26

## Scope
Static source review of the Integration branch only. Files inspected:
- prisma/seed-catalog.ts
- prisma/seed-phase2-catalog-core.ts
- prisma/seed-phase3-catalog.ts
- prisma/seed-taxonomy-v11.ts
- prisma/seed-category-specific-attributes.ts
- prisma/seed-service-mineral-attributes.ts

No scripts were executed. No database connection, writes, migrations, deployment, or Production access occurred.

## R1 — Phase 2 Listing-to-Product association is not semantically safe (critical)
The Phase 2 script loads Listings with productId=null and Products, then chooses the first Product whose brandId matches the Listing brandId. It does not compare listing title, category, model, SKU, or other product identity. Products are read without an explicit ordering, so the selected match is not a deterministic semantic match. This can attach a listing to an unrelated product from the same brand. Do not run this script against a populated Preview database.

## R2 — Phase 3 creates unsupported compatibility assertions (high)
Phase 3 takes only the first 10 Products and first 10 Parts (without order), then creates PART→PRODUCT FITS edges for every same-brand pair, with confidence 0.9 and verified=true. Brand equality alone does not establish part compatibility. The selection window is also arbitrary and order-dependent. These edges must not be seeded as verified compatibility facts.

## R3 — Three overlapping product/model namespaces are materially inconsistent (high)
Examples directly visible in the seed definitions:
- Caterpillar 320D appears in seed-catalog and Phase 2; Phase 3 also creates a Caterpillar 320D product with a different category slug context.
- Komatsu PC210-8 appears in seed-catalog and Phase 2, while Phase 3 uses PC200-8/PC220-8 product names.
- Volvo A40G appears in seed-catalog and Phase 2, but category assignments differ (dump-truck/mining vs road/mining depending on script).
- Hitachi ZX210LC / ZX350LC in seed-catalog differ from Phase 2/3 ZX210 / ZX350 identifiers.
- Caterpillar D6R, 966H and Komatsu WA380 variants differ from the seed-catalog model codes and product coverage.
The scripts use different slug conventions and distinct product natural keys. A single canonical model/product registry and explicit alias/variant policy are required before any import. No automated merging is safe from the reviewed evidence alone.

## R4 — Phase 3 has an unsafe RBAC side effect (critical)
Phase 3 assigns ADMIN to db.user.findFirst() if an ADMIN role exists. It does not identify the intended administrator. This is unrelated to catalog seeding and must be removed from any future catalog import path; RBAC changes require a separate explicitly scoped operation.

## R5 — Seed write guards are inconsistent (high)
- seed-category-specific-attributes.ts has --apply, HEAVIX_ENV=preview, explicit approval env, and exact App Preview database OID + PostgreSQL system_identifier checks before writes.
- seed-service-mineral-attributes.ts has --apply and HEAVIX_ENV=preview but no exact DB identity pin or separate approval variable.
- seed-catalog.ts has --apply and HEAVIX_ENV=preview but no exact DB identity pin.
- seed-phase2-catalog-core.ts and seed-phase3-catalog.ts have no equivalent exact Preview identity guard in the reviewed entrypoints.
- seed-taxonomy-v11.ts has --apply, HEAVIX_ENV=preview, and a read-only hierarchy preflight that rejects unexpected collisions, but no exact Preview identity pin.
The strongest existing pattern is the category-specific technical form guard; it should be extracted/reused by every mutating Preview seed runner. Do not weaken its fail-closed behavior.

## R6 — Taxonomy hierarchy preflight is a useful control, not proof of target safety
Taxonomy V1.1 validates duplicate planned slugs, parent references, layer/domain collisions, and unexpected hierarchy drift before upserts. Its allowlisted legacy-root reparent behavior is narrow and explicit. However, this does not establish that the connected database is the intended App Preview instance.

## R7 — Attribute seeds are not interchangeable
The category-specific technical form seed validates exact Preview identity, explicit approval, required catalog roots, duplicate templates/fields, and complete active terminal-category form coverage before writes. It preserves existing CategoryAttribute settings on reruns.
The service/mineral seed defines a separate service/mineral scope and validates roots/forms, but lacks the same database identity guard and explicit approval gate. The legacy attribute seed remains explicitly blocked unless legacy-overwrite flags are supplied and should not be treated as canonical bootstrap.

## Required next engineering sequence (no writes)
1. Establish one authoritative ProductModel/Product seed manifest with stable natural keys and explicit model aliases.
2. Generate a conflict matrix for all model and product candidates; human-review category and model-variant conflicts.
3. Remove Listing auto-link-by-brand; replace with an explicit reviewed mapping or a deterministic exact-key match that leaves ambiguous records untouched.
4. Remove Phase 3 compatibility auto-verification; import only evidence-backed edges with provenance and human/authoritative verification.
5. Extract a shared exact-Preview-identity guard and require it in every mutating seed runner, including service/mineral and catalog seeds.
6. Separate RBAC repair from catalog data import; no catalog seed may grant roles.
7. Add CI static tests that fail if unsafe patterns reappear (brand-only Listing linking, arbitrary first-N compatibility generation, first-user ADMIN assignment, missing identity guard).

## Execution gate
No seed execution or Preview/Production mutation is authorized by this report. Before any write, require a reviewed canonical manifest, conflict disposition, target identity proof, backup/rollback plan, expected row-level delta, and explicit approval.