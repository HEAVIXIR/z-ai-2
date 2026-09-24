#!/bin/bash
# HEAVIX — STEP 15-B.2: Index Hypothesis Simulation
#
# For each of 18 TBD index candidates:
#   1. EXPLAIN (ANALYZE, BUFFERS) on real production query — 5 runs, median
#   2. CREATE INDEX tmp_heavix_15b2_<name> ON ... (temporary)
#   3. ANALYZE the table (refresh planner statistics)
#   4. EXPLAIN (ANALYZE, BUFFERS) on same query — 5 runs, median
#   5. DROP the index
#   6. Compare: before vs after exec time, scan type, buffers
#   7. Decision:
#        PROVEN if (after uses Index Scan/Only) AND (before_median / after_median ≥ 2.0)
#        NOT PROVEN otherwise
#
# Per user policy:
#   - "اگر planner همچنان Seq Scan را انتخاب کرد یا بهبود کمتر از 2× بود، index اضافه نشود"
#   - "فقط اگر بهبود معنادار و پایدار حداقل 2× باشد، به‌عنوان candidate واقعی 15-B.4 ثبت شود"
#
# NO permanent indexes added. NO schema changes. Pure measurement only.

export PATH="/home/z/pg/usr/lib/postgresql/17/bin:$PATH"
export PGUSER=heavix PGHOST=localhost PGDATABASE=heavix

OUTPUT=/tmp/index-hypothesis-results.txt
> "$OUTPUT"

# Helper: extract median exec time from 5 EXPLAIN runs (in ms)
median_exec() {
  local query="$1"
  local times=()
  for i in 1 2 3 4 5; do
    # Run EXPLAIN (ANALYZE, BUFFERS), extract "Execution Time"
    exec_time=$(psql -t -A -c "EXPLAIN (ANALYZE, BUFFERS) $query" 2>&1 | grep "Execution Time" | awk '{print $3}')
    times+=("$exec_time")
  done
  # Sort and take median (3rd of 5)
  printf "%s\n" "${times[@]}" | sort -n | sed -n '3p'
}

# Helper: extract scan type from a single EXPLAIN
scan_type() {
  local query="$1"
  psql -t -A -c "EXPLAIN (ANALYZE, BUFFERS) $query" 2>&1 | grep -oE "(Seq Scan|Index Scan|Index Only Scan|Bitmap Heap Scan|Bitmap Index Scan)" | head -1
}

# Helper: extract shared buffers hit + read
buffers() {
  local query="$1"
  local hit=$(psql -t -A -c "EXPLAIN (ANALYZE, BUFFERS) $query" 2>&1 | grep -oE "Buffers: shared hit=[0-9]+" | head -1 | grep -oE "[0-9]+")
  local read=$(psql -t -A -c "EXPLAIN (ANALYZE, BUFFERS) $query" 2>&1 | grep -oE "shared read=[0-9]+" | head -1 | grep -oE "[0-9]+")
  echo "hit=${hit:-0} read=${read:-0}"
}

# Helper: run full before/after simulation for one candidate
simulate() {
  local id="$1"
  local table="$2"
  local index_ddl="$3"
  local test_query="$4"
  local description="$5"

  echo "═══════════════════════════════════════════════════════════════════════════" >> "$OUTPUT"
  echo "CANDIDATE $id" >> "$OUTPUT"
  echo "Description: $description" >> "$OUTPUT"
  echo "Test query: $test_query" >> "$OUTPUT"
  echo "Index DDL: $index_ddl" >> "$OUTPUT"
  echo "" >> "$OUTPUT"

  # BEFORE: 5 runs, median exec time
  local before_median=$(median_exec "$test_query")
  local before_scan=$(scan_type "$test_query")
  local before_buffers=$(buffers "$test_query")

  echo "── BEFORE (no index) ──────────────────────────" >> "$OUTPUT"
  echo "  Median exec: ${before_median}ms" >> "$OUTPUT"
  echo "  Scan type: ${before_scan:-none-found}" >> "$OUTPUT"
  echo "  Buffers: ${before_buffers}" >> "$OUTPUT"
  echo "" >> "$OUTPUT"

  # CREATE INDEX
  psql -c "$index_ddl" >> "$OUTPUT" 2>&1
  # ANALYZE table (refresh planner stats)
  psql -c "ANALYZE \"$table\";" >> "$OUTPUT" 2>&1

  # AFTER: 5 runs, median exec time
  local after_median=$(median_exec "$test_query")
  local after_scan=$(scan_type "$test_query")
  local after_buffers=$(buffers "$test_query")

  echo "── AFTER (with index) ─────────────────────────" >> "$OUTPUT"
  echo "  Median exec: ${after_median}ms" >> "$OUTPUT"
  echo "  Scan type: ${after_scan:-none-found}" >> "$OUTPUT"
  echo "  Buffers: ${after_buffers}" >> "$OUTPUT"
  echo "" >> "$OUTPUT"

  # Compute ratio (before / after) — higher ratio = better improvement
  local ratio=$(awk "BEGIN{printf \"%.2f\", $before_median / $after_median}")
  echo "── COMPARISON ─────────────────────────────────" >> "$OUTPUT"
  echo "  Ratio (before/after): ${ratio}×" >> "$OUTPUT"
  echo "  Planner switched scan type: $(if [ "$before_scan" != "$after_scan" ]; then echo "YES ($before_scan → $after_scan)"; else echo "NO (still $before_scan)"; fi)" >> "$OUTPUT"
  echo "" >> "$OUTPUT"

  # Decision
  # PROVEN only if: after uses Index Scan OR Index Only Scan AND ratio ≥ 2.0
  local decision
  if [[ "$after_scan" == *"Index Scan"* ]] && awk "BEGIN{exit !($ratio >= 2.0)}"; then
    decision="PROVEN — candidate for 15-B.4"
  elif [[ "$after_scan" == *"Index Scan"* ]] && awk "BEGIN{exit !($ratio < 2.0)}"; then
    decision="NOT PROVEN — planner uses index but improvement < 2× ($ratio×)"
  else
    decision="NOT PROVEN — planner still uses $after_scan (correct choice at current data volume)"
  fi
  echo "── DECISION ────────────────────────────────────" >> "$OUTPUT"
  echo "  $decision" >> "$OUTPUT"
  echo "" >> "$OUTPUT"

  # DROP INDEX (cleanup)
  local index_name=$(echo "$index_ddl" | grep -oE "tmp_heavix_15b2_[a-z_]+" | head -1)
  if [ -n "$index_name" ]; then
    psql -c "DROP INDEX IF EXISTS \"$index_name\";" >> "$OUTPUT" 2>&1
    echo "  [cleanup] Dropped index $index_name" >> "$OUTPUT"
  fi

  # Re-ANALYZE to restore planner stats
  psql -c "ANALYZE \"$table\";" >> /dev/null 2>&1

  # Print summary line
  printf "%-4s  %-7s  before=%6.2fms  after=%6.2fms  ratio=%5.2f×  %s\n" \
    "$id" "$table" "$before_median" "$after_median" "$ratio" "$decision"
}

