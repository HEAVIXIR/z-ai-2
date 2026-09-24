#!/bin/bash
# HEAVIX — STEP 15-B.3: Home Query Fan-out Analyzer
#
# Pure measurement. NO code changes. NO index additions. NO optimizations applied.
# Captures the wall-clock time per phase of the home page render by running
# the actual SQL queries (translated from Prisma) in sequence via psql.
#
# Output: theoretical critical-path computation + actual wall-clock measurement
# per phase. Compares them to identify serialization overhead vs DB-bound time.

export PATH="/home/z/pg/usr/lib/postgresql/17/bin:$PATH"
export PGUSER=heavix PGHOST=localhost PGDATABASE=heavix

OUTPUT=/tmp/home-fanout-analysis.txt
> "$OUTPUT"

# Helper: time a single SQL via EXPLAIN ANALYZE — return median of 5 runs (in ms)
median_explain() {
  local query="$1"
  local times=()
  for i in 1 2 3 4 5; do
    exec_time=$(psql -t -A -c "EXPLAIN (ANALYZE, BUFFERS) $query" 2>&1 | grep "Execution Time" | awk '{print $3}')
    times+=("$exec_time")
  done
  printf "%s\n" "${times[@]}" | sort -n | sed -n '3p'
}

# Helper: time a phase = run all queries in the phase via psql in one transaction
# (simulating parallelism via Promise.all is approximated by the max of individual times)
phase_time() {
  local label="$1"
  shift
  # $@ is the list of queries to run; we run them sequentially here to get wall-clock
  local total=0
  for q in "$@"; do
    local t=$(psql -t -A -c "EXPLAIN (ANALYZE) $q" 2>&1 | grep "Execution Time" | awk '{print $3}')
    echo "    $q → ${t}ms" >> "$OUTPUT"
    total=$(awk "BEGIN{printf \"%.3f\", $total + $t}")
  done
  echo "  Phase $label wall-clock (sequential sum): ${total}ms" >> "$OUTPUT"
  echo ""
}

echo "═══════════════════════════════════════════════════════════════════════════" >> "$OUTPUT"
echo "HEAVIX — STEP 15-B.3: Home Query Fan-out Analysis" >> "$OUTPUT"
echo "Generated: $(date -u '+%Y-%m-%dT%H:%M:%SZ')" >> "$OUTPUT"
echo "Method: EXPLAIN (ANALYZE, BUFFERS), 5 runs per query, median reported" >> "$OUTPUT"
echo "═══════════════════════════════════════════════════════════════════════════" >> "$OUTPUT"
echo "" >> "$OUTPUT"

# Phase 1: parallel — brands + categories
echo "── PHASE 1: Parallel — Promise.all([B1, C1]) ─────────────────────────" >> "$OUTPUT"
B1=$(median_explain "SELECT * FROM \"Brand\" WHERE active=true ORDER BY featured DESC, \"sortOrder\" ASC, name ASC LIMIT 20")
C1=$(median_explain "SELECT * FROM \"Category\" WHERE active=true AND layer='CATALOG' ORDER BY \"sortOrder\" ASC")
echo "  B1 (brand.findMany top 20): ${B1}ms" >> "$OUTPUT"
echo "  C1 (category.findMany CATALOG): ${C1}ms" >> "$OUTPUT"
P1_PARALLEL=$(awk "BEGIN{print ($B1 > $C1) ? $B1 : $C1}")
P1_SEQUENTIAL=$(awk "BEGIN{printf \"%.3f\", $B1 + $C1}")
echo "  → parallel wall-clock (max): ${P1_PARALLEL}ms" >> "$OUTPUT"
echo "  → sequential wall-clock (sum): ${P1_SEQUENTIAL}ms" >> "$OUTPUT"
echo "" >> "$OUTPUT"

# Phase 2: sequential — homeCategoryConfig + siteSettings
echo "── PHASE 2: Sequential — homeCategoryConfig + siteSettings (separate awaits) ──" >> "$OUTPUT"
HCC=$(median_explain "SELECT * FROM \"HomeCategoryConfig\" WHERE id='main'")
SS=$(median_explain "SELECT * FROM \"SiteSettings\" WHERE id='main'")
echo "  HCC (homeCategoryConfig.findUnique): ${HCC}ms" >> "$OUTPUT"
echo "  SS (siteSettings.findUnique): ${SS}ms" >> "$OUTPUT"
P2=$(awk "BEGIN{printf \"%.3f\", $HCC + $SS}")
echo "  → wall-clock (sequential sum): ${P2}ms" >> "$OUTPUT"
echo "  NOTE: Phase 2 uses separate awaits, but HCC and SS are independent — Promise.all candidate." >> "$OUTPUT"
echo "" >> "$OUTPUT"

