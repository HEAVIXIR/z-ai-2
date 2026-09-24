#!/bin/bash
# HEAVIX — STEP 15-B.1: Production Query Inventory + EXPLAIN ANALYZE
#
# Pure measurement. No indexes added. No optimizations applied.
# Captures: WHERE, ORDER BY, JOIN, COUNT, pagination for the 5 target tables
# (Listing, Brand, Category, BuyRequest, ListingImage).
#
# For each query, records:
#   - Source location (file:line)
#   - Query shape (SQL)
#   - Rows returned
#   - Execution time (ms)
#   - Planning time (ms)
#   - Scan type (Seq Scan / Index Scan / Index Only Scan / Bitmap Scan)
#   - Rows removed by filter
#   - Index used (if any)

export PATH="/home/z/pg/usr/lib/postgresql/17/bin:$PATH"
export PGUSER=heavix PGHOST=localhost PGDATABASE=heavix

OUTPUT_FILE=/tmp/explain-results.txt
> "$OUTPUT_FILE"

run_explain() {
  local id="$1"
  local source="$2"
  local query_text="$3"
  echo "═══════════════════════════════════════════════════════════════════════════" >> "$OUTPUT_FILE"
  echo "QUERY $id" >> "$OUTPUT_FILE"
  echo "Source: $source" >> "$OUTPUT_FILE"
  echo "SQL: $query_text" >> "$OUTPUT_FILE"
  echo "─── EXPLAIN ANALYZE ───" >> "$OUTPUT_FILE"
  psql -c "EXPLAIN ANALYZE $query_text" 2>&1 >> "$OUTPUT_FILE"
  echo "" >> "$OUTPUT_FILE"
}

echo "Starting query inventory..."

# ══════════════════════════════════════════════════════════════════
# TABLE 1: Listing — 9 production queries from high-traffic paths
# ══════════════════════════════════════════════════════════════════

# L1: Home — featured listings (page.tsx:88)
run_explain "L1" "src/app/page.tsx:88 (home featured)" \
  "SELECT * FROM \"Listing\" WHERE status='PUBLISHED' AND featured=true ORDER BY \"publishedAt\" DESC NULLS LAST LIMIT 8"

# L2: Home — verified listings (page.tsx:94)
run_explain "L2" "src/app/page.tsx:94 (home verified)" \
  "SELECT * FROM \"Listing\" WHERE status='PUBLISHED' AND verified=true ORDER BY \"publishedAt\" DESC NULLS LAST LIMIT 8"

# L3: Home — latest listings (page.tsx:102)
run_explain "L3" "src/app/page.tsx:102 (home latest)" \
  "SELECT * FROM \"Listing\" WHERE status='PUBLISHED' AND \"showInLatest\"=true ORDER BY \"publishedAt\" DESC NULLS LAST, \"createdAt\" DESC LIMIT 10"

# L4: Home — count active listings (page.tsx:114)
run_explain "L4" "src/app/page.tsx:114 (home count active)" \
  "SELECT COUNT(*) FROM \"Listing\" WHERE status='PUBLISHED'"

# L5: Home — count featured (page.tsx:117)
run_explain "L5" "src/app/page.tsx:117 (home count featured)" \
  "SELECT COUNT(*) FROM \"Listing\" WHERE status='PUBLISHED' AND featured=true"

# L6: Home — count verified (page.tsx:118)
run_explain "L6" "src/app/page.tsx:118 (home count verified)" \
  "SELECT COUNT(*) FROM \"Listing\" WHERE status='PUBLISHED' AND verified=true"

# L7: /listings — paginated list with relations (src/app/listings/page.tsx:317)
run_explain "L7" "src/app/listings/page.tsx:317 (listings list)" \
  "SELECT * FROM \"Listing\" WHERE status='PUBLISHED' ORDER BY \"createdAt\" DESC LIMIT 24 OFFSET 0"

# L8: /brands/[slug] — listings by brand (src/app/brands/[slug]/page.tsx:55)
run_explain "L8" "src/app/brands/[slug]/page.tsx:55 (listings by brand)" \
  "SELECT * FROM \"Listing\" WHERE status='PUBLISHED' AND \"brandId\"='00000000-0000-0000-0000-000000000001' ORDER BY \"createdAt\" DESC LIMIT 12"

# L9: /sellers/[id] — listings by seller (src/app/sellers/[id]/page.tsx:49)
run_explain "L9" "src/app/sellers/[id]/page.tsx:49 (listings by seller)" \
  "SELECT * FROM \"Listing\" WHERE \"sellerId\"='00000000-0000-0000-0000-000000000001' ORDER BY \"createdAt\" DESC LIMIT 10"

