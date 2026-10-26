# Legacy ZIP archive inventory — read-only

Source pinned to HEAVIXIR/z at commit 217f98ecc800aa64ae4739d27ed2aeb95dd260ed; compared against the checked-out target branch.
No archive content is extracted into the repository or executed. This report does not authorize import.

## Summary

- Archives expected: 13
- Missing path candidates: 75
- Same-path content conflicts: 633
- Identical files: 990
- Excluded entries: 15
- Binary entries requiring review: 2
- Unsafe paths skipped: 0
- Archive errors: 0
- Cross-archive paths with different hashes: 0

## Import policy

- A missing path is not automatically safe or useful to import; review feature relevance, licensing, secrets, dependencies and architecture.
- Resolve conflicts semantically; never overwrite current files based on age or size.
- Database dumps, secrets, environment files, generated output, vendor dependencies and runtime bundles are not migration candidates.

## .zscripts.zip

- Archive bytes: 13,543
- Archive SHA-256: 9891d8682e85ef37e00edfc5535ef1ddbacc62da20b941e9802730dcbfd50424
- ZIP entries: 10; normalized prefix retained: True
- Uncompressed bytes examined: 29,007
- Counts: conflict=1, identical=8, missing=1

### Missing candidates (not imported) — 1
- .zscripts/dev.pid (5 bytes; sha256 41f610c24cd3eb47)

### Path conflicts / different content — 1
- .zscripts/database-runtime-build.sh (archive 08cc5e20d2ed0cec, current 2dbfa1d73c006028)

### Identical files — 8
- .zscripts/build.sh
- .zscripts/dev.sh
- .zscripts/keep-dev-alive.sh
- .zscripts/mini-services-build.sh
- .zscripts/mini-services-install.sh
- .zscripts/mini-services-start.sh
- .zscripts/python-runtime-build.sh
- .zscripts/start.sh

### Excluded files

None.

### Binary files requiring manual review

None.

## bun.zip

- Archive bytes: 13,873,381
- Archive SHA-256: 65e944aa86c2179e76739c7d2230d79b5915ad41b1ef36a3c89011dda3b457e0
- ZIP entries: 821; normalized prefix retained: False
- Uncompressed bytes examined: 42,916,167
- Counts: EXCLUDE_DATABASE_OR_BACKUP=6, EXCLUDE_SECRET_OR_KEY=1, conflict=318, identical=466, missing=29, review_binary=1

### Missing candidates (not imported) — 29
- prisma/migrations/0_init/migration.sql (43,031 bytes; sha256 272a6c503ec07d25)
- prisma/migrations/README.md (3,663 bytes; sha256 30aab09f35a83421)
- prisma/seed-price-records.ts (2,551 bytes; sha256 4147b88d2ba37b24)
- prisma/store-schema.prisma (12,802 bytes; sha256 2c668c93dd0edd11)
- scripts/catalog-health.ts (3,491 bytes; sha256 66ca01577dda5d87)
- scripts/clear-logo.ts (361 bytes; sha256 cc83dba621047ffe)
- scripts/make-logos-dark.cjs (2,536 bytes; sha256 a5c743624d9664f5)
- scripts/orange-ix.cjs (2,891 bytes; sha256 b975fbab077d5145)
- scripts/phase10a-audit.ts (4,319 bytes; sha256 8ac48d883abb3fcf)
- scripts/phase11a-audit.ts (3,465 bytes; sha256 fdf4c82c95afda5e)
- scripts/phase5a-audit.ts (6,947 bytes; sha256 50ac37b6f6591c9a)
- scripts/phase6a-audit.ts (4,620 bytes; sha256 97a16fb8188645a6)
- scripts/phase7a-audit.ts (5,523 bytes; sha256 203841e84fde91c0)
- scripts/phase8a-audit.ts (4,473 bytes; sha256 feb734b3c1486ebf)
- scripts/phase9a-audit.ts (5,232 bytes; sha256 f2a3a1da18115043)
- scripts/process-logos-v2.cjs (2,191 bytes; sha256 7d48560521a58c32)
- scripts/process-logos.cjs (2,742 bytes; sha256 cc6529d8632cd57f)
- scripts/rebuild-taxonomy.ts (21,396 bytes; sha256 484d89257ac67c69)
- scripts/security-check.ts (4,982 bytes; sha256 4852267f2fe3e68e)
- scripts/seed-articles.ts (6,757 bytes; sha256 6c21d4d227c82b43)
- scripts/seed-brands-300.ts (25,147 bytes; sha256 d609785280d0a37b)
- scripts/seed-essential.ts (6,454 bytes; sha256 71507d4b0aebc05c)
- scripts/seed-kill-switch.ts (1,230 bytes; sha256 d376670731120883)
- scripts/seed-plans.ts (2,786 bytes; sha256 cee1aede0bfa2312)
- scripts/seed-store-comprehensive.ts (93,864 bytes; sha256 68b2a8a30ed9bfba)
- scripts/start-dev.sh (617 bytes; sha256 fbbed21528a22151)
- src/components/compare/ComparePageClient.tsx (14,539 bytes; sha256 188a9e6cac442c97)
- src/components/listings/PriceIntelligence.tsx (6,106 bytes; sha256 5296a683929d89a4)
- src/lib/price-intelligence.ts (10,638 bytes; sha256 210a139026d5caf3)