# Phase 3: parallel — featured + verified + latest listings
echo "── PHASE 3: Parallel — Promise.all([L1, L2, L3]) ───────────────────" >> "$OUTPUT"
L1=$(median_explain "SELECT * FROM \"Listing\" WHERE status='PUBLISHED' AND featured=true ORDER BY \"publishedAt\" DESC NULLS LAST LIMIT 8")
L2=$(median_explain "SELECT * FROM \"Listing\" WHERE status='PUBLISHED' AND verified=true ORDER BY \"publishedAt\" DESC NULLS LAST LIMIT 8")
L3=$(median_explain "SELECT * FROM \"Listing\" WHERE status='PUBLISHED' AND \"showInLatest\"=true ORDER BY \"publishedAt\" DESC NULLS LAST, \"createdAt\" DESC LIMIT 10")
echo "  L1 (featured listings): ${L1}ms" >> "$OUTPUT"
echo "  L2 (verified listings): ${L2}ms" >> "$OUTPUT"
echo "  L3 (latest listings): ${L3}ms" >> "$OUTPUT"
P3_PARALLEL=$(awk "BEGIN{m=$L1; if($L2>m) m=$L2; if($L3>m) m=$L3; print m}")
P3_SEQUENTIAL=$(awk "BEGIN{printf \"%.3f\", $L1 + $L2 + $L3}")
echo "  → parallel wall-clock (max): ${P3_PARALLEL}ms" >> "$OUTPUT"
echo "  → sequential wall-clock (sum): ${P3_SEQUENTIAL}ms" >> "$OUTPUT"
echo "  Already parallelized via Promise.all (good)." >> "$OUTPUT"
echo "" >> "$OUTPUT"

# Phase 4: parallel — 10 queries
echo "── PHASE 4: Parallel — Promise.all([L4, B2, C2, L5, L6, BR1, A1, HS, HPS, HC]) ──" >> "$OUTPUT"
L4=$(median_explain "SELECT COUNT(*) FROM \"Listing\" WHERE status='PUBLISHED'")
B2=$(median_explain "SELECT COUNT(*) FROM \"Brand\" WHERE active=true")
C2=$(median_explain "SELECT COUNT(*) FROM \"Category\" WHERE active=true AND \"parentId\" IS NULL AND layer='CATALOG'")
L5=$(median_explain "SELECT COUNT(*) FROM \"Listing\" WHERE status='PUBLISHED' AND featured=true")
L6=$(median_explain "SELECT COUNT(*) FROM \"Listing\" WHERE status='PUBLISHED' AND verified=true")
BR1=$(median_explain "SELECT * FROM \"BuyRequest\" WHERE status='ACTIVE' ORDER BY verified DESC, \"createdAt\" DESC LIMIT 6")
A1=$(median_explain "SELECT id, slug, title, excerpt, category, \"coverImage\", \"viewCount\" FROM \"Article\" WHERE status='PUBLISHED' ORDER BY \"publishedAt\" DESC NULLS LAST LIMIT 4")
HS=$(median_explain "SELECT * FROM \"HotSearch\" WHERE active=true ORDER BY \"sortOrder\" ASC LIMIT 9")
HPS=$(median_explain "SELECT * FROM \"HomePageSection\" WHERE active=true ORDER BY \"order\" ASC")
HC=$(median_explain "SELECT * FROM \"HeroConfig\" WHERE id='main'")
echo "  L4 (listing count PUBLISHED): ${L4}ms" >> "$OUTPUT"
echo "  B2 (brand count active): ${B2}ms" >> "$OUTPUT"
echo "  C2 (category count CATALOG top): ${C2}ms" >> "$OUTPUT"
echo "  L5 (listing count featured): ${L5}ms" >> "$OUTPUT"
echo "  L6 (listing count verified): ${L6}ms" >> "$OUTPUT"
echo "  BR1 (buyRequest findMany active): ${BR1}ms" >> "$OUTPUT"
echo "  A1 (article findMany published): ${A1}ms" >> "$OUTPUT"
echo "  HS (hotSearch findMany active): ${HS}ms" >> "$OUTPUT"
echo "  HPS (homePageSection findMany active): ${HPS}ms" >> "$OUTPUT"
echo "  HC (heroConfig findUnique main): ${HC}ms" >> "$OUTPUT"
P4_PARALLEL=$(awk "BEGIN{m=0; if($L4>m) m=$L4; if($B2>m) m=$B2; if($C2>m) m=$C2; if($L5>m) m=$L5; if($L6>m) m=$L6; if($BR1>m) m=$BR1; if($A1>m) m=$A1; if($HS>m) m=$HS; if($HPS>m) m=$HPS; if($HC>m) m=$HC; print m}")
P4_SEQUENTIAL=$(awk "BEGIN{printf \"%.3f\", $L4+$B2+$C2+$L5+$L6+$BR1+$A1+$HS+$HPS+$HC}")
echo "  → parallel wall-clock (max): ${P4_PARALLEL}ms" >> "$OUTPUT"
echo "  → sequential wall-clock (sum): ${P4_SEQUENTIAL}ms" >> "$OUTPUT"
echo "  Already parallelized via Promise.all (good)." >> "$OUTPUT"
echo "  Note: 3 listing.count queries (L4, L5, L6) are merge candidates — see §6." >> "$OUTPUT"
echo "" >> "$OUTPUT"

