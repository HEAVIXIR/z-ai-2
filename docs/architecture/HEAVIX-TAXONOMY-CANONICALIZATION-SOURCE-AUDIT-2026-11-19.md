# HEAVIX Taxonomy and Listing Wizard — Source Audit & Canonicalization Plan

**Status:** Review draft; no taxonomy mutation or database migration authorized by this document.  
**Branch:** `integration/preview-readiness-workerd-2026-11-15`  
**Audit baseline:** `5071bd46ce529f0012b3272721771551e1518818`  
**Updated:** 2026-11-19

## 1. Executive finding

The Integration source contains at least two materially different machine-taxonomy definitions and a runtime API contract that exposes only a bounded portion of the category tree. The present data model can associate categories with application industries, but the legacy tree still embeds machine identity under industry-oriented branches. This is the source of duplicated identities and makes the current tree unsuitable as the sole resolver for progressive, subject-specific listing forms.

This is a source-code audit, not a claim about the live Preview or Production database. Runtime row counts, current category IDs, listing dependencies, and seed history still require read-only database evidence.

## 2. Source inventory reviewed

### 2.1 `prisma/seed-taxonomy-v11.ts`

The file describes Taxonomy V1.1 as:
- 6 transaction types;
- 9 service types;
- 16 application industries;
- 14 category roots (7 CATALOG, 4 MARKETPLACE, 2 SERVICE, 1 FALLBACK);
- 30+ Category ↔ ApplicationIndustry links.

It places Excavator under Road Construction Machinery and also creates a separate Mining Machinery branch with a distinct `mining-excavator-machine` slug. The Excavator node has application links to MINING, ROAD_CONSTRUCTION, and CONSTRUCTION, which demonstrates that cross-industry applicability was already partly modeled even while a separate mining-specific category remained.

The seed's own comments say existing categories matching known child slugs may be reparented, while unmatched existing categories are left alone. This is not sufficient evidence of a complete, collision-free migration plan.

### 2.2 `prisma/seed-machine-taxonomy.ts`

The file calls its tree “definitive” and defines a separate 16-L1 machine structure with approximately 182 L2 families and 104 L3 variants. It contains a Road Construction Excavator node and a separate Mining Excavator Machine node. Its header states that it upserts by slug, changes parent/level/path, and deactivates some branches when descendants have no listings. It defaults to dry-run and requires `--apply` for writes.

This file must be treated as a historical/proposed seed, not as a safe migration script. A dry-run alone does not establish that its proposed re-parenting preserves every semantic relationship, SEO route, model, attribute, and external reference.

### 2.3 Prisma Category model

The current schema includes:
- self-referencing `Category.parentId` / `children`;
- unique `slug`;
- `layer`, `domain`, `taxPath`, `level`, and active/display fields;
- relations to listings, category attributes, model attributes, brand-category links, model categories, models, products, application industries, and price observations.

This is a useful compatibility layer, but it is not by itself a normalized canonical machine identity model. A single-parent tree should not be forced to encode all cross-industry relationships.

### 2.4 Application industry relation

`CategoryApplicationIndustry` already represents a many-to-many association between a category and an application industry. The admin category endpoint supports replacing `appIndustries[]` transactionally.

This relation is a candidate for industry/application context, but the intended subject-to-application mapping must be audited for completeness and must not be inferred from category ancestry alone.

### 2.5 Public taxonomy API

`src/app/api/taxonomy/route.ts` queries active categories with `level <= 2`. It assembles roots and children; the machinery root alone receives the next nested level in this payload. Other roots remain one level deep. The API separately returns transaction types, service types, and application industries.

The public API therefore does not currently provide one consistent, arbitrary-depth taxonomy traversal contract. The category detail route `src/app/api/taxonomy/categories/[id]/route.ts` does return active direct children and parent metadata. The wizard's progressive traversal must use a deliberate, bounded and predictable contract rather than assume that every depth is already embedded in the initial payload.

## 3. Canonical domain boundaries

The following are proposed semantic boundaries for review and implementation design:

1. **Commercial intent** — sale, rental offer, purchase request, rental request, service offer/request, quote/RFQ, auction, tender/procurement. Intent controls workflow and commercial fields; it is not a machine category.
2. **Subject family** — machinery/equipment, parts/components/attachments, minerals/materials, services, workforce, projects/assets/rights, and procurement events.
3. **Canonical subject identity** — e.g. excavator, wheel loader, articulated dump truck, crusher, drill rig. It has one stable identity regardless of industry/application.
4. **Application/industry** — mining, road construction, civil works, building construction, oil & gas, cement, steel, ports, agriculture, etc. This is a many-to-many context, not a duplicate machine identity.
5. **Configuration/type variant** — tracked/wheeled, rigid/articulated, electric/diesel, long-reach, underground, etc. These must be classified per domain semantics; not every current L3 node is necessarily a subtype.
6. **Capacity/class** — e.g. 20–22 tonne operating-weight class. This is a typed attribute or controlled range, not a category, brand, or model.
7. **Brand/model/generation** — linked catalog identities, with explicit compatibility to canonical subject identity and technical profile.
8. **Technical profile** — versioned field schema selected by subject + relevant configuration + application + intent/service context. It must not be one universal form.