### Path conflicts / different content — 318
- bun.lock (archive 9b17cb87b9bd8612, current 5f87c56b7ca34450)
- Caddyfile (archive 89b7a9c04929989f, current 0cea634d6c242a2a)
- docker-compose.yml (archive 0d42a764e63e951e, current 783519da9d4f11c5)
- eslint.config.mjs (archive df387bbcfc5d725d, current bb2526b10f9ed909)
- next.config.ts (archive 0688173a5452d653, current 58c07768d56c6a29)
- package.json (archive e2968bdeb5dbd21d, current daa8703a7642c9ea)
- tsconfig.json (archive d437e3fd4cd98f43, current 5bc65fd9f5fdba54)
- worklog.md (archive 74ee479aae95442d, current cf0cde5185c812fb)
- docs/ADR-001-database-strategy.md (archive 6f11fac67510f4db, current 4486a0acb0c96a32)
- prisma/migrations/migration_lock.toml (archive 7f03d8d364877ccc, current 99836963713b4f5b)
- prisma/schema.prisma (archive 474d631d7c1fb53a, current 2119b9d14ef4d990)
- prisma/seed-ai-policies.ts (archive dbc4e2444f2c95a3, current cfe1049ca592149b)
- prisma/seed-phase5-intelligence.ts (archive 18b21ee15dd2a509, current 16a3ff3c0e88f522)
- prisma/seed-rbac.ts (archive 3c32dff9ceec357e, current b94fb9cf34afced9)
- prisma/seed-user-roles.ts (archive dadfb43b25890c03, current ad1a1a58d1f23832)
- scripts/backup.sh (archive e930b5967b478024, current 4193f378f6b8052e)
- scripts/migrate-sqlite-to-postgres.ts (archive cb1c08592d9c8438, current e99fcc716d9f8458)
- scripts/restore.sh (archive 8aad5a7fbd503050, current fa3139965080d46a)
- src/app/admin/dashboard/page.tsx (archive 505192626dbb8ee4, current b28b21cb5305a9fc)
- src/app/admin/deal-rooms/AdminDealRoomsClient.tsx (archive a2ce8ed91ef0b14a, current b683ffef9816b0e2)
- src/app/admin/home/hero/page.tsx (archive 76381bd362c5cac8, current a0dbbe85c7d16d80)
- src/app/admin/inspections/AdminInspectionsClient.tsx (archive 954a12770739b969, current 5f8c3e645baa88d8)
- src/app/admin/layout.tsx (archive ea9c8a05535154ce, current 3156fefa2e1ade93)
- src/app/admin/listings/AdminListingsClient.tsx (archive 5b3541505dde1902, current dba2015b245b4be1)
- src/app/admin/listings/[id]/edit/ListingEditForm.tsx (archive 73f779ff97fc0d6b, current 310b8d8b14f3c9b4)
- src/app/admin/listings/[id]/edit/page.tsx (archive 72543a12e47d2ebe, current 6bfb8d54d6deaa7a)
- src/app/admin/price-intelligence/page.tsx (archive cf62d2b8b904c7ae, current 0dc8363322ee4354)
- src/app/admin/procurement/page.tsx (archive dd5ac7fe930d3b3e, current 97f1c8b6630b45fd)
- src/app/admin/seo/SEOAdminClient.tsx (archive f405d97a11fb68bb, current 0e08237e6eaff368)
- src/app/admin/subscriptions/PaymentsAdminClient.tsx (archive 21faac6c90175df9, current e04e80b7c23e3a60)
- src/app/admin/subscriptions/PlansAdminClient.tsx (archive 06737999fdcfbdfa, current 20d5221cc4ab553e)
- src/app/admin/taxonomy/brands/[id]/BrandControlCenter.tsx (archive 22341db33092f00d, current 48520854a0b35041)
- src/app/admin/transport/AdminTransportClient.tsx (archive 5b1ee11e3739dfa2, current 6ddcf89f2b3b9ddf)
- src/app/api/admin/ai-agents/route.ts (archive f08ec8884031d5f0, current 4b62a6484a9b9c8e)
- src/app/api/admin/ai-agents/[id]/route.ts (archive f2e57f73013dd2f5, current 687c7aba4b74e599)
- src/app/api/admin/ai-budget/route.ts (archive a1109e3d9c202b47, current 068da4493402af01)
- src/app/api/admin/ai-content-factory/route.ts (archive 9e6081c986173af7, current 6d30d46ef08154d3)
- src/app/api/admin/ai-evaluation/route.ts (archive 33ce02d599734f87, current f6afd5010d16578a)
- src/app/api/admin/ai-policies/[taskType]/route.ts (archive 56eca554173ea698, current 5343f96e61844a3e)
- src/app/api/admin/ai-scraper/route.ts (archive ccfc5111cf54cfbe, current be34ed5023b1667a)
- src/app/api/admin/alerts/match/route.ts (archive 142dae40057fa37d, current a067e3f4011676a5)
- src/app/api/admin/articles/route.ts (archive 27d811291475a5db, current 47935104175e2d3f)
- src/app/api/admin/articles/[id]/route.ts (archive 33e8c189a100a268, current ce2499b6741ce1a9)
- src/app/api/admin/attachments/route.ts (archive d539d5a6ddadf88e, current 073b078476a94d63)
- src/app/api/admin/attachments/[id]/route.ts (archive 5adcca3679b28733, current eb28e55f17b1a269)
- src/app/api/admin/auctions/route.ts (archive ccb436ce39aaec33, current 07fd537d021089e8)
- src/app/api/admin/auctions/[id]/route.ts (archive 874e967fa0acd000, current 59663ea01acefebb)
- src/app/api/admin/audit-log/route.ts (archive dfd228e39891b89f, current 727b739493d6846b)
- src/app/api/admin/backup/route.ts (archive 30285a3926f76013, current 711422cc0c27ae78)
- src/app/api/admin/brands/without-logos/route.ts (archive 67b0efa4305271a6, current b1b32d6003e4b122)
- src/app/api/admin/brands/[id]/logo/route.ts (archive 543f5e42b042eaad, current 0eb5e0f74e464eb1)
- src/app/api/admin/brands/[id]/search-logo/route.ts (archive d654e2ba2434709f, current 6e72b6c7e653c037)
- src/app/api/admin/brands-ai/route.ts (archive af2d1f6d54003653, current 50a37b34d8893ba4)
- src/app/api/admin/catalog-health/route.ts (archive 25f72dcb8dc47eaa, current 3d7e6c3fa2a07b66)
- src/app/api/admin/categories/without-images/route.ts (archive 94f33abff6e89588, current 9cd1c38081245a19)
- src/app/api/admin/categories/[id]/generate-image/route.ts (archive fe880b827f3c8915, current a9ef25cac08f4b11)
- src/app/api/admin/cleanup-unverified/route.ts (archive 100ecff73f6b1f65, current 89eaf09cd1837c7f)
- src/app/api/admin/companies/route.ts (archive fec75da56dae2205, current 01c055f75c5f0905)
- src/app/api/admin/companies/[id]/branches/route.ts (archive ace0df04eb627c8e, current b27672483891877d)
- src/app/api/admin/companies/[id]/branches/[branchId]/route.ts (archive 3adb0f16332e68eb, current 6bb19fee75757972)
- src/app/api/admin/companies/[id]/documents/route.ts (archive 1553bc58c48879b3, current 6c7b98fa07d674fa)
- src/app/api/admin/companies/[id]/documents/[docId]/route.ts (archive db7adc1b443d1be7, current 10815765d86fc126)
- src/app/api/admin/companies/[id]/route.ts (archive 3d35433dbb31028b, current 36d11539d3d1fcf5)
- src/app/api/admin/companies/[id]/verifications/route.ts (archive c19ac51a72cd091c, current af6b738f1c492f6c)
- src/app/api/admin/companies/[id]/verifications/[verId]/route.ts (archive 74b29988fa1042e2, current ceb513466d6c7b1c)
- src/app/api/admin/compare/route.ts (archive fba31d8a2cfe198a, current 66297f95613422d9)
- src/app/api/admin/compare/[id]/route.ts (archive 333d5530aea1a12b, current ca300f8046a8d942)
- src/app/api/admin/compatibility-edges/route.ts (archive 670d248635f9956d, current c9ad5c8b73c134b1)
- src/app/api/admin/compatibility-edges/[id]/route.ts (archive 3052b73a1cc6d697, current c44ef904c3791d48)
- src/app/api/admin/content-decay/route.ts (archive 9fd7d1acdedb7407, current b2bd0d6e74b082c4)
- src/app/api/admin/demand-signals/route.ts (archive 962c01ae13ceb042, current 9bc98df9782f7d43)
- src/app/api/admin/dictionary/route.ts (archive 4d2c6aa8d247178f, current 9bf97b584543bdbb)
- src/app/api/admin/dictionary/[id]/route.ts (archive 0e1aedb6016f149a, current 1fa0d4665968b23b)
- src/app/api/admin/feature-flags/route.ts (archive fdbfe5f5cdf70975, current 024f17081c6d1581)
- src/app/api/admin/feature-flags/[id]/route.ts (archive 8f8419c1e1feb799, current 370ca4cf1bd819a7)
- src/app/api/admin/growth-engine/route.ts (archive 52785dbf270b534d, current 64c0ad5eb70f08b2)
- src/app/api/admin/hero/route.ts (archive 57beceb0612140e5, current 6b05769d91a953b4)
- src/app/api/admin/home/categories/route.ts (archive ae3ac9e8bf93aeaa, current b284d214a6d051c3)
- src/app/api/admin/home/trusted-brands/route.ts (archive ed157a3700918529, current 6c4ecbfdfadedd13)
- src/app/api/admin/home/verified-machines/route.ts (archive 09656ef6492ae567, current d3fb473d99dab36a)
- src/app/api/admin/homepage-sections/route.ts (archive fa48a2a83a37b937, current f1efa648659a7473)
- src/app/api/admin/hot-searches/route.ts (archive 5ad8e783703e8dcc, current c73cf6c4803f8931)
- src/app/api/admin/hot-searches/[id]/route.ts (archive 85aa945acdc749e5, current 659cb3b9fa18729f)
- src/app/api/admin/inspections/route.ts (archive 19d20a2128086124, current 70a0f675de603992)
- src/app/api/admin/jobs/route.ts (archive 45d93b364c160341, current e27fc2798ff23a36)
- src/app/api/admin/jobs/[id]/route.ts (archive 89d9890bbb693ed5, current 575d3e2beb141531)
- src/app/api/admin/knowledge/generate-article/route.ts (archive 8aa77a56598357dc, current 58aeb2616bfc96aa)
- src/app/api/admin/knowledge/generate-image/route.ts (archive 215f268c2d649c6f, current 0e2c68316b0ca21a)
- src/app/api/admin/knowledge-entries/route.ts (archive 99344e3b1fe68ba9, current d0e7a903e8645289)
- src/app/api/admin/knowledge-entries/[id]/route.ts (archive 5f0e786b0ae628d2, current 895e0b58e5b5edb1)
- src/app/api/admin/launch-phases/route.ts (archive ac0b7a01e58e888c, current 7a4c3789b0c5b27e)
- src/app/api/admin/launch-phases/[id]/route.ts (archive 704ad429707398c1, current dc5a4a563fa251d7)
- src/app/api/admin/lifecycle/route.ts (archive 4931a1163a63c97f, current 467ade5bcfe4be1a)
- src/app/api/admin/listings/route.ts (archive 14fc660b9e0eb2d6, current 2b541656771296b0)
- src/app/api/admin/listings/[id]/reject/route.ts (archive 419193b5da6dd285, current 60363341f500e0d8)
- src/app/api/admin/listings/[id]/route.ts (archive 4caf48206251be7d, current 16e53809e52882ed)
- src/app/api/admin/machines/route.ts (archive b9dd7cf0ba86ffc2, current fa2f7c021a4c3248)
- src/app/api/admin/machines/[id]/route.ts (archive 099e97f8746050e3, current 437f3f201c1f8e18)
- src/app/api/admin/market-intelligence/route.ts (archive 0ea4f061d6853fda, current af7a75e40b64f21d)
- src/app/api/admin/matching/run/route.ts (archive ff27980a3c9295c2, current 02e80b7e3bb5b6bd)
- ... 218 additional rows omitted.