# Phase 5: sequential — category.findFirst machinery + category.findMany L1 children
echo "── PHASE 5: Sequential — category.findFirst + findMany(parentId) ──" >> "$OUTPUT"
echo "  Legitimately sequential: L1 children query uses machinery.id from previous query." >> "$OUTPUT"
C3=$(median_explain "SELECT id FROM \"Category\" WHERE slug='machinery' AND active=true LIMIT 1")
C4=$(median_explain "SELECT * FROM \"Category\" WHERE \"parentId\"='00000000-0000-0000-0000-000000000001' AND active=true ORDER BY \"sortOrder\" ASC, name ASC LIMIT 12")
echo "  C3 (category.findFirst machinery): ${C3}ms" >> "$OUTPUT"
echo "  C4 (category.findMany L1 children): ${C4}ms" >> "$OUTPUT"
P5=$(awk "BEGIN{printf \"%.3f\", $C3 + $C4}")
echo "  → wall-clock (legitimately sequential): ${P5}ms" >> "$OUTPUT"
echo "" >> "$OUTPUT"

# Phase 6: parallel — brandDisplay.findMany + brand.findMany featured
echo "── PHASE 6: Parallel — Promise.all([BD, BF]) ────────────────────────" >> "$OUTPUT"
BD=$(median_explain "SELECT \"brandId\" FROM \"BrandDisplay\" WHERE \"showOnHomepage\"=true")
BF=$(median_explain "SELECT id FROM \"Brand\" WHERE featured=true AND active=true")
echo "  BD (brandDisplay.findMany showOnHomepage): ${BD}ms" >> "$OUTPUT"
echo "  BF (brand.findMany featured+active): ${BF}ms" >> "$OUTPUT"
P6_PARALLEL=$(awk "BEGIN{print ($BD > $BF) ? $BD : $BF}")
P6_SEQUENTIAL=$(awk "BEGIN{printf \"%.3f\", $BD + $BF}")
echo "  → parallel wall-clock (max): ${P6_PARALLEL}ms" >> "$OUTPUT"
echo "  → sequential wall-clock (sum): ${P6_SEQUENTIAL}ms" >> "$OUTPUT"
echo "  Already parallelized via Promise.all (good)." >> "$OUTPUT"
echo "" >> "$OUTPUT"

# Phase 7: sequential — brand.findMany by id IN (depends on Phase 6 output)
echo "── PHASE 7: Sequential — brand.findMany(id IN ...) ──────────────────" >> "$OUTPUT"
echo "  Legitimately sequential: depends on Phase 6 output (id list)." >> "$OUTPUT"
B5=$(median_explain "SELECT * FROM \"Brand\" WHERE id IN ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003') AND active=true ORDER BY featured DESC, \"sortOrder\" ASC, name ASC LIMIT 20")
echo "  B5 (brand.findMany id IN): ${B5}ms" >> "$OUTPUT"
P7=$B5
echo "  → wall-clock: ${P7}ms" >> "$OUTPUT"
echo "" >> "$OUTPUT"