## 4. Required wizard resolution sequence

The UI may present contextual navigation, but the underlying identity should resolve in a stable sequence:

1. Select commercial intent.
2. Select subject family.
3. Select canonical subject type.
4. Select application/industry only when relevant or useful.
5. Resolve configuration/capacity classes and technical profile.
6. Resolve compatible brand, model, and generation where relevant; keep optional where the subject does not require them.
7. Load the profile-specific form and merge only the commercial/service fields required by the chosen intent.
8. Validate and persist typed values against the selected profile version.

Example: Sale → Machinery & Equipment → Excavator → Mining application → crawler configuration → operating-weight range → compatible brand/model → excavator technical form.

Example service flow: Service offer → Repair → Heavy equipment → Excavator subject → Mining application (optional) → repair capability and service-specific fields, while reusing the same canonical Excavator identity and technical vocabulary.

Rental should compose a rental workflow with the chosen subject's profile; it should not be a machine type. Parts should use a separate parts/component taxonomy with compatibility links to machine types/models.

## 5. Migration and compatibility invariants

Before any data migration:
- Export current Preview taxonomy read-only, including IDs, parent IDs, layers, slugs, active flags, tax paths, category-attribute links, model links, brand links, application links, listing counts, and SEO references.
- Compare all known seeds and historical rebuild scripts; identify which were ever run and against which database, using migration/seed logs rather than comments alone.
- Produce explicit old-ID → canonical-ID mappings; never infer identity from translated labels alone.
- Preserve listing history, slugs/routes, model/category links, attributes, and external references.
- Prefer additive relations and aliases; avoid destructive deletes and broad re-parenting until dependency counts and mapping coverage are proven.
- Use stable canonical keys and bilingual labels/synonyms separately from display names.
- Make the transformation idempotent and dry-run by default; produce a machine-readable before/after report.
- Require exact Preview target, paired encrypted backup, checksum/read-back verification, and restore rehearsal before any Preview write.
- Never apply this plan to Production without a separate explicit authorization and release gate.

## 6. Data-model options to evaluate

Do not implement schema changes until the source inventory and read-only DB export are complete. Evaluate:
- canonical `SubjectType` (or equivalent) with stable key, bilingual labels, family/domain;
- `SubjectApplication` many-to-many mapping;
- `SubjectVariant` or typed configuration dimensions where a variant is a genuine controlled identity;
- versioned `TechnicalProfile` and `TechnicalField` definitions;
- typed listing/profile values with validation and unit metadata;
- explicit brand/model compatibility with subject types and generations;
- aliases/crosswalks from legacy category IDs/slugs to canonical identities;
- separate part taxonomy and fitment/compatibility graph;
- service activity taxonomy plus subject applicability;
- intent eligibility mapping per subject family.

Keep the existing Category model as a compatibility/navigation layer during transition unless evidence proves a safe replacement path.

## 7. Acceptance tests required before calling the wizard complete

- Excavator resolves to one canonical identity for mining, road construction, and civil/building applications.
- Same canonical technical profile can be reused across sale, rental, wanted, and service flows, with only relevant contextual fields added.
- 20–22 tonne is a capacity/operating-weight selection, not a category or model.
- Brand/model choices are constrained by subject type and compatibility; optional for subjects where not meaningful.
- Parts use their own component hierarchy and compatibility links.
- Mineral listings load commodity/material fields, not machinery fields.
- Service flows load service activity + subject type + service-specific fields.
- Wanted requests persist quantity and unit as structured data, not only in audit metadata or free-text description.
- Each intent is routed to its canonical persistence model and is covered by API contract tests.
- Existing listing IDs, SEO routes, and legacy references remain resolvable after migration.
- Accessibility, retry/error states, mobile layout, and low-bandwidth loading are covered by end-to-end acceptance.

## 8. Current CI evidence at audit baseline

At commit `5071bd46ce529f0012b3272721771551e1518818`:
- OpenNext runtime integration proof run #782 completed successfully.
- CI run #3756 completed with failure. Its `verify` job failed at “All contract + unit tests”; earlier schema validation, Worker Prisma typecheck, typecheck, lint, security tests, integration tests, and disposable backup/restore proofs succeeded. E2E, migration proof, production build, and real-server proof were skipped after the test failure.
- This is not a green CI baseline. The failing test output must be retrieved and corrected before acceptance.

## 9. Immediate next work

1. Retrieve the exact failed contract/unit test output for CI #3756 and repair only the evidenced regression.
2. Inventory all taxonomy seeds, historical rebuild scripts, admin taxonomy UI, wizard category resolution, category attributes, product models, and service/parts/mineral endpoints.
3. Obtain a read-only Preview taxonomy/dependency export. If no approved read-only connector/workflow is available, record that blocker; do not use application credentials or run ad-hoc SQL writes.
4. Produce the canonical bilingual subject dictionary and old-ID/slug crosswalk as a reviewable artifact.
5. Only then design the additive schema and profile resolver, with tests before migration.

---
**Safety statement:** This document is architecture and audit guidance only. No category rows, seeds, database schema, Preview database, Production database, deployment, or Cloudflare Worker were modified by this document.