### Identical files — 466
- components.json
- postcss.config.mjs
- scripts-test-prisma.ts
- tailwind.config.ts
- vitest.config.ts
- docs/HEAVIX-ARCHITECTURE-OVERVIEW.md
- docs/HEAVIX-AUDIT-2026-09-20.md
- docs/HEAVIX-COMPLETION-MASTER-SPEC-V1.0.md
- docs/HEAVIX-CORRECTED-REFERENCE-V1.1.md
- docs/HEAVIX-DATA-GOVERNANCE-V1.md
- docs/HEAVIX-IMPLEMENTATION-GAP-AUDIT.md
- docs/HEAVIX-MACHINE-COMPARISON-SPEC-V1.0.md
- docs/HEAVIX-MASTER-DOCUMENT.md
- docs/HEAVIX-MASTER-EXECUTION-PLAN-V2.0.md
- docs/HEAVIX-MASTER-STRATEGY.md
- docs/HEAVIX-OPERATIONAL-EXECUTION-PLAN-V1.0.md
- docs/HEAVIX-P0-IMPLEMENTATION-PLAN.md
- docs/HEAVIX-PRICE-ESTIMATION-SPEC-V1.0.md
- docs/HEAVIX-PROJECT-PRINCIPLES.md
- docs/HEAVIX-PROJECT-REFERENCE.md
- docs/HEAVIX-REQUIREMENTS-CORRECTIONS.md
- docs/HEAVIX-SECURITY-BASELINE-V1.md
- mini-services/.gitkeep
- prisma/generate-sale-images.ts
- prisma/legacy-sqlite/schema.prisma
- prisma/legacy-sqlite/store-schema.prisma
- prisma/migrate-passwords.ts
- prisma/run-ai-agents.ts
- prisma/seed-attribute-catalog.ts
- prisma/seed-attributes.ts
- prisma/seed-brands-a.ts
- prisma/seed-brands-b.ts
- prisma/seed-catalog.ts
- prisma/seed-listing-attributes.ts
- prisma/seed-listing-images.ts
- prisma/seed-machine-taxonomy.ts
- prisma/seed-p2-auction-company-rental.ts
- prisma/seed-phase2-catalog-core.ts
- prisma/seed-phase3-catalog.ts
- prisma/seed-phase3a-listing-domain.ts
- prisma/seed-phase3b-seller-company.ts
- prisma/seed-phase3c-moderation.ts
- prisma/seed-phase4-marketplace.ts
- prisma/seed-phase6-7-automation-monetization.ts
- prisma/seed-price-observations.ts
- prisma/seed-services.ts
- prisma/seed-site-stats.ts
- prisma/seed-store.ts
- prisma/seed-taxonomy-v11.ts
- prisma/seed-taxonomy.ts
- prisma/seed.ts
- prisma/test-ai-gateway.ts
- src/app/admin/ai-agents/AIAgentsAdminClient.tsx
- src/app/admin/ai-agents/page.tsx
- src/app/admin/ai-analyst/page.tsx
- src/app/admin/ai-budget/page.tsx
- src/app/admin/ai-evaluation/page.tsx
- src/app/admin/ai-gateway/page.tsx
- src/app/admin/ai-scraper/page.tsx
- src/app/admin/analytics/page.tsx
- src/app/admin/analytics/TimeRangeSelector.tsx
- src/app/admin/api-keys/page.tsx
- src/app/admin/articles/page.tsx
- src/app/admin/auctions/page.tsx
- src/app/admin/audit-log/AuditLogClient.tsx
- src/app/admin/audit-log/page.tsx
- src/app/admin/automations/page.tsx
- src/app/admin/brand-families/page.tsx
- src/app/admin/brands/BrandAIAssistant.tsx
- src/app/admin/brands/new/page.tsx
- src/app/admin/brands/page.tsx
- src/app/admin/catalog-health/page.tsx
- src/app/admin/categories/BatchActions/BatchGenerateImagesButton.tsx
- src/app/admin/categories/CategoryTreeExplorer.tsx
- src/app/admin/categories/new/page.tsx
- src/app/admin/categories/page.tsx
- src/app/admin/companies/CompaniesAdminClient.tsx
- src/app/admin/companies/page.tsx
- src/app/admin/companies/[id]/CompanyDetailClient.tsx
- src/app/admin/companies/[id]/page.tsx
- src/app/admin/companies/[id]/PartnershipSection.tsx
- src/app/admin/compare/page.tsx
- src/app/admin/compatibility/CompatibilityManager.tsx
- src/app/admin/compatibility/page.tsx
- src/app/admin/content-decay/page.tsx
- src/app/admin/content-factory/page.tsx
- src/app/admin/courses/page.tsx
- src/app/admin/deal-rooms/page.tsx
- src/app/admin/demand-engine/DemandEngineClient.tsx
- src/app/admin/demand-engine/page.tsx
- src/app/admin/demand-signals/page.tsx
- src/app/admin/dictionary/page.tsx
- src/app/admin/feature-flags/page.tsx
- src/app/admin/growth-engine/page.tsx
- src/app/admin/home/categories/page.tsx
- src/app/admin/home/footer/page.tsx
- src/app/admin/home/header/page.tsx
- src/app/admin/home/page.tsx
- src/app/admin/home/trusted-brands/page.tsx
- src/app/admin/home/verified-machines/page.tsx
- ... 366 additional rows omitted.