echo "Starting 15-B.2 Index Hypothesis Simulation..."
echo ""

# ══════════════════════════════════════════════════════════════════
# LISTING TABLE — 8 candidates
# ══════════════════════════════════════════════════════════════════

simulate "L-H1" "Listing" \
  "CREATE INDEX tmp_heavix_15b2_listing_status ON \"Listing\" (status)" \
  "SELECT * FROM \"Listing\" WHERE status='PUBLISHED' AND featured=true ORDER BY \"publishedAt\" DESC NULLS LAST LIMIT 8" \
  "Listing.status (filter on status='PUBLISHED')"

simulate "L-H2" "Listing" \
  "CREATE INDEX tmp_heavix_15b2_listing_created ON \"Listing\" (\"createdAt\" DESC)" \
  "SELECT * FROM \"Listing\" WHERE status='PUBLISHED' ORDER BY \"createdAt\" DESC LIMIT 24 OFFSET 0" \
  "Listing.createdAt DESC (sort key for L7 paginated list)"

simulate "L-H3" "Listing" \
  "CREATE INDEX tmp_heavix_15b2_listing_published ON \"Listing\" (\"publishedAt\" DESC NULLS LAST)" \
  "SELECT * FROM \"Listing\" WHERE status='PUBLISHED' AND featured=true ORDER BY \"publishedAt\" DESC NULLS LAST LIMIT 8" \
  "Listing.publishedAt DESC NULLS LAST (sort key for L1, L2, L3)"

simulate "L-H4" "Listing" \
  "CREATE INDEX tmp_heavix_15b2_listing_brand ON \"Listing\" (\"brandId\")" \
  "SELECT * FROM \"Listing\" WHERE status='PUBLISHED' AND \"brandId\"='00000000-0000-0000-0000-000000000001' ORDER BY \"createdAt\" DESC LIMIT 12" \
  "Listing.brandId (filter for L8 by-brand page)"

simulate "L-H5" "Listing" \
  "CREATE INDEX tmp_heavix_15b2_listing_seller ON \"Listing\" (\"sellerId\")" \
  "SELECT * FROM \"Listing\" WHERE \"sellerId\"='00000000-0000-0000-0000-000000000001' ORDER BY \"createdAt\" DESC LIMIT 10" \
  "Listing.sellerId (filter for L9 by-seller page)"

simulate "L-H6" "Listing" \
  "CREATE INDEX tmp_heavix_15b2_listing_featured_partial ON \"Listing\" (featured) WHERE status='PUBLISHED'" \
  "SELECT * FROM \"Listing\" WHERE status='PUBLISHED' AND featured=true ORDER BY \"publishedAt\" DESC NULLS LAST LIMIT 8" \
  "Listing.featured (partial WHERE status='PUBLISHED')"

simulate "L-H7" "Listing" \
  "CREATE INDEX tmp_heavix_15b2_listing_verified_partial ON \"Listing\" (verified) WHERE status='PUBLISHED'" \
  "SELECT * FROM \"Listing\" WHERE status='PUBLISHED' AND verified=true ORDER BY \"publishedAt\" DESC NULLS LAST LIMIT 8" \
  "Listing.verified (partial WHERE status='PUBLISHED')"

