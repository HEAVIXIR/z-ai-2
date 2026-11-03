# Candidate Review — Files Only in Old Repo

Total candidates: 27

The canonical decisions are in `DECISION-MATRIX.csv`. This document must match it.

| # | Path | Size | Assessment | Decision |
|---|------|------|------------|----------|
| 1 | prisma/migrations/0_init/migration.sql | 43031 | SQLite migration — incompatible with PostgreSQL | REJECT |
| 2 | prisma/store-schema.prisma | 12802 | SQLite store schema — incompatible with PostgreSQL | REJECT |
| 3 | scripts/start-dev.sh | 617 | Dev script with hardcoded paths | REJECT |
| 4 | scripts/clear-logo.ts | 361 | Modifies operational SiteSettings (logoUrl/footerLogoUrl) — not an image tool | REJECT |
| 5 | scripts/phase5a-audit.ts | 6947 | Trust domain audit — needs model adaptation | ADAPT |
| 6 | scripts/phase6a-audit.ts | 4620 | Price audit — depends on obsolete PriceRecord | ADAPT |
| 7 | scripts/phase7a-audit.ts | 5523 | RFQ audit — needs model and API adaptation | ADAPT |
| 8 | scripts/phase8a-audit.ts | 4473 | Messaging audit — needs model adaptation | ADAPT |
| 9 | scripts/phase9a-audit.ts | 5232 | Transactions audit — old Deal/Order assumptions | ADAPT |
| 10 | scripts/phase10a-audit.ts | 4319 | Reviews audit — static claims need verification | ADAPT |
| 11 | scripts/phase11a-audit.ts | 3465 | Notifications audit — static claims need verification | ADAPT |
| 12 | scripts/security-check.ts | 4982 | Security audit — regex checks insufficient | ADAPT |
| 13 | scripts/seed-articles.ts | 6757 | Seed script — needs dual-schema adaptation | ADAPT |
| 14 | scripts/seed-brands-300.ts | 25147 | Seed script — needs dual-schema adaptation | ADAPT |
| 15 | scripts/seed-essential.ts | 6454 | Seed script — modifies site settings | ADAPT |
| 16 | scripts/seed-kill-switch.ts | 1230 | Seed script — modifies feature flags | ADAPT |
| 17 | scripts/seed-plans.ts | 2786 | Seed script — modifies subscription plans | ADAPT |
| 18 | scripts/seed-store-comprehensive.ts | 93864 | Seed script — modifies prices and inventory | ADAPT |
| 19 | scripts/rebuild-taxonomy.ts | 21396 | Taxonomy rebuild — deleteMany is dangerous | ADAPT |
| 20 | scripts/make-logos-dark.cjs | 2536 | Logo dark variant generator | ADAPT |
| 21 | scripts/orange-ix.cjs | 2891 | Logo orange tint tool | ADAPT |
| 22 | scripts/process-logos-v2.cjs | 2191 | Logo processor v2 | ADAPT |
| 23 | scripts/process-logos.cjs | 2742 | Logo processor v1 | ADAPT |
| 24 | src/components/compare/ComparePageClient.tsx | 14539 | Compare UI — API contract mismatch | ADAPT |
| 25 | src/components/listings/PriceIntelligence.tsx | 6106 | Price intelligence UI — field mismatch | ADAPT |
| 26 | src/lib/ai-gateway-service.ts | 5874 | AI Gateway — bypasses policy/audit/auth | ADAPT |
| 27 | src/lib/price-intelligence.ts | 10638 | Price intelligence — uses obsolete PriceRecord | ADAPT |

## Summary

- ADAPT: 23
- REJECT: 4
- REVIEW: 0

All 7 phase audit scripts promoted from REVIEW to ADAPT after individual content
review by the senior manager (PR #175 review 5752391009). clear-logo.ts demoted
from ADAPT to REJECT after content review revealed it modifies operational
SiteSettings, not an image processing utility.

DECISION-MATRIX.csv is the canonical source of truth for all decisions.