# L10: Universal API — list (data-adapter.ts — used for all 18 resources)
run_explain "L10" "Universal API listing (data-adapter.ts)" \
  "SELECT id, slug, title, status, \"createdAt\", \"updatedAt\" FROM \"Listing\" ORDER BY \"createdAt\" DESC LIMIT 50 OFFSET 0"

# L11: Universal API — count (data-adapter.ts)
run_explain "L11" "Universal API count (data-adapter.ts)" \
  "SELECT COUNT(*) FROM \"Listing\""

# L12: Universal API — get by id (data-adapter.ts)
run_explain "L12" "Universal API get-by-id (data-adapter.ts)" \
  "SELECT * FROM \"Listing\" WHERE id='00000000-0000-0000-0000-000000000001'"

# L13: Listings API — public (src/app/api/listings/route.ts)
run_explain "L13" "src/app/api/listings/route.ts (public listings API)" \
  "SELECT * FROM \"Listing\" WHERE status='PUBLISHED' ORDER BY \"createdAt\" DESC LIMIT 8"

# L14: Home — listing + images + brand + category (with relations)
run_explain "L14" "src/app/page.tsx:88 (home featured WITH relations)" \
  "SELECT l.*, b.name as brand_name, c.icon as category_icon, i.url as img_url, i.\"isPrimary\", i.\"sortOrder\" FROM \"Listing\" l LEFT JOIN \"Brand\" b ON b.id=l.\"brandId\" LEFT JOIN \"Category\" c ON c.id=l.\"categoryId\" LEFT JOIN LATERAL (SELECT * FROM \"ListingImage\" WHERE \"listingId\"=l.id ORDER BY \"isPrimary\" DESC, \"sortOrder\" ASC LIMIT 1) i ON true WHERE l.status='PUBLISHED' AND l.featured=true ORDER BY l.\"publishedAt\" DESC NULLS LAST LIMIT 8"

# ══════════════════════════════════════════════════════════════════
# TABLE 2: Brand — 6 production queries
# ══════════════════════════════════════════════════════════════════

# B1: Home — top brands for ticker (page.tsx:52)
run_explain "B1" "src/app/page.tsx:52 (home top brands)" \
  "SELECT * FROM \"Brand\" WHERE active=true ORDER BY featured DESC, \"sortOrder\" ASC, name ASC LIMIT 20"

# B2: Home — count active brands (page.tsx:115)
run_explain "B2" "src/app/page.tsx:115 (home count active)" \
  "SELECT COUNT(*) FROM \"Brand\" WHERE active=true"

# B3: /brands — all brands paginated (src/app/brands/page.tsx:57)
run_explain "B3" "src/app/brands/page.tsx:57 (brands list)" \
  "SELECT * FROM \"Brand\" WHERE active=true ORDER BY name ASC LIMIT 24 OFFSET 0"

# B4: /brands — popular brands (src/app/brands/page.tsx:80)
run_explain "B4" "src/app/brands/page.tsx:80 (popular brands)" \
  "SELECT * FROM \"Brand\" WHERE active=true AND featured=true ORDER BY \"sortOrder\" ASC LIMIT 8"

# B5: Home — trusted brands (page.tsx:254)
run_explain "B5" "src/app/page.tsx:254 (home trusted brands)" \
  "SELECT * FROM \"Brand\" WHERE id IN ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003') AND active=true ORDER BY featured DESC, \"sortOrder\" ASC, name ASC LIMIT 20"

# B6: Taxonomy API — /api/taxonomy/brands
run_explain "B6" "src/app/api/taxonomy/brands/route.ts:56" \
  "SELECT id, name, slug, \"nameEn\", \"logoUrl\", country, featured FROM \"Brand\" WHERE active=true ORDER BY \"sortOrder\" ASC, name ASC LIMIT 24"

# ══════════════════════════════════════════════════════════════════
# TABLE 3: Category — 6 production queries
# ══════════════════════════════════════════════════════════════════

# C1: Home — all CATALOG categories (page.tsx:58)
run_explain "C1" "src/app/page.tsx:58 (home CATALOG categories)" \
  "SELECT * FROM \"Category\" WHERE active=true AND layer='CATALOG' ORDER BY \"sortOrder\" ASC"

# C2: Home — count top-level CATALOG (page.tsx:116)
run_explain "C2" "src/app/page.tsx:116 (home count categories)" \
  "SELECT COUNT(*) FROM \"Category\" WHERE active=true AND \"parentId\" IS NULL AND layer='CATALOG'"

# C3: Home — machinery root (page.tsx:206)
run_explain "C3" "src/app/page.tsx:206 (home machinery root)" \
  "SELECT id FROM \"Category\" WHERE slug='machinery' AND active=true LIMIT 1"