### Excluded files — 7
- db/backups/custom-20260921-023810.db — EXCLUDE_DATABASE_OR_BACKUP
- db/backups/custom-20260921-024013.db — EXCLUDE_DATABASE_OR_BACKUP
- db/backups/custom-20260921-025202.db — EXCLUDE_DATABASE_OR_BACKUP
- db/custom.db — EXCLUDE_DATABASE_OR_BACKUP
- db/custom.db.before-restore — EXCLUDE_DATABASE_OR_BACKUP
- db/store.db — EXCLUDE_DATABASE_OR_BACKUP
- .env — EXCLUDE_SECRET_OR_KEY

### Binary files requiring manual review — 1
- src/lib/generated/store-client/query_engine_bg.wasm (2,171,299 bytes; sha256 7ec8cd57e69e5e06)

## db.zip

- Archive bytes: 2,399,229
- Archive SHA-256: 57a997a51c26214d0554cf91641fdf03fcf0a2f4c4abefd79081b1ad04fb9e84
- ZIP entries: 6; normalized prefix retained: True
- Uncompressed bytes examined: 13,066,240
- Counts: EXCLUDE_DATABASE_OR_BACKUP=6

### Missing candidates (not imported)

None.

### Path conflicts / different content

None.

### Identical files

None.

### Excluded files — 6
- db/backups/custom-20260921-023810.db — EXCLUDE_DATABASE_OR_BACKUP
- db/backups/custom-20260921-024013.db — EXCLUDE_DATABASE_OR_BACKUP
- db/backups/custom-20260921-025202.db — EXCLUDE_DATABASE_OR_BACKUP
- db/custom.db — EXCLUDE_DATABASE_OR_BACKUP
- db/custom.db.before-restore — EXCLUDE_DATABASE_OR_BACKUP
- db/store.db — EXCLUDE_DATABASE_OR_BACKUP

### Binary files requiring manual review

None.

## docs.zip

- Archive bytes: 55,629
- Archive SHA-256: 7096b79001bf05a93256290dfe7ce31f353cd1f3ea0c492a3c773744a83db6b4
- ZIP entries: 18; normalized prefix retained: True
- Uncompressed bytes examined: 121,811
- Counts: conflict=1, identical=17

### Missing candidates (not imported)

None.

### Path conflicts / different content — 1
- docs/ADR-001-database-strategy.md (archive 6f11fac67510f4db, current 4486a0acb0c96a32)

### Identical files — 17
- docs/HEAVIX-ARCHITECTURE-OVERVIEW.md
- docs/HEAVIX-AUDIT-2026-09-20.md
- docs/HEAVIX-COMPLETION-MASTER-SPEC-V1.0.md
- docs/HEAVIX-CORRECTED-REFERENCE-V1.1.md
- docs/HEAVIX-DATA-GOVERNANCE-V1.md
- docs/HEAVIX-IMPLEMENTATION-GAP-AUDIT.md
- docs/HEAVIX-MACHINE-COMPARISON-SPEC-V1.0.md
- docs/HEAVIX-MASTER-DOCUMENT.md
- docs/HEAVIX-MASTER-EXECUTION-PLAN-V2.0.md
- docs/HEAVIX-MASTER-STRATEGY.md
- docs/HEAVIX-OPERATIONAL-EXECUTION-PLAN-V1.0.md
- docs/HEAVIX-P0-IMPLEMENTATION-PLAN.md
- docs/HEAVIX-PRICE-ESTIMATION-SPEC-V1.0.md
- docs/HEAVIX-PROJECT-PRINCIPLES.md
- docs/HEAVIX-PROJECT-REFERENCE.md
- docs/HEAVIX-REQUIREMENTS-CORRECTIONS.md
- docs/HEAVIX-SECURITY-BASELINE-V1.md

### Excluded files

None.

### Binary files requiring manual review

None.

## download.zip

- Archive bytes: 389
- Archive SHA-256: 031a0ef099aaf5b1c5b0ecd4a9f28ae6dc6ddeb7a459ba368d631070231ca883
- ZIP entries: 1; normalized prefix retained: True
- Uncompressed bytes examined: 34
- Counts: identical=1

### Missing candidates (not imported)

None.

### Path conflicts / different content

None.

### Identical files — 1
- download/README.md

### Excluded files

None.

### Binary files requiring manual review

None.

## examples.zip

- Archive bytes: 3,703
- Archive SHA-256: 399b45a6dc256d9a8f2ddbe96dc4d89afa9c277dbd4691563cc0a234f3f88bbe
- ZIP entries: 2; normalized prefix retained: True
- Uncompressed bytes examined: 9,846
- Counts: identical=2

### Missing candidates (not imported)

None.

### Path conflicts / different content

None.

### Identical files — 2
- examples/websocket/frontend.tsx
- examples/websocket/server.ts

### Excluded files

None.

### Binary files requiring manual review

None.

## mini-services.zip

- Archive bytes: 376
- Archive SHA-256: ede3e4c1db0b2d8eff1bdde03ff62fb08bc16e3212260236c74900e58e2b94fb
- ZIP entries: 1; normalized prefix retained: True
- Uncompressed bytes examined: 0
- Counts: identical=1

### Missing candidates (not imported)

None.

### Path conflicts / different content

None.

### Identical files — 1
- mini-services/.gitkeep

### Excluded files

None.

### Binary files requiring manual review

None.

## prisma.zip

- Archive bytes: 203,686
- Archive SHA-256: 03fb62fd41b10a34f4158a79738d510091615e20b117508abfd71346a7188848
- ZIP entries: 39; normalized prefix retained: True
- Uncompressed bytes examined: 879,745
- Counts: conflict=6, identical=29, missing=4

### Missing candidates (not imported) — 4
- prisma/migrations/0_init/migration.sql (43,031 bytes; sha256 272a6c503ec07d25)
- prisma/migrations/README.md (3,663 bytes; sha256 30aab09f35a83421)
- prisma/seed-price-records.ts (2,551 bytes; sha256 4147b88d2ba37b24)
- prisma/store-schema.prisma (12,802 bytes; sha256 2c668c93dd0edd11)

### Path conflicts / different content — 6
- prisma/migrations/migration_lock.toml (archive 7f03d8d364877ccc, current 99836963713b4f5b)
- prisma/schema.prisma (archive 474d631d7c1fb53a, current 2119b9d14ef4d990)
- prisma/seed-ai-policies.ts (archive dbc4e2444f2c95a3, current cfe1049ca592149b)
- prisma/seed-phase5-intelligence.ts (archive 18b21ee15dd2a509, current 16a3ff3c0e88f522)
- prisma/seed-rbac.ts (archive 3c32dff9ceec357e, current b94fb9cf34afced9)
- prisma/seed-user-roles.ts (archive dadfb43b25890c03, current ad1a1a58d1f23832)

