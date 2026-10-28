# Legacy reference phase 0 — provenance records

**Status: PARTIAL / provenance-only. Not a source-content archive.**

- Legacy repository: [HEAVIXIR/z](https://github.com/HEAVIXIR/z)
- Pinned source tree: `217f98ecc800aa64ae4739d27ed2aeb95dd260ed`
- Target baseline for this phase: `348e8a3ca606a073f1dc4dc7b6b02ec642791b50`
- Governing disposition: [VALUE-BASED-DISPOSITION-2026-10-27.md](../VALUE-BASED-DISPOSITION-2026-10-27.md), §5
- Scope: 19 `PRESERVE_AS_REFERENCE` records, docs-only; no runtime files, DB changes, credentials, or production operations.

## Important evidence limitation

The legacy repository tree exposes 13 root-level ZIP archives rather than the extracted member files. This execution environment could not download the ZIP bytes, so **the actual member contents and member-level SHA-256 hashes have not been verified or copied**. The archive-family column below is a path-based expectation, not a verified member mapping. The individual files in this directory are provenance records only and must not be represented as copies of the legacy source files.

Before declaring Phase 0 complete, retrieve the pinned ZIPs in an environment with repository download access, list and match the exact members without inspecting any SAFE_ARCHIVE content, extract only the 19 approved reference members, compute SHA-256 on those extracted files, and review them for secrets/unsafe paths before committing source text. Do not extract or inspect `.env`, database, image, TAR, or patch-ZIP contents as part of this phase.

## Records

| # | Legacy member path | Record | Expected archive family (unverified) |
|---:|---|---|---|
| 1 | `.zscripts/dev.pid` | [dev-pid-convention.md](./infrastructure/dev-pid-convention.md) | `.zscripts.zip` |
| 2 | `prisma/migrations/0_init/migration.sql` | [legacy-sqlite-initial-migration.md](./prisma/legacy-sqlite-initial-migration.md) | `prisma.zip` |
| 3 | `prisma/store-schema.prisma` | [legacy-flat-store-schema.md](./prisma/legacy-flat-store-schema.md) | `prisma.zip` |
| 4 | `scripts/seed-articles.ts` | [seed-articles.md](./scripts/seed-articles.md) | `scripts.zip` |
| 5 | `scripts/seed-brands-300.ts` | [seed-brands-300.md](./scripts/seed-brands-300.md) | `scripts.zip` |
| 6 | `scripts/seed-essential.ts` | [seed-essential.md](./scripts/seed-essential.md) | `scripts.zip` |
| 7 | `scripts/seed-kill-switch.ts` | [seed-kill-switch.md](./scripts/seed-kill-switch.md) | `scripts.zip` |
| 8 | `scripts/seed-plans.ts` | [seed-plans.md](./scripts/seed-plans.md) | `scripts.zip` |
| 9 | `scripts/clear-logo.ts` | [clear-logo.md](./scripts/clear-logo.md) | `scripts.zip` |
| 10 | `scripts/orange-ix.cjs` | [orange-ix.md](./scripts/orange-ix.md) | `scripts.zip` |
| 11 | `scripts/process-logos-v2.cjs` | [process-logos-v2.md](./scripts/process-logos-v2.md) | `scripts.zip` |
| 12 | `scripts/start-dev.sh` | [start-dev.md](./scripts/start-dev.md) | `scripts.zip` |
| 13 | `public/robots.txt` | [static-robots-txt.md](./public/static-robots-txt.md) | `public.zip` |
| 14 | `upload/HEAVIX-AUDIT-2026-09-20.md` | [canonical-doc-audit-2026-09-20.md](./uploads/canonical-doc-audit-2026-09-20.md) | `upload.zip` |
| 15 | `upload/HEAVIX-COMPLETION-SPECIFICATION-V1.0.md` | [canonical-doc-completion-spec-v1.md](./uploads/canonical-doc-completion-spec-v1.md) | `upload.zip` |
| 16 | `upload/HEAVIX-CORRECTED-REFERENCE-V1.1.md` | [canonical-doc-corrected-reference-v1-1.md](./uploads/canonical-doc-corrected-reference-v1-1.md) | `upload.zip` |
| 17 | `upload/HEAVIX-DATA-GOVERNANCE-V1.md` | [canonical-doc-data-governance-v1.md](./uploads/canonical-doc-data-governance-v1.md) | `upload.zip` |
| 18 | `upload/HEAVIX-P0-IMPLEMENTATION-PLAN.md` | [canonical-doc-p0-implementation-plan.md](./uploads/canonical-doc-p0-implementation-plan.md) | `upload.zip` |
| 19 | `upload/HEAVIX-SECURITY-BASELINE-V1.md` | [canonical-doc-security-baseline-v1.md](./uploads/canonical-doc-security-baseline-v1.md) | `upload.zip` |

## Completion gate

- [ ] Verify exact ZIP member paths at the pinned source commit.
- [ ] Verify content SHA-256 for every extracted member.
- [ ] Secret scan the 19 reference candidates; redact/reject any sensitive content.
- [ ] Compare the six upload documents against canonical target docs and preserve only genuinely unique material.
- [ ] Confirm historical migration/schema and static robots are stored outside runtime paths.
- [ ] Independent review + CI before merge.