# C4: Home — L1 children of machinery (page.tsx:218)
run_explain "C4" "src/app/page.tsx:218 (home L1 children)" \
  "SELECT * FROM \"Category\" WHERE \"parentId\"='00000000-0000-0000-0000-000000000001' AND active=true ORDER BY \"sortOrder\" ASC, name ASC LIMIT 12"

# C5: Taxonomy tree API — full tree (src/app/api/taxonomy/tree/route.ts:10)
run_explain "C5" "src/app/api/taxonomy/tree/route.ts:10 (full taxonomy tree)" \
  "SELECT * FROM \"Category\" ORDER BY \"sortOrder\" ASC"

# C6: Taxonomy API — /api/taxonomy (src/app/api/taxonomy/route.ts:45)
run_explain "C6" "src/app/api/taxonomy/route.ts:45 (taxonomy for home)" \
  "SELECT id, slug, name, \"nameEn\", icon, \"imageUrl\", featured FROM \"Category\" WHERE active=true AND layer='CATALOG' AND \"parentId\" IS NULL ORDER BY \"sortOrder\" ASC"

# ══════════════════════════════════════════════════════════════════
# TABLE 4: BuyRequest — 6 production queries
# ══════════════════════════════════════════════════════════════════

# BR1: Home — active requests (page.tsx:119)
run_explain "BR1" "src/app/page.tsx:119 (home active requests)" \
  "SELECT * FROM \"BuyRequest\" WHERE status='ACTIVE' ORDER BY verified DESC, \"createdAt\" DESC LIMIT 6"

# BR2: Admin requests — list (src/app/api/admin/requests/route.ts:45)
run_explain "BR2" "src/app/api/admin/requests/route.ts:45 (admin requests list)" \
  "SELECT * FROM \"BuyRequest\" ORDER BY \"createdAt\" DESC LIMIT 50 OFFSET 0"

# BR3: Admin requests — count by status (multiple counts)
run_explain "BR3" "src/app/api/admin/requests/route.ts:53-58 (count by status)" \
  "SELECT COUNT(*) FROM \"BuyRequest\" WHERE status='ACTIVE'"

# BR4: Admin requests — count verified
run_explain "BR4" "src/app/api/admin/requests/route.ts:58 (count verified)" \
  "SELECT COUNT(*) FROM \"BuyRequest\" WHERE verified=true"

# BR5: Growth engine — count active + created this week
run_explain "BR5" "src/app/api/admin/growth-engine/route.ts:30 (growth active)" \
  "SELECT COUNT(*) FROM \"BuyRequest\" WHERE status='ACTIVE'"

# BR6: Opportunity radar — groupBy city
run_explain "BR6" "src/app/api/admin/opportunity-radar/route.ts:20 (group by city)" \
  "SELECT city, COUNT(*) FROM \"BuyRequest\" WHERE status='ACTIVE' GROUP BY city ORDER BY COUNT(*) DESC LIMIT 10"

# ══════════════════════════════════════════════════════════════════
# TABLE 5: ListingImage — 4 production queries
# ══════════════════════════════════════════════════════════════════

# LI1: Per-listing image lookup (N+1 candidate when relations are eager-loaded)
run_explain "LI1" "ListingImage relation lookup (per-listing)" \
  "SELECT * FROM \"ListingImage\" WHERE \"listingId\"='00000000-0000-0000-0000-000000000001' ORDER BY \"isPrimary\" DESC, \"sortOrder\" ASC LIMIT 1"

# LI2: Admin listings detail — all images for a listing (src/app/api/admin/listings/[id]/route.ts:221)
run_explain "LI2" "src/app/api/admin/listings/[id]/route.ts:221 (admin listing images)" \
  "SELECT * FROM \"ListingImage\" WHERE \"listingId\"='00000000-0000-0000-0000-000000000001'"

# LI3: Listing images — count for a listing (src/app/api/admin/listings/[id]/route.ts:254)
run_explain "LI3" "src/app/api/admin/listings/[id]/route.ts:254 (count images)" \
  "SELECT COUNT(*) FROM \"ListingImage\" WHERE \"listingId\"='00000000-0000-0000-0000-000000000001'"

# LI4: Listing images — bulk delete (src/app/api/admin/listings/[id]/route.ts:266)
run_explain "LI4" "src/app/api/admin/listings/[id]/route.ts:266 (bulk delete)" \
  "DELETE FROM \"ListingImage\" WHERE \"listingId\"='00000000-0000-0000-0000-000000000001' AND id NOT IN ('00000000-0000-0000-0000-000000000002')"

echo "Done. Results in $OUTPUT_FILE"
wc -l "$OUTPUT_FILE"