### Identical files — 29
- prisma/generate-sale-images.ts
- prisma/legacy-sqlite/schema.prisma
- prisma/legacy-sqlite/store-schema.prisma
- prisma/migrate-passwords.ts
- prisma/run-ai-agents.ts
- prisma/seed-attribute-catalog.ts
- prisma/seed-attributes.ts
- prisma/seed-brands-a.ts
- prisma/seed-brands-b.ts
- prisma/seed-catalog.ts
- prisma/seed-listing-attributes.ts
- prisma/seed-listing-images.ts
- prisma/seed-machine-taxonomy.ts
- prisma/seed-p2-auction-company-rental.ts
- prisma/seed-phase2-catalog-core.ts
- prisma/seed-phase3-catalog.ts
- prisma/seed-phase3a-listing-domain.ts
- prisma/seed-phase3b-seller-company.ts
- prisma/seed-phase3c-moderation.ts
- prisma/seed-phase4-marketplace.ts
- prisma/seed-phase6-7-automation-monetization.ts
- prisma/seed-price-observations.ts
- prisma/seed-services.ts
- prisma/seed-site-stats.ts
- prisma/seed-store.ts
- prisma/seed-taxonomy-v11.ts
- prisma/seed-taxonomy.ts
- prisma/seed.ts
- prisma/test-ai-gateway.ts

### Excluded files

None.

### Binary files requiring manual review

None.

## public.zip

- Archive bytes: 3,693,360
- Archive SHA-256: 18eb5868a59f2037ba5f130a1b267ff48be80a3f1581234d3bc7a78891ce0d5c
- ZIP entries: 38; normalized prefix retained: True
- Uncompressed bytes examined: 3,742,618
- Counts: identical=37, missing=1

### Missing candidates (not imported) — 1
- public/robots.txt (160 bytes; sha256 a3d27b3ca5ce3234)

### Path conflicts / different content

None.

### Identical files — 37
- public/images/hero/card-exclusive.png
- public/images/hero/card-featured.png
- public/images/hero/card-services.png
- public/images/hero/hero-construction.png
- public/images/hero/hero-mining.png
- public/images/hero/hero-road.png
- public/images/machinery/dump-truck.png
- public/images/machinery/excavator.png
- public/images/machinery/grader.png
- public/images/machinery/loader.png
- public/images/sections/agriculture.png
- public/images/sections/mining.png
- public/images/sections/parts.png
- public/images/sections/road-construction.png
- public/images/sections/services.png
- public/images/sell-in-7-days/step-1.jpg
- public/images/sell-in-7-days/step-2.jpg
- public/images/sell-in-7-days/step-3.jpg
- public/images/sell-in-7-days/step-4.jpg
- public/logo.svg
- public/logos/aria-logo.svg
- public/logos/heavix-logo-white.svg
- public/logos/heavix-logo.png
- public/logos/heavix-logo.svg
- public/logos/mekanix-logo-white.svg
- public/logos/mekanix-logo.png
- public/logos/mekanix-logo.svg
- public/manifest.json
- public/uploads/1790048850304-y2p2m34r.png
- public/uploads/6c9f5a290c9dd9e6dab73167.jpg
- public/uploads/b2272dbf4484c93fa47d75b3.jpg
- public/uploads/categories/bulldozer-4b7b376a.png
- public/uploads/categories/excavator-74f81cee.png
- public/uploads/categories/grader-d5c33ee0.png
- public/uploads/categories/loader-e0610bfe.png
- public/uploads/categories/machinery-7dcefb95.png
- public/uploads/hero/1789640786981-m1f04v.png

### Excluded files

None.

### Binary files requiring manual review

None.

## scripts.zip

- Archive bytes: 62,321
- Archive SHA-256: 57346b79919d680662e2698d33fbc6ca079d5651ad415b95b69925d52b9ca93a
- ZIP entries: 25; normalized prefix retained: True
- Uncompressed bytes examined: 224,654
- Counts: conflict=3, missing=22

### Missing candidates (not imported) — 22
- scripts/catalog-health.ts (3,491 bytes; sha256 66ca01577dda5d87)
- scripts/clear-logo.ts (361 bytes; sha256 cc83dba621047ffe)
- scripts/make-logos-dark.cjs (2,536 bytes; sha256 a5c743624d9664f5)
- scripts/orange-ix.cjs (2,891 bytes; sha256 b975fbab077d5145)
- scripts/phase10a-audit.ts (4,319 bytes; sha256 8ac48d883abb3fcf)
- scripts/phase11a-audit.ts (3,465 bytes; sha256 fdf4c82c95afda5e)
- scripts/phase5a-audit.ts (6,947 bytes; sha256 50ac37b6f6591c9a)
- scripts/phase6a-audit.ts (4,620 bytes; sha256 97a16fb8188645a6)
- scripts/phase7a-audit.ts (5,523 bytes; sha256 203841e84fde91c0)
- scripts/phase8a-audit.ts (4,473 bytes; sha256 feb734b3c1486ebf)
- scripts/phase9a-audit.ts (5,232 bytes; sha256 f2a3a1da18115043)
- scripts/process-logos-v2.cjs (2,191 bytes; sha256 7d48560521a58c32)
- scripts/process-logos.cjs (2,742 bytes; sha256 cc6529d8632cd57f)
- scripts/rebuild-taxonomy.ts (21,396 bytes; sha256 484d89257ac67c69)
- scripts/security-check.ts (4,982 bytes; sha256 4852267f2fe3e68e)
- scripts/seed-articles.ts (6,757 bytes; sha256 6c21d4d227c82b43)
- scripts/seed-brands-300.ts (25,147 bytes; sha256 d609785280d0a37b)
- scripts/seed-essential.ts (6,454 bytes; sha256 71507d4b0aebc05c)
- scripts/seed-kill-switch.ts (1,230 bytes; sha256 d376670731120883)
- scripts/seed-plans.ts (2,786 bytes; sha256 cee1aede0bfa2312)
- scripts/seed-store-comprehensive.ts (93,864 bytes; sha256 68b2a8a30ed9bfba)
- scripts/start-dev.sh (617 bytes; sha256 fbbed21528a22151)

### Path conflicts / different content — 3
- scripts/backup.sh (archive e930b5967b478024, current 4193f378f6b8052e)
- scripts/migrate-sqlite-to-postgres.ts (archive cb1c08592d9c8438, current e99fcc716d9f8458)
- scripts/restore.sh (archive 8aad5a7fbd503050, current fa3139965080d46a)

### Identical files

None.

### Excluded files

None.

### Binary files requiring manual review

None.

## src.zip

- Archive bytes: 10,866,241
- Archive SHA-256: 5ec7314f356cc69646584f39d304fd0095f35240ac0f9ebbc2831161b3789496
- ZIP entries: 717; normalized prefix retained: True
- Uncompressed bytes examined: 27,760,700
- Counts: conflict=299, identical=414, missing=3, review_binary=1

### Missing candidates (not imported) — 3
- src/components/compare/ComparePageClient.tsx (14,539 bytes; sha256 188a9e6cac442c97)
- src/components/listings/PriceIntelligence.tsx (6,106 bytes; sha256 5296a683929d89a4)
- src/lib/price-intelligence.ts (10,638 bytes; sha256 210a139026d5caf3)

