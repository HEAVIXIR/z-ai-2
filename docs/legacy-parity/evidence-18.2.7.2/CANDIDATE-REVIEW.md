# Candidate Review — Files Only in Old Repo

Total candidates: 27

| # | Path | Size | Assessment | Decision |
|---|------|------|------------|----------|
| 1 | prisma/migrations/0_init/migration.sql | 43031 | SQLite migration/schema — incompatible with PostgreSQL | REJECT |
| 2 | prisma/store-schema.prisma | 12802 | SQLite migration/schema — incompatible with PostgreSQL | REJECT |
| 3 | scripts/clear-logo.ts | 361 | Image processing utility — parameter-driven | ADAPT |
| 4 | scripts/make-logos-dark.cjs | 2536 | Image processing utility — parameter-driven | ADAPT |
| 5 | scripts/orange-ix.cjs | 2891 | Image processing utility — parameter-driven | ADAPT |
| 6 | scripts/phase5a-audit.ts | 6947 | Unknown — needs review | REVIEW |
| 7 | scripts/phase6a-audit.ts | 4620 | Unknown — needs review | REVIEW |
| 8 | scripts/phase7a-audit.ts | 5523 | Unknown — needs review | REVIEW |
| 9 | scripts/phase8a-audit.ts | 4473 | Unknown — needs review | REVIEW |
| 10 | scripts/phase9a-audit.ts | 5232 | Unknown — needs review | REVIEW |
| 11 | scripts/phase10a-audit.ts | 4319 | Unknown — needs review | REVIEW |
| 12 | scripts/phase11a-audit.ts | 3465 | Unknown — needs review | REVIEW |
| 13 | scripts/process-logos-v2.cjs | 2191 | Image processing utility — parameter-driven | ADAPT |
| 14 | scripts/process-logos.cjs | 2742 | Image processing utility — parameter-driven | ADAPT |
| 15 | scripts/rebuild-taxonomy.ts | 21396 | Taxonomy rebuild tool — needs current schema | ADAPT |
| 16 | scripts/security-check.ts | 4982 | Security audit script — regex checks insufficient | ADAPT |
| 17 | scripts/seed-articles.ts | 6757 | Seed script — needs adaptation to dual-schema | ADAPT |
| 18 | scripts/seed-brands-300.ts | 25147 | Seed script — needs adaptation to dual-schema | ADAPT |
| 19 | scripts/seed-essential.ts | 6454 | Seed script — needs adaptation to dual-schema | ADAPT |
| 20 | scripts/seed-kill-switch.ts | 1230 | Seed script — needs adaptation to dual-schema | ADAPT |
| 21 | scripts/seed-plans.ts | 2786 | Seed script — needs adaptation to dual-schema | ADAPT |
| 22 | scripts/seed-store-comprehensive.ts | 93864 | Seed script — needs adaptation to dual-schema | ADAPT |
| 23 | scripts/start-dev.sh | 617 | Dev script with hardcoded paths | REJECT |
| 24 | src/components/compare/ComparePageClient.tsx | 14539 | Compare UI — needs API contract adaptation | ADAPT |
| 25 | src/components/listings/PriceIntelligence.tsx | 6106 | Price intelligence UI — needs API adaptation | ADAPT |
| 26 | src/lib/ai-gateway-service.ts | 5874 | AI Gateway — old architecture, bypasses policy/audit | ADAPT |
| 27 | src/lib/price-intelligence.ts | 10638 | Price intelligence — uses PriceRecord (old model) | ADAPT |

## Summary

- ADAPT: 24
- REJECT: 3
