# Issue #144 — Post-merge provenance artifact review

**Review date:** 2026-10-27  
**Target main:** `dca8a3ea647b8d4eb7b4bb87e3e8bf1b4e643e5b`  
**Workflow run:** [#40564633812 — Legacy archive provenance inventory](https://github.com/HEAVIXIR/z-ai-2/actions/runs/40564633812)  
**Artifact:** `legacy-member-provenance`, artifact ID `12761534267`, SHA-256 `44cb8381a838468b9eaba376258a061fd170b1b4037be0bf40125eab2f0c8518`  
**Pinned legacy source:** `HEAVIXIR/z@217f98ecc800aa64ae4739d27ed2aeb95dd260ed`

## Executive result

The post-merge run was fetched from GitHub Actions and its artifact was downloaded and inspected. The run is `push` on `main`, has `head_sha=dca8a3e`, and completed with `success`. The artifact contains the expected three files: `summary.json`, `legacy-member-provenance.csv`, and `legacy-unique-path-hashes.csv`.

**Decision: no archived application source is approved for blind or bulk import.** The current evidence supports keeping the existing manifest dispositions. The purpose of this update is to record the fresh, reproducible artifact metrics; it does not change the manifest or application code.

## Reproduced inventory metrics

| Metric | Artifact value | Interpretation |
|---|---:|---|
| Root-level ZIP archives | 13 | All listed archives passed ZIP validation |
| File-entry occurrences | 1,715 | Repeated members across archives count more than once |
| Unique member paths / path-hash pairs | 909 | Deduplicated paths in the generated unique-path report |
| Unique paths already tracked in target | 855 | Includes identical and content-different files |
| Unique paths absent from target | 54 | Matches the 54-row import decision manifest |
| Identical target-content occurrences | 981 | Archive-entry rows, not unique files |
| Content-different target-content occurrences | 646 | Archive-entry rows requiring caution, not authorization to replace |
| Target paths with content mismatches | 331 | Distinct tracked paths with differing legacy content hashes |
| Target paths with multiple legacy hashes | 0 | No same-path/multiple-hash ambiguity in this inventory |
| Unmapped unique paths | 0 | Every unique path has a manifest/tracked-path disposition |
| Secret values emitted | No | Artifact contains metadata and hashes, not matched secret values |
| Archive members extracted or executed by workflow | No | The workflow reads members in memory |

### Count semantics

The older archive-refresh report also mentioned 2,751 archive entries. That figure counts ZIP entries including directory entries. The current provenance CSV is file-only: 1,715 file occurrences across the 13 archives. These are different counting grains, not evidence of lost files. Unique-path totals must not be added to archive-occurrence totals.

## Decision manifest coverage

The manifest contains 54 absent-from-target paths, each with an explicit decision. Its conservative classes include:

- **Exclude:** environment/secret material, runtime state, database files, unverified uploads, patch/workspace archives, and duplicate startup artifacts.
- **Reject:** stale migrations, duplicate schema/routes, obsolete audit/security tools, incompatible API/UI contracts, deprecated model use, and direct seed import.
- **Hold:** data-mutating seed/taxonomy scripts, asset-mutating logo tools, canonical-document reconciliation, and migration-archive review.
- **Rewrite before import:** six legacy phase-audit scripts whose existing forms were found to have disabled type checking, error masking, broad reads, or single-schema assumptions.

The existing line-by-line audit records the file-level rationale. This artifact does not independently re-review source code; it verifies the inventory and its path/hash/manifest reconciliation.

## Prisma reconciliation gate

The current target has two separate PostgreSQL Prisma schemas:
- `prisma/schema.prisma` using `DATABASE_URL`
- `prisma/store/schema.prisma` using `STORE_DATABASE_URL`

The legacy ZIPs include SQLite database files and a legacy migration/schema path. None should be copied or executed as a substitute for the current PostgreSQL migration history. The prior Prisma comparison recorded in Issue #144 says the legacy schemas are not canonical and that the deprecated `PriceRecord` model is superseded by `PriceObservation`. Any future schema or migration proposal must identify the exact model/field delta, target schema, generated-client impact, migration-history compatibility, rollback strategy, and tests. This report authorizes **no** migration, seed, backfill, or database mutation.

A Prisma console URL/account alone is not evidence that the current application is connected to a Prisma-managed database or Accelerate. Before relying on any Prisma-hosted feature, separately verify project/environment, connection ownership, billing/plan and deprecation status, and whether the app actually uses that service. Do not paste credentials or connection strings into issues or commits.

## Transfer decision

No product gap has been demonstrated by the fresh inventory alone. The 331 differing tracked paths are candidates for comparison only; they are not permission to overwrite current code. The 54 absent paths remain governed by the existing manifest and line-by-line audit. No application files were copied in this change.

A future code-transfer PR should be opened only after all of the following are documented for the specific candidate: current feature gap, source hash and line-level review, target contract, dependency and security review, focused tests, and evidence that the current implementation does not already satisfy the requirement.

## Safety and scope

- Read-only inspection of the GitHub Actions artifact.
- No archive extraction into the repository and no archived code execution.
- No secrets or secret values included.
- No production deployment, DNS change, Worker activation, paid-resource provisioning, production database mutation, seed, migration, backfill, or bulk import.