### Path conflicts / different content — 299
- src/app/admin/dashboard/page.tsx (archive 505192626dbb8ee4, current b28b21cb5305a9fc)
- src/app/admin/deal-rooms/AdminDealRoomsClient.tsx (archive a2ce8ed91ef0b14a, current b683ffef9816b0e2)
- src/app/admin/home/hero/page.tsx (archive 76381bd362c5cac8, current a0dbbe85c7d16d80)
- src/app/admin/inspections/AdminInspectionsClient.tsx (archive 954a12770739b969, current 5f8c3e645baa88d8)
- src/app/admin/layout.tsx (archive ea9c8a05535154ce, current 3156fefa2e1ade93)
- src/app/admin/listings/AdminListingsClient.tsx (archive 5b3541505dde1902, current dba2015b245b4be1)
- src/app/admin/listings/[id]/edit/ListingEditForm.tsx (archive 73f779ff97fc0d6b, current 310b8d8b14f3c9b4)
- src/app/admin/listings/[id]/edit/page.tsx (archive 72543a12e47d2ebe, current 6bfb8d54d6deaa7a)
- src/app/admin/price-intelligence/page.tsx (archive cf62d2b8b904c7ae, current 0dc8363322ee4354)
- src/app/admin/procurement/page.tsx (archive dd5ac7fe930d3b3e, current 97f1c8b6630b45fd)
- src/app/admin/seo/SEOAdminClient.tsx (archive f405d97a11fb68bb, current 0e08237e6eaff368)
- src/app/admin/subscriptions/PaymentsAdminClient.tsx (archive 21faac6c90175df9, current e04e80b7c23e3a60)
- src/app/admin/subscriptions/PlansAdminClient.tsx (archive 06737999fdcfbdfa, current 20d5221cc4ab553e)
- src/app/admin/taxonomy/brands/[id]/BrandControlCenter.tsx (archive 22341db33092f00d, current 48520854a0b35041)
- src/app/admin/transport/AdminTransportClient.tsx (archive 5b1ee11e3739dfa2, current 6ddcf89f2b3b9ddf)
- src/app/api/admin/ai-agents/route.ts (archive f08ec8884031d5f0, current 4b62a6484a9b9c8e)
- src/app/api/admin/ai-agents/[id]/route.ts (archive f2e57f73013dd2f5, current 687c7aba4b74e599)
- src/app/api/admin/ai-budget/route.ts (archive a1109e3d9c202b47, current 068da4493402af01)
- src/app/api/admin/ai-content-factory/route.ts (archive 9e6081c986173af7, current 6d30d46ef08154d3)
- src/app/api/admin/ai-evaluation/route.ts (archive 33ce02d599734f87, current f6afd5010d16578a)
- src/app/api/admin/ai-policies/[taskType]/route.ts (archive 56eca554173ea698, current 5343f96e61844a3e)
- src/app/api/admin/ai-scraper/route.ts (archive ccfc5111cf54cfbe, current be34ed5023b1667a)
- src/app/api/admin/alerts/match/route.ts (archive 142dae40057fa37d, current a067e3f4011676a5)
- src/app/api/admin/articles/route.ts (archive 27d811291475a5db, current 47935104175e2d3f)
- src/app/api/admin/articles/[id]/route.ts (archive 33e8c189a100a268, current ce2499b6741ce1a9)
- src/app/api/admin/attachments/route.ts (archive d539d5a6ddadf88e, current 073b078476a94d63)
- src/app/api/admin/attachments/[id]/route.ts (archive 5adcca3679b28733, current eb28e55f17b1a269)
- src/app/api/admin/auctions/route.ts (archive ccb436ce39aaec33, current 07fd537d021089e8)
- src/app/api/admin/auctions/[id]/route.ts (archive 874e967fa0acd000, current 59663ea01acefebb)
- src/app/api/admin/audit-log/route.ts (archive dfd228e39891b89f, current 727b739493d6846b)
- src/app/api/admin/backup/route.ts (archive 30285a3926f76013, current 711422cc0c27ae78)
- src/app/api/admin/brands/without-logos/route.ts (archive 67b0efa4305271a6, current b1b32d6003e4b122)
- src/app/api/admin/brands/[id]/logo/route.ts (archive 543f5e42b042eaad, current 0eb5e0f74e464eb1)
- src/app/api/admin/brands/[id]/search-logo/route.ts (archive d654e2ba2434709f, current 6e72b6c7e653c037)
- src/app/api/admin/brands-ai/route.ts (archive af2d1f6d54003653, current 50a37b34d8893ba4)
- src/app/api/admin/catalog-health/route.ts (archive 25f72dcb8dc47eaa, current 3d7e6c3fa2a07b66)
- src/app/api/admin/categories/without-images/route.ts (archive 94f33abff6e89588, current 9cd1c38081245a19)
- src/app/api/admin/categories/[id]/generate-image/route.ts (archive fe880b827f3c8915, current a9ef25cac08f4b11)
- src/app/api/admin/cleanup-unverified/route.ts (archive 100ecff73f6b1f65, current 89eaf09cd1837c7f)
- src/app/api/admin/companies/route.ts (archive fec75da56dae2205, current 01c055f75c5f0905)
- src/app/api/admin/companies/[id]/branches/route.ts (archive ace0df04eb627c8e, current b27672483891877d)
- src/app/api/admin/companies/[id]/branches/[branchId]/route.ts (archive 3adb0f16332e68eb, current 6bb19fee75757972)
- src/app/api/admin/companies/[id]/documents/route.ts (archive 1553bc58c48879b3, current 6c7b98fa07d674fa)
- src/app/api/admin/companies/[id]/documents/[docId]/route.ts (archive db7adc1b443d1be7, current 10815765d86fc126)
- src/app/api/admin/companies/[id]/route.ts (archive 3d35433dbb31028b, current 36d11539d3d1fcf5)
- src/app/api/admin/companies/[id]/verifications/route.ts (archive c19ac51a72cd091c, current af6b738f1c492f6c)
- src/app/api/admin/companies/[id]/verifications/[verId]/route.ts (archive 74b29988fa1042e2, current ceb513466d6c7b1c)
- src/app/api/admin/compare/route.ts (archive fba31d8a2cfe198a, current 66297f95613422d9)
- src/app/api/admin/compare/[id]/route.ts (archive 333d5530aea1a12b, current ca300f8046a8d942)
- src/app/api/admin/compatibility-edges/route.ts (archive 670d248635f9956d, current c9ad5c8b73c134b1)
- src/app/api/admin/compatibility-edges/[id]/route.ts (archive 3052b73a1cc6d697, current c44ef904c3791d48)
- src/app/api/admin/content-decay/route.ts (archive 9fd7d1acdedb7407, current b2bd0d6e74b082c4)
- src/app/api/admin/demand-signals/route.ts (archive 962c01ae13ceb042, current 9bc98df9782f7d43)
- src/app/api/admin/dictionary/route.ts (archive 4d2c6aa8d247178f, current 9bf97b584543bdbb)
- src/app/api/admin/dictionary/[id]/route.ts (archive 0e1aedb6016f149a, current 1fa0d4665968b23b)
- src/app/api/admin/feature-flags/route.ts (archive fdbfe5f5cdf70975, current 024f17081c6d1581)
- src/app/api/admin/feature-flags/[id]/route.ts (archive 8f8419c1e1feb799, current 370ca4cf1bd819a7)
- src/app/api/admin/growth-engine/route.ts (archive 52785dbf270b534d, current 64c0ad5eb70f08b2)
- src/app/api/admin/hero/route.ts (archive 57beceb0612140e5, current 6b05769d91a953b4)
- src/app/api/admin/home/categories/route.ts (archive ae3ac9e8bf93aeaa, current b284d214a6d051c3)
- src/app/api/admin/home/trusted-brands/route.ts (archive ed157a3700918529, current 6c4ecbfdfadedd13)
- src/app/api/admin/home/verified-machines/route.ts (archive 09656ef6492ae567, current d3fb473d99dab36a)
- src/app/api/admin/homepage-sections/route.ts (archive fa48a2a83a37b937, current f1efa648659a7473)
- src/app/api/admin/hot-searches/route.ts (archive 5ad8e783703e8dcc, current c73cf6c4803f8931)
- src/app/api/admin/hot-searches/[id]/route.ts (archive 85aa945acdc749e5, current 659cb3b9fa18729f)
- src/app/api/admin/inspections/route.ts (archive 19d20a2128086124, current 70a0f675de603992)
- src/app/api/admin/jobs/route.ts (archive 45d93b364c160341, current e27fc2798ff23a36)
- src/app/api/admin/jobs/[id]/route.ts (archive 89d9890bbb693ed5, current 575d3e2beb141531)
- src/app/api/admin/knowledge/generate-article/route.ts (archive 8aa77a56598357dc, current 58aeb2616bfc96aa)
- src/app/api/admin/knowledge/generate-image/route.ts (archive 215f268c2d649c6f, current 0e2c68316b0ca21a)
- src/app/api/admin/knowledge-entries/route.ts (archive 99344e3b1fe68ba9, current d0e7a903e8645289)
- src/app/api/admin/knowledge-entries/[id]/route.ts (archive 5f0e786b0ae628d2, current 895e0b58e5b5edb1)
- src/app/api/admin/launch-phases/route.ts (archive ac0b7a01e58e888c, current 7a4c3789b0c5b27e)
- src/app/api/admin/launch-phases/[id]/route.ts (archive 704ad429707398c1, current dc5a4a563fa251d7)
- src/app/api/admin/lifecycle/route.ts (archive 4931a1163a63c97f, current 467ade5bcfe4be1a)
- src/app/api/admin/listings/route.ts (archive 14fc660b9e0eb2d6, current 2b541656771296b0)
- src/app/api/admin/listings/[id]/reject/route.ts (archive 419193b5da6dd285, current 60363341f500e0d8)
- src/app/api/admin/listings/[id]/route.ts (archive 4caf48206251be7d, current 16e53809e52882ed)
- src/app/api/admin/machines/route.ts (archive b9dd7cf0ba86ffc2, current fa2f7c021a4c3248)
- src/app/api/admin/machines/[id]/route.ts (archive 099e97f8746050e3, current 437f3f201c1f8e18)
- src/app/api/admin/market-intelligence/route.ts (archive 0ea4f061d6853fda, current af7a75e40b64f21d)
- src/app/api/admin/matching/run/route.ts (archive ff27980a3c9295c2, current 02e80b7e3bb5b6bd)
- src/app/api/admin/media-library/route.ts (archive 01b081870957ba9e, current 40c69d3f0c3a9c52)
- src/app/api/admin/menu/route.ts (archive 5ec8af4c314d57d2, current 7eb97cd4360bc3c1)
- src/app/api/admin/menu/[id]/route.ts (archive 9b7e47e6c5dd075a, current f0393c839b547f9a)
- src/app/api/admin/moderation/route.ts (archive db58c3c29246e2fb, current 245ae91475fe5272)
- src/app/api/admin/offers-all/route.ts (archive 5042889416d8e5fb, current aa1b487d4f6d9ffc)
- src/app/api/admin/offers-all/[id]/route.ts (archive c3b7e3f403d11870, current 03ced39a62b471ff)
- src/app/api/admin/opportunities/route.ts (archive 810a27a5371ab901, current 4fcf653bce6cb403)
- src/app/api/admin/opportunity-radar/route.ts (archive 7c203897a75e8c21, current d2e814aca41be2a5)
- src/app/api/admin/parts/route.ts (archive 7b3ba6e3b0d3a31c, current 2aeec767b926caae)
- src/app/api/admin/parts/[id]/route.ts (archive 7aa771afeeaa06ef, current 1f666cad5aae730d)
- src/app/api/admin/payments/route.ts (archive 893b8c48ede270c8, current c82da5a264dd1d58)
- src/app/api/admin/pricing/observations/route.ts (archive 783ccfe93d5785eb, current 91ca1cca68039083)
- src/app/api/admin/pricing/override/route.ts (archive a8e59b248490331d, current 29c55f2970cf6c17)
- src/app/api/admin/products/route.ts (archive c21cd0ed7dd067e3, current 53e87c34ec14d623)
- src/app/api/admin/products/[id]/route.ts (archive 40711ee5be9059f2, current a28444c826a71055)
- src/app/api/admin/reels/route.ts (archive e3cd6514031a1688, current c1e9ca7964681622)
- src/app/api/admin/rejections/[id]/route.ts (archive 9ce162a54c22a13b, current f58f9f9d43e69768)
- src/app/api/admin/rejections-all/route.ts (archive 1a02af392886e422, current 6c05909de01edb85)
- ... 199 additional rows omitted.