simulate "L-H8" "Listing" \
  "CREATE INDEX tmp_heavix_15b2_listing_status_published ON \"Listing\" (status, \"publishedAt\" DESC NULLS LAST)" \
  "SELECT * FROM \"Listing\" WHERE status='PUBLISHED' AND featured=true ORDER BY \"publishedAt\" DESC NULLS LAST LIMIT 8" \
  "Listing composite (status, publishedAt DESC NULLS LAST) for home-page queries"

# ══════════════════════════════════════════════════════════════════
# BRAND TABLE — 2 candidates
# ══════════════════════════════════════════════════════════════════

simulate "B-H1" "Brand" \
  "CREATE INDEX tmp_heavix_15b2_brand_name ON \"Brand\" (name)" \
  "SELECT * FROM \"Brand\" WHERE active=true ORDER BY name ASC LIMIT 24 OFFSET 0" \
  "Brand.name (sort key for B3 brands page)"

simulate "B-H2" "Brand" \
  "CREATE INDEX tmp_heavix_15b2_brand_active_sort_name ON \"Brand\" (active, \"sortOrder\", name)" \
  "SELECT * FROM \"Brand\" WHERE active=true ORDER BY featured DESC, \"sortOrder\" ASC, name ASC LIMIT 20" \
  "Brand composite (active, sortOrder, name) for B1 home-page query"

# ══════════════════════════════════════════════════════════════════
# CATEGORY TABLE — 5 candidates
# ══════════════════════════════════════════════════════════════════

simulate "C-H1" "Category" \
  "CREATE INDEX tmp_heavix_15b2_category_parent ON \"Category\" (\"parentId\")" \
  "SELECT * FROM \"Category\" WHERE \"parentId\"='00000000-0000-0000-0000-000000000001' AND active=true ORDER BY \"sortOrder\" ASC, name ASC LIMIT 12" \
  "Category.parentId (tree traversal for C4)"

simulate "C-H2" "Category" \
  "CREATE INDEX tmp_heavix_15b2_category_layer ON \"Category\" (layer)" \
  "SELECT * FROM \"Category\" WHERE active=true AND layer='CATALOG' ORDER BY \"sortOrder\" ASC" \
  "Category.layer (filter for C1)"

simulate "C-H3" "Category" \
  "CREATE INDEX tmp_heavix_15b2_category_active ON \"Category\" (active)" \
  "SELECT * FROM \"Category\" WHERE active=true AND layer='CATALOG' ORDER BY \"sortOrder\" ASC" \
  "Category.active (filter for C1, C2, C4, C6)"

simulate "C-H4" "Category" \
  "CREATE INDEX tmp_heavix_15b2_category_active_parent_layer ON \"Category\" (active, \"parentId\", layer)" \
  "SELECT COUNT(*) FROM \"Category\" WHERE active=true AND \"parentId\" IS NULL AND layer='CATALOG'" \
  "Category composite (active, parentId, layer) for C2, C6"

simulate "C-H5" "Category" \
  "CREATE INDEX tmp_heavix_15b2_category_sort ON \"Category\" (\"sortOrder\")" \
  "SELECT * FROM \"Category\" ORDER BY \"sortOrder\" ASC" \
  "Category.sortOrder (sort key for C1, C4, C5, C6)"

# ══════════════════════════════════════════════════════════════════
# BUYREQUEST TABLE — 3 candidates (table is empty — expected NOT PROVEN)
# ══════════════════════════════════════════════════════════════════

simulate "BR-H1" "BuyRequest" \
  "CREATE INDEX tmp_heavix_15b2_buyreq_status ON \"BuyRequest\" (status)" \
  "SELECT * FROM \"BuyRequest\" WHERE status='ACTIVE' ORDER BY verified DESC, \"createdAt\" DESC LIMIT 6" \
  "BuyRequest.status (filter for BR1, BR3, BR5, BR6)"

simulate "BR-H2" "BuyRequest" \
  "CREATE INDEX tmp_heavix_15b2_buyreq_verified ON \"BuyRequest\" (verified)" \
  "SELECT COUNT(*) FROM \"BuyRequest\" WHERE verified=true" \
  "BuyRequest.verified (filter for BR4)"

simulate "BR-H3" "BuyRequest" \
  "CREATE INDEX tmp_heavix_15b2_buyreq_created ON \"BuyRequest\" (\"createdAt\" DESC)" \
  "SELECT * FROM \"BuyRequest\" ORDER BY \"createdAt\" DESC LIMIT 50 OFFSET 0" \
  "BuyRequest.createdAt DESC (sort key for BR1, BR2)"

echo ""
echo "── DONE — see $OUTPUT for full details ──"
echo ""
echo "── FINAL CLEANUP CHECK ──"
psql -c "SELECT indexname FROM pg_indexes WHERE schemaname='public' AND indexname LIKE 'tmp_heavix_%';"