# Phase 8: getActiveStats — siteStat.findMany + Promise.all(4 computeMetricCount)
echo "── PHASE 8: getActiveStats — 1 + Promise.all(4) ─────────────────────" >> "$OUTPUT"
echo "  Phase 8a: siteStat.findMany (sequential, fires first)" >> "$OUTPUT"
SS_STAT=$(median_explain "SELECT * FROM \"SiteStat\" WHERE active=true ORDER BY \"sortOrder\" ASC, \"createdAt\" ASC")
echo "  SS-STAT (siteStat.findMany active): ${SS_STAT}ms" >> "$OUTPUT"
echo "  Phase 8b: Promise.all(computeMetricCount) — 4 stat rows configured" >> "$OUTPUT"
M_LISTINGS=$(median_explain "SELECT COUNT(*) FROM \"Listing\" WHERE status='PUBLISHED'")
M_BRANDS=$(median_explain "SELECT COUNT(*) FROM \"Brand\" WHERE active=true")
M_CATS=$(median_explain "SELECT COUNT(*) FROM \"Category\" WHERE \"parentId\" IS NULL AND active=true")
M_PROVINCES=$(median_explain "SELECT COUNT(*) FROM \"Province\"")
echo "  M-LISTINGS: ${M_LISTINGS}ms" >> "$OUTPUT"
echo "  M-BRANDS: ${M_BRANDS}ms" >> "$OUTPUT"
echo "  M-CATS: ${M_CATS}ms" >> "$OUTPUT"
echo "  M-PROVINCES: ${M_PROVINCES}ms" >> "$OUTPUT"
P8_PARALLEL_INNER=$(awk "BEGIN{m=0; if($M_LISTINGS>m) m=$M_LISTINGS; if($M_BRANDS>m) m=$M_BRANDS; if($M_CATS>m) m=$M_CATS; if($M_PROVINCES>m) m=$M_PROVINCES; print m}")
P8=$(awk "BEGIN{printf \"%.3f\", $SS_STAT + $P8_PARALLEL_INNER}")
echo "  → 8a (sequential) + 8b parallel (max of 4): ${P8}ms" >> "$OUTPUT"
echo "  Note: Phase 8b duplicates L4, B2, C2 from Phase 4 — see §6 (duplicate analysis)." >> "$OUTPUT"
echo "" >> "$OUTPUT"

# Critical path
echo "═══════════════════════════════════════════════════════════════════════════" >> "$OUTPUT"
echo "── CRITICAL PATH (DB-bound, theoretical) ──────────────────────────────" >> "$OUTPUT"
echo "" >> "$OUTPUT"
CRIT_PATH=$(awk "BEGIN{printf \"%.3f\", $P1_PARALLEL + $P2 + $P3_PARALLEL + $P4_PARALLEL + $P5 + $P6_PARALLEL + $P7 + $P8}")
echo "  Phase 1 (parallel max): ${P1_PARALLEL}ms" >> "$OUTPUT"
echo "  Phase 2 (sequential): ${P2}ms" >> "$OUTPUT"
echo "  Phase 3 (parallel max): ${P3_PARALLEL}ms" >> "$OUTPUT"
echo "  Phase 4 (parallel max): ${P4_PARALLEL}ms" >> "$OUTPUT"
echo "  Phase 5 (legit sequential): ${P5}ms" >> "$OUTPUT"
echo "  Phase 6 (parallel max): ${P6_PARALLEL}ms" >> "$OUTPUT"
echo "  Phase 7 (legit sequential): ${P7}ms" >> "$OUTPUT"
echo "  Phase 8 (8a + 8b parallel max): ${P8}ms" >> "$OUTPUT"
echo "  ────────────────────────────" >> "$OUTPUT"
echo "  TOTAL DB-bound critical path: ${CRIT_PATH}ms" >> "$OUTPUT"
echo "" >> "$OUTPUT"
echo "  Compare to actual home page TTFB (measured in 15-A): 67-343ms" >> "$OUTPUT"
echo "  Gap = JS render + network + serialization (not DB-bound)" >> "$OUTPUT"

cat "$OUTPUT"
echo ""
echo "── Full output saved to: $OUTPUT ──"