### Identical files — 414
- src/app/admin/ai-agents/AIAgentsAdminClient.tsx
- src/app/admin/ai-agents/page.tsx
- src/app/admin/ai-analyst/page.tsx
- src/app/admin/ai-budget/page.tsx
- src/app/admin/ai-evaluation/page.tsx
- src/app/admin/ai-gateway/page.tsx
- src/app/admin/ai-scraper/page.tsx
- src/app/admin/analytics/page.tsx
- src/app/admin/analytics/TimeRangeSelector.tsx
- src/app/admin/api-keys/page.tsx
- src/app/admin/articles/page.tsx
- src/app/admin/auctions/page.tsx
- src/app/admin/audit-log/AuditLogClient.tsx
- src/app/admin/audit-log/page.tsx
- src/app/admin/automations/page.tsx
- src/app/admin/brand-families/page.tsx
- src/app/admin/brands/BrandAIAssistant.tsx
- src/app/admin/brands/new/page.tsx
- src/app/admin/brands/page.tsx
- src/app/admin/catalog-health/page.tsx
- src/app/admin/categories/BatchActions/BatchGenerateImagesButton.tsx
- src/app/admin/categories/CategoryTreeExplorer.tsx
- src/app/admin/categories/new/page.tsx
- src/app/admin/categories/page.tsx
- src/app/admin/companies/CompaniesAdminClient.tsx
- src/app/admin/companies/page.tsx
- src/app/admin/companies/[id]/CompanyDetailClient.tsx
- src/app/admin/companies/[id]/page.tsx
- src/app/admin/companies/[id]/PartnershipSection.tsx
- src/app/admin/compare/page.tsx
- src/app/admin/compatibility/CompatibilityManager.tsx
- src/app/admin/compatibility/page.tsx
- src/app/admin/content-decay/page.tsx
- src/app/admin/content-factory/page.tsx
- src/app/admin/courses/page.tsx
- src/app/admin/deal-rooms/page.tsx
- src/app/admin/demand-engine/DemandEngineClient.tsx
- src/app/admin/demand-engine/page.tsx
- src/app/admin/demand-signals/page.tsx
- src/app/admin/dictionary/page.tsx
- src/app/admin/feature-flags/page.tsx
- src/app/admin/growth-engine/page.tsx
- src/app/admin/home/categories/page.tsx
- src/app/admin/home/footer/page.tsx
- src/app/admin/home/header/page.tsx
- src/app/admin/home/page.tsx
- src/app/admin/home/trusted-brands/page.tsx
- src/app/admin/home/verified-machines/page.tsx
- src/app/admin/homepage-layout/page.tsx
- src/app/admin/hot-searches/page.tsx
- src/app/admin/inspections/page.tsx
- src/app/admin/jobs/JobsAdminClient.tsx
- src/app/admin/jobs/page.tsx
- src/app/admin/knowledge/page.tsx
- src/app/admin/knowledge-graph/page.tsx
- src/app/admin/launch-phases/page.tsx
- src/app/admin/lifecycle/page.tsx
- src/app/admin/listings/page.tsx
- src/app/admin/LogoutButton.tsx
- src/app/admin/market-heatmap/page.tsx
- src/app/admin/market-intelligence/page.tsx
- src/app/admin/media/page.tsx
- src/app/admin/menu/page.tsx
- src/app/admin/moderation/ModerationAdminClient.tsx
- src/app/admin/moderation/page.tsx
- src/app/admin/offers/OfferActions.tsx
- src/app/admin/offers/page.tsx
- src/app/admin/opportunities/OpportunitiesAdminClient.tsx
- src/app/admin/opportunities/page.tsx
- src/app/admin/opportunity-radar/page.tsx
- src/app/admin/page.tsx
- src/app/admin/partners/page.tsx
- src/app/admin/policies/page.tsx
- src/app/admin/price-intelligence/PriceIntelligenceClient.tsx
- src/app/admin/pricing/page.tsx
- src/app/admin/pricing/PricingEngineClient.tsx
- src/app/admin/products/page.tsx
- src/app/admin/products/ProductsAdminClient.tsx
- src/app/admin/products/[id]/edit/page.tsx
- src/app/admin/products/[id]/edit/ProductEditForm.tsx
- src/app/admin/reels/page.tsx
- src/app/admin/rejections/page.tsx
- src/app/admin/requests/page.tsx
- src/app/admin/reviews/page.tsx
- src/app/admin/rfq/page.tsx
- src/app/admin/sell-in-7-days/page.tsx
- src/app/admin/sell-in-7-days/Sell7SettingsCard.tsx
- src/app/admin/sell-in-7-days/SellIn7AdminClient.tsx
- src/app/admin/seo/page.tsx
- src/app/admin/services/page.tsx
- src/app/admin/settings/page.tsx
- src/app/admin/settings/SettingsForm.tsx
- src/app/admin/settings/SiteSettingsForm.tsx
- src/app/admin/site-stats/page.tsx
- src/app/admin/social-reels/page.tsx
- src/app/admin/social-reels/SocialReelsAdminClient.tsx
- src/app/admin/store/ai-scraper/page.tsx
- src/app/admin/store/brands/page.tsx
- src/app/admin/store/car-models/page.tsx
- src/app/admin/store/categories/page.tsx
- ... 314 additional rows omitted.

