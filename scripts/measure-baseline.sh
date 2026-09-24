#!/bin/bash
# HEAVIX — STEP 15-A: Performance Baseline (single-shot, inline)
cd /home/z/my-project
LOG=/tmp/baseline-prod.log
> "$LOG"

DATABASE_URL="postgresql://heavix@localhost:5432/heavix?schema=public" \
PATH="/home/z/pg/usr/lib/postgresql/17/bin:$PATH" \
PORT=3000 HOSTNAME=0.0.0.0 \
NODE_OPTIONS="--max-old-space-size=2048" \
node .next/standalone/server.js > "$LOG" 2>&1 &
SERVER_PID=$!
for i in 1 2 3 4 5 6 7 8 9 10; do
  sleep 1
  if curl -s -o /dev/null --max-time 2 http://localhost:3000/ 2>/dev/null; then break; fi
done

BASE_URL="http://localhost:81"

measure() {
  local label="$1"
  local path="$2"
  local codes="" ttfs="" tots="" sizes=""
  for i in 1 2 3 4 5; do
    r=$(curl -s -o /dev/null -w "%{http_code}|%{time_starttransfer}|%{time_total}|%{size_download}" --max-time 30 "${BASE_URL}${path}" 2>&1)
    codes="$codes $(echo "$r" | cut -d'|' -f1)"
    ttfs="$ttfs $(echo "$r" | cut -d'|' -f2)"
    tots="$tots $(echo "$r" | cut -d'|' -f3)"
    sizes="$sizes $(echo "$r" | cut -d'|' -f4)"
  done
  # Sort numerically
  best_t=$(echo "$tots" | tr ' ' '\n' | sort -n | head -1)
  med_t=$(echo "$tots" | tr ' ' '\n' | sort -n | sed -n '3p')
  worst_t=$(echo "$tots" | tr ' ' '\n' | sort -n | tail -1)
  best_ttfb=$(echo "$ttfs" | tr ' ' '\n' | sort -n | head -1)
  med_ttfb=$(echo "$ttfs" | tr ' ' '\n' | sort -n | sed -n '3p')
  worst_ttfb=$(echo "$ttfs" | tr ' ' '\n' | sort -n | tail -1)
  code=$(echo "$codes" | awk '{print $1}')
  size=$(echo "$sizes" | awk '{print $2}')
  printf "%-50s %-4s  TTFB: %4.0f/%4.0f/%4.0f ms (b/m/w)   Total: %4.0f/%4.0f/%4.0f ms   %sB\n" \
    "$label" "$code" \
    "$(echo "$best_ttfb*1000" | bc -l)" "$(echo "$med_ttfb*1000" | bc -l)" "$(echo "$worst_ttfb*1000" | bc -l)" \
    "$(echo "$best_t*1000" | bc -l)" "$(echo "$med_t*1000" | bc -l)" "$(echo "$worst_t*1000" | bc -l)" \
    "$size"
}

echo "═══════════════════════════════════════════════════════════════════════════"
echo "HEAVIX — STEP 15-A: Performance Baseline (Production Standalone Build)"
echo "Generated: $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
echo "Server: node .next/standalone/server.js (Next.js 16.1.3 production)"
echo "Gateway: Caddy port 81 → port 3000"
echo "Method: 5 hits per URL; report best/median(p50)/worst(p99 proxy) for TTFB + Total"
echo "═══════════════════════════════════════════════════════════════════════════"
echo ""
echo "── Public Pages (HTML) ────────────────────────────────────────────────────"
measure "GET /" "/"
measure "GET /listings" "/listings"
measure "GET /brands" "/brands"
measure "GET /login" "/login"
measure "GET /compare" "/compare"
measure "GET /register" "/register"
measure "GET /dashboard/favorites" "/dashboard/favorites"
measure "GET /dashboard/messages" "/dashboard/messages"
measure "GET /store" "/store"

echo ""
echo "── Public APIs (JSON) ─────────────────────────────────────────────────────"
measure "API /api/taxonomy" "/api/taxonomy"
measure "API /api/listings?limit=8" "/api/listings?limit=8"
measure "API /api/services?limit=50" "/api/services?limit=50"
measure "API /api/settings" "/api/settings"
measure "API /api/taxonomy/brands?limit=24" "/api/taxonomy/brands?limit=24"
measure "API /api/articles?limit=6" "/api/articles?limit=6"

echo ""
echo "── Admin Universal APIs (expect 401) ─────────────────────────────────────"
measure "ADM listings" "/api/admin/resources/listings"
measure "ADM brands" "/api/admin/resources/brands"
measure "ADM users" "/api/admin/resources/users"
measure "ADM products" "/api/admin/resources/products"
measure "ADM orders" "/api/admin/resources/orders"
measure "ADM payments" "/api/admin/resources/payments"
measure "ADM companies" "/api/admin/resources/companies"
measure "ADM machines" "/api/admin/resources/machines"
measure "ADM reviews" "/api/admin/resources/reviews"
measure "ADM deals" "/api/admin/resources/deals"
measure "ADM rfqs" "/api/admin/resources/rfqs"
measure "ADM offers" "/api/admin/resources/offers"
measure "ADM auctions" "/api/admin/resources/auctions"
measure "ADM inspections" "/api/admin/resources/inspections"
measure "ADM transports" "/api/admin/resources/transports"
measure "ADM disputes" "/api/admin/resources/disputes"
measure "ADM buy-requests" "/api/admin/resources/buy-requests"
measure "ADM parts" "/api/admin/resources/parts"

kill -9 $SERVER_PID 2>/dev/null
wait $SERVER_PID 2>/dev/null
echo ""
echo "── server stopped ──"
