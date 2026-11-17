# HEAVIX legacy archive provenance and source reconciliation

> Read-only report based on the manually dispatched archive inventory and exact historical source-hash comparisons. This report identifies provenance and source drift; it does **not** choose canonical taxonomy, brand, or attribute records and does not authorize any seed, migration, or database write.

## 1. Verified execution

- Repository: `HEAVIXIR/z-ai-2`
- Branch: `integration/preview-readiness-workerd-2026-11-15`
- Target commit: `4a92096d2d6697e36287f56e23f7c03da0cde566`
- Workflow: `Legacy archive provenance inventory`
- Workflow run: [44081068912](https://github.com/HEAVIXIR/z-ai-2/actions/runs/44081068912) — **success**
- Job: `Read-only archive/member hash inventory` — **success**
- Artifact: `legacy-member-provenance`, ID `14328005542`, 194,156 bytes
- Artifact ZIP SHA-256: `c4382b3fa5889ac854a74febd4344c86be3fd691cbcc11674b542faecfb800fb`
- Pinned legacy archive repository commit: `HEAVIXIR/z@217f98ecc800aa64ae4739d27ed2aeb95dd260ed`

The workflow read ZIP members in memory. It did not extract or execute archive members. It emitted paths, SHA-256 hashes, sizes, CRCs, and manifest dispositions only. The generated summary explicitly reports `secret_values_emitted=false`, `archive_members_extracted=false`, and `archive_members_executed=false`.

## 2. Archive inventory results

All 13 root-level ZIP archives were valid.

| Archive | File entries |
|---|---:|
| `.zscripts.zip` | 10 |
| `bun.zip` | 821 |
| `db.zip` | 6 |
| `docs.zip` | 18 |
| `download.zip` | 1 |
| `examples.zip` | 2 |
| `mini-services.zip` | 1 |
| `prisma.zip` | 39 |
| `public.zip` | 38 |
| `scripts.zip` | 25 |
| `src.zip` | 717 |
| `tests.zip` | 20 |
| `upload.zip` | 17 |
| **Total** | **1,715** |

Inventory totals:

- 1,715 archive file occurrences.
- 909 unique member paths / unique path-content pairs.
- All 54 paths in the existing import manifest were present in the archive.
- 445 unique paths were already present with identical content.
- 383 unique paths were already present but had different content hashes and require review.
- 27 unique paths were unmapped in the manifest. All 27 are under `src/lib/generated/store-client/` and are generated Store Client outputs; they are not missing taxonomy or seed-source files.
- No path had multiple distinct legacy content hashes across the pinned archives.

The 383 content differences are not automatic import candidates. A mismatch means only that the archived bytes differ from the tracked target bytes; it does not establish which version is authoritative.

## 3. Historical source snapshot recovered by exact hash

The archived `prisma.zip` members were compared against historical files in `HEAVIXIR/z-ai-2` at commit `500aa1faf26c`. The following seven archive-member SHA-256 values match the corresponding historical file contents exactly:

| Archived member | Exact SHA-256 match to commit `500aa1faf26c` |
|---|---|
| `prisma/seed-machine-taxonomy.ts` | `6d90b332518305ef913862cd4417d458b5d3982e486dd25e6e30b756a5ac6bce` |
| `prisma/seed-taxonomy.ts` | `7f978b985e007e668786be418108e076d780ac01430f41432ca795c72f3398dd` |
| `prisma/seed-brands-a.ts` | `57edaf75f91ffb4ca62536aa75f52a9483a3faebd8f2a88b43be4ac680a246f7` |
| `prisma/seed-brands-b.ts` | `0ad430a2e81457ba48bc1b1f10f223e62602f5283ee918cbb7316892c6860c9c` |
| `prisma/seed-attributes.ts` | `1acbabe78afa2f7cfd66c8918db85898f5d825c44b912aa0a09812e0511bf5d7` |
| `prisma/seed-attribute-catalog.ts` | `4c3ef76f6447a91f912e1298c54bca568e1d9f5f4a7d27af3de75799d1fc83b0` |
| `docs/HEAVIX-CORRECTED-REFERENCE-V1.1.md` | `aad6b918540e740faf9d362f15f249ca6f4467f9e45de1004780aed80cf8ae18` |

This establishes a verifiable historical source point for these seven files. It does not establish that their contents are the current canonical business decision.

## 4. Machine taxonomy: exact old-to-current delta

The archived `prisma/seed-machine-taxonomy.ts` exactly matches the file at historical commit `500aa1faf26c`. Its `TREE` contains:

| Level | Archived historical source | Current Integration source |
|---|---:|---:|
| L1 groups | 16 | 16 |
| L2 families | 172 | 182 |
| L3 variants | 97 | 104 |
| **Total tree records** | **285** | **302** |

The current Integration tree has 17 additional slugs: 10 at L2 and 7 at L3. The comparison found no removed old slugs and no changed primary labels among the shared slugs.

Additional L2 entries:
- `wagon-drill`
- `aerial-platform`
- `industrial-pumps`
- `industrial-fans`
- `boilers`
- `hvac-equipment`
- `cutting-equipment`
- `transformers`
- `switchgears`
- `fuel-station-equipment`

Additional L3 entries:
- `fuel-dispenser`
- `fuel-storage-tank`
- `submersible-fuel-pump`
- `tank-monitoring-system`
- `fuel-filtration`
- `fuel-hose-nozzle`
- `vapour-recovery-equipment`

This explains the 285-versus-302 source-tree difference. It does **not** reconcile either count with the separate historical 539-category database snapshot. The archived machine seed also describes updates to category names, parents, sort order, levels, and paths, plus deactivation of old L1 groups. It must remain excluded from execution under the current runbook.

## 5. Brand seed source inventory

The exact-hash-matched archived brand arrays contain:

| Source | Brand entries |
|---|---:|
| `prisma/seed-brands-a.ts` | 197 |
| `prisma/seed-brands-b.ts` | 450 |
| **Total source entries** | **647** |

Across both arrays, the source produces 621 distinct slug candidates and 25 repeated slug values. A read-only comparison of all 25 repeated-slug groups found that every repeated group uses the same English and Persian brand names; the repeated entries are re-upserts of the same brand identity with additional industry assignments, not 25 separate brand identities. Atlas Copco appears three times; the other 24 slug groups appear twice. The repeated slugs are: `caterpillar`, `cat`, `perkins`, `hitachi`, `jcb`, `kobelco`, `doosan`, `kubota`, `yanmar`, `wacker-neuson`, `lovol`, `atlas-copco`, `kaishan`, `metso`, `weir`, `clark`, `putzmeister`, `schwing`, `mack`, `deutz`, `dongfeng`, `foton`, `carraro`, `bkt`, and `bandit`. Some entries overlap existing industry assignments and others add industries; they must be reconciled at the relationship level rather than counted as additional brands. The current Phase B helper is additive for industry links and preserves curated identity fields by default.

The source header for Phase A declares 39 industries and 18 brand families. These source-array counts are not interchangeable with the separate 629-brand historical database target.

The current Integration copy retains the same 197 Phase A entries. In Phase B, 449 of 450 brand objects are unchanged from the archived historical source. One entry differs: Iveco. Current Integration marks that entry with `refreshIdentity: true`; the current upsert helper uses that flag to refresh identity metadata (including name, country, type/status, verification, website, featured state, family, and parent). The archived source did not contain that explicit refresh flag. This is a material behavior change and requires review before any brand seed is run.

## 6. Attribute and taxonomy source boundaries

- The archived `prisma/seed-taxonomy.ts` is labelled Taxonomy Seed v4 and declares 16 domains. It is not the current `seed-taxonomy-v11.ts`.
- The archived `prisma/seed-attributes.ts` identifies itself as the HBR Taxonomy V1.1 §20 attribute seed and links shared/category attributes.
- The archived `prisma/seed-attribute-catalog.ts` identifies itself as the HBR Attribute Catalog V1.0 §1–§56 updater. Its header says it updates existing definitions and adds roughly 150 catalog attributes; the current runbook correctly excludes this broad updater because it can overwrite attribute metadata and link settings.
- The archived `prisma.zip` inventory does not contain the current `seed-taxonomy-v11.ts`, `seed-service-and-mineral-taxonomy.ts`, `seed-category-specific-attributes.ts`, or `seed-service-mineral-attributes.ts`. The archive therefore cannot serve as the provenance source for those newer files.

## 7. CI and project gates

On the same target commit `4a92096d2d6697e36287f56e23f7c03da0cde566`:

- CI run [44079023353](https://github.com/HEAVIXIR/z-ai-2/actions/runs/44079023353) completed **successfully**; all seven executed jobs passed.
- OpenNext run [44079023363](https://github.com/HEAVIXIR/z-ai-2/actions/runs/44079023363) completed **successfully**.
- The CI jobs `Legacy archive inventory (read-only)` and `Preview read-only paired migration diagnostics` were skipped on the push/PR event. The separate manual legacy provenance workflow succeeded, but it is not a Preview database identity proof.
- PR #340 remains open and Draft.

The live Preview Worker-to-database binding and deployed Worker credential identity remain unproven. The same-SHA paired encrypted Preview backup and explicit owner approval for any data write have not been established by this inventory.

## 8. Required disposition

1. Preserve this report and the artifact as provenance evidence.
2. Review the 17 machine taxonomy additions against the current canonical reference; do not infer acceptance from their presence in Integration.
3. Review the 25 repeated brand slug values and the explicit Iveco identity refresh before any brand-seed execution.
4. Keep the legacy machine seed and broad attribute catalog updater excluded.
5. Continue to require live Preview Worker/database identity proof, canonical source reconciliation, a fresh paired encrypted backup from the exact target SHA, and explicit apply approval before any migration or seed.

No database, Worker, DNS, Production, or deployment operation was performed by this report.
