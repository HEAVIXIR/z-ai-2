# Legacy source intake — file-level disposition

- Source: [HEAVIXIR/z](https://github.com/HEAVIXIR/z) at `217f98ecc800aa64ae4739d27ed2aeb95dd260ed`.
- Target baseline audited: `97e43ebd7349b56c54cddf000531c5e267f6c4f8`; the target has since advanced through the documentation-only merge of PR #124.
- Inventory evidence: [workflow run #40374044751](https://github.com/HEAVIXIR/z-ai-2/actions/runs/40374044751), artifact `legacy-archive-inventory`.
- The legacy repository contains 13 root-level ZIP bundles, not a normal source tree. Inventory scanned 1,715 archive entries representing 909 unique paths: 528 identical, 327 conflicting, and 54 unique missing paths.
- All 54 missing paths are enumerated in `IMPORT-MANIFEST-2026-10-26.csv`. The decisions are deliberately conservative: **no legacy application source is approved for verbatim import** based on this pass.
- Previously approved transfers remain in the target: `scripts/catalog-health.ts` (read-only), the fail-closed guard replacing the legacy PriceRecord seed, and maintained AI-gateway/admin-RBAC audit tooling.
- The candidate review found that remaining direct-copy candidates are stale, incompatible with current API/schema contracts, data-mutating, asset-mutating, or diagnostic scripts that use `@ts-nocheck`, stale model names, broad database reads, or error masking. These need a focused rewrite/port, not blind copy.
- Secret/environment files, SQLite databases/backups, uploaded workspace files, old migration artifacts, generated/vendor bundles, and unverified images are excluded from application source.

## Decision meanings

- `EXCLUDE_*`: runtime/data/upload artifact or duplicate startup; not product source.
- `REJECT_*`: direct import conflicts with current architecture or maintained security/data contracts.
- `HOLD_*`: preserve for separate review; do not import or execute until the listed risks are resolved.
- `REWRITE_BEFORE_IMPORT`: functionality may be useful, but the archived implementation is not accepted; rewrite against current schemas and make errors explicit.

## Next execution sequence

1. Compare each held canonical document/migration archive against current authoritative docs and PostgreSQL migration history.
2. For useful audit behavior, replace legacy phase scripts with typed, non-PII, read-only checks that do not silently turn query errors into zero counts.
3. For compare/price UI gaps, use current session-based Compare APIs and canonical `PriceObservation` contracts; add behavioral tests before porting.
4. Keep seed/taxonomy/asset-mutating scripts out of routine CI and require dry-run, idempotency, provenance, and separate data gates.
5. Continue P0 security remediation for direct AI-provider paths and admin route authorization. No Production/Stage mutation, deployment, backfill, Phase D/E, or worker activation is authorized by this inventory.
