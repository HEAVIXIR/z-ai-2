# Summary — STEP 18.2.7.2 (Complete)

## Key Findings

### Complete File Comparison (844 files)

| Status | Count | Percentage |
|--------|-------|------------|
| IN_MAIN (exists in current main) | 815 | 96.5% |
| ONLY_OLD (missing from main) | 29 | 3.5% |
| **Total** | **844** | 100% |

Note: The initial FILE-MATRIX.csv compared only 792 files (5 categories).
The COMPLETE-FILE-MATRIX.csv compares all 844 files from 10 ZIPs.
The 2 new ONLY_OLD files (public/robots.txt, .zscripts/dev.pid) are both REJECT.

### Key Insight

96.5% of legacy files already exist in current main. Only 29 files are truly missing.

### Adaptation Candidates (29 files) — FINAL

| Decision | Count | Items |
|----------|-------|-------|
| REJECT | 6 | SQLite migration, SQLite store-schema, start-dev.sh, clear-logo.ts, robots.txt, dev.pid |
| ADAPT | 23 | 7 audit scripts, security-check, 6 seed scripts, rebuild-taxonomy, 4 image tools, AI Gateway, Price Intelligence, Compare UI, Price Intelligence UI |
| REVIEW | 0 | All promoted to ADAPT after content review |

### Correction History

1. Initial SUMMARY: ADAPT=24, REVIEW=0 — incorrect
2. First correction: ADAPT=17, REVIEW=7, REJECT=3
3. Senior manager review: 7 audit scripts promoted to ADAPT; clear-logo.ts demoted to REJECT
4. Complete comparison (844 files): 2 new ONLY_OLD found (robots.txt, dev.pid) → both REJECT
5. **Final: ADAPT=23, REJECT=6, REVIEW=0** — matches DECISION-MATRIX.csv (29 entries)

### Priority Adaptation Order

1. `adapt/ai-gateway-service.ts` — AI Gateway with policy/audit
2. `adapt/price-intelligence.ts` — Price intelligence with PriceObservation
3. `adapt/ComparePageClient.tsx` — Compare UI
4. `adapt/PriceIntelligence.tsx` — Price intelligence UI
5. `adapt/` audit scripts (7) — rewrite with current schema
6. `adapt/security-check.ts` — Security audit
7. `adapt/seed-*.ts` — 6 seed scripts
8. `adapt/*-logo*.cjs` — 4 image tools
9. `adapt/rebuild-taxonomy.ts` — Taxonomy rebuild

### Canonical Source

`DECISION-MATRIX.csv` is the single source of truth for all 29 decisions.
`COMPLETE-FILE-MATRIX.csv` contains the full 844-file comparison.
All other documents must match both.