### Excluded files

None.

### Binary files requiring manual review — 1
- src/lib/generated/store-client/query_engine_bg.wasm (2,171,299 bytes; sha256 7ec8cd57e69e5e06)

## tests.zip

- Archive bytes: 32,545
- Archive SHA-256: baffb992037c7c40da1dd195faa945c8119f12eb1205d38a7d3d21e7780dbb61
- ZIP entries: 20; normalized prefix retained: True
- Uncompressed bytes examined: 110,656
- Counts: conflict=5, identical=15

### Missing candidates (not imported)

None.

### Path conflicts / different content — 5
- tests/database-runtime-build.sh (archive fb6a5409625ec93f, current bfd1f232f0df1a56)
- tests/integration/auth.test.ts (archive 4a4532d73eb00d02, current 38dd05e32e8cebc0)
- tests/phase6-price-compare.test.ts (archive 899d7ddbfca53b42, current 5ccdc2fc0366be08)
- tests/phase7-rfq-matching.test.ts (archive 95b9f3373b7d356a, current c154d4eb70264be3)
- tests/unit/rbac.test.ts (archive 243f20e008c6406c, current b72332e7df6c2efa)

### Identical files — 15
- tests/phase1-hardening.test.ts
- tests/phase10-reviews-reputation.test.ts
- tests/phase11-notifications.test.ts
- tests/phase3-marketplace.test.ts
- tests/phase4-search.test.ts
- tests/phase5-trust.test.ts
- tests/phase8-messaging.test.ts
- tests/phase9-orders-deals.test.ts
- tests/python-runtime-build.sh
- tests/python-runtime-container.sh
- tests/README.md
- tests/unit/brand-alias.test.ts
- tests/unit/password.test.ts
- tests/unit/rate-limit.test.ts
- tests/unit/upload-security.test.ts

### Excluded files

None.

### Binary files requiring manual review

None.

## upload.zip

- Archive bytes: 2,925,087
- Archive SHA-256: c788e05ae1ea99cc470658b7265dd6212249d4b954166eb373c13c3e7c2604ad
- ZIP entries: 17; normalized prefix retained: True
- Uncompressed bytes examined: 7,029,134
- Counts: EXCLUDE_DATABASE_OR_BACKUP=2, missing=15

### Missing candidates (not imported) — 15
- upload/HEAVIX-AUDIT-2026-09-20.md (14,978 bytes; sha256 b1d719cc378873de)
- upload/HEAVIX-COMPLETION-SPECIFICATION-V1.0.md (34,619 bytes; sha256 d66fb87f48039d0e)
- upload/HEAVIX-CORRECTED-REFERENCE-V1.1.md (4,828 bytes; sha256 aad6b918540e740f)
- upload/HEAVIX-DATA-GOVERNANCE-V1.md (2,082 bytes; sha256 eb3c6148f63208d0)
- upload/HEAVIX-EXECUTABLE-HARDENING-PATCH-V1.0.zip (9,654 bytes; sha256 8c5c630a8140baab)
- upload/HEAVIX-P0-IMPLEMENTATION-PLAN.md (3,475 bytes; sha256 50ef6d958e096f45)
- upload/heavix-postgres-migration-changes.zip (211,336 bytes; sha256 c44b7424695befaf)
- upload/HEAVIX-PRICE-COMPARISON-DOCUMENTS-V1.0.zip (4,765 bytes; sha256 7568cd1903a63507)
- upload/HEAVIX-SECURITY-BASELINE-V1.md (2,210 bytes; sha256 024f4a7422e54bb6)
- upload/IMG_20260921_134636_188.jpg (47,186 bytes; sha256 5135900667a2cff0)
- upload/IMG_20260921_134636_634.jpg (34,352 bytes; sha256 1b3af1a7b98a1d22)
- upload/IMG_20260921_134636_663.jpg (25,054 bytes; sha256 d8558f1f7c1e9f9b)
- upload/IMG_20260921_134636_703.jpg (23,874 bytes; sha256 a028b309c41d32c6)
- upload/IMG_20260921_134636_839.jpg (12,666 bytes; sha256 039371554dcbbb21)
- upload/workspace-d08ba835-4223-4b4a-9627-838c96185efa (1).tar (1,539,495 bytes; sha256 b8f83e3689662d31)

### Path conflicts / different content

None.

### Identical files

None.

### Excluded files — 2
- upload/custom-20260921-024013.db — EXCLUDE_DATABASE_OR_BACKUP
- upload/custom-20260921-025202.db — EXCLUDE_DATABASE_OR_BACKUP

### Binary files requiring manual review

None.

## Cross-archive collisions

