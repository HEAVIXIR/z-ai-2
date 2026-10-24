#!/usr/bin/env bash
# HEAVIX — STEP 15.94 — Fail-closed parser validation
#
# Exercises the exact parser implementation invoked by the tls-proof CI job.
# It accepts only exactly 13 passed assertions and rejects incomplete, malformed,
# non-passing, or unexpected-status result sets.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# Source the production/CI parser instead of duplicating its logic here.
source "$SCRIPT_DIR/parse-tls-proof-results.sh"

PASS=0
FAIL=0

expect_accept() {
  local name="$1" json="$2" tmp output
  tmp=$(mktemp)
  printf '%s\n' "$json" > "$tmp"
  if output=$(parse_tls_proof_result "$tmp" 2>&1); then
    echo "✓ PASS ($name): accepted (expected)"
    PASS=$((PASS + 1))
  else
    echo "✗ FAIL ($name): should have been accepted but got: $output"
    FAIL=$((FAIL + 1))
  fi
  rm -f "$tmp"
}

expect_reject() {
  local name="$1" json="$2" tmp output
  tmp=$(mktemp)
  printf '%s\n' "$json" > "$tmp"
  if output=$(parse_tls_proof_result "$tmp" 2>&1); then
    echo "✗ FAIL ($name): should have been rejected but was accepted: $output"
    FAIL=$((FAIL + 1))
  else
    echo "✓ PASS ($name): rejected as expected"
    PASS=$((PASS + 1))
  fi
  rm -f "$tmp"
}

make_test_json() {
  local statuses=("$@")
  local assertions="["
  local first=1
  local status
  for status in "${statuses[@]}"; do
    if [[ "$first" -eq 0 ]]; then assertions+=","; fi
    first=0
    assertions+="{\"status\":\"$status\"}"
  done
  assertions+="]"
  printf '{"testResults":[{"assertionResults":%s}]}\n' "$assertions"
}

echo "── STEP 15.94: Validate the shared fail-closed parser ──"
echo ""

expect_accept "13-passed" "$(make_test_json passed passed passed passed passed passed passed passed passed passed passed passed passed)"
expect_reject "12-passed-1-skipped" "$(make_test_json passed passed passed passed passed passed passed passed passed passed passed passed skipped)"
expect_reject "13-passed-1-extra-skipped" "$(make_test_json passed passed passed passed passed passed passed passed passed passed passed passed passed skipped)"
expect_reject "12-passed-1-failed" "$(make_test_json passed passed passed passed passed passed passed passed passed passed passed passed failed)"
expect_reject "13-passed-1-pending" "$(make_test_json passed passed passed passed passed passed passed passed passed passed passed passed passed pending)"
expect_reject "13-passed-1-todo" "$(make_test_json passed passed passed passed passed passed passed passed passed passed passed passed passed todo)"
expect_reject "12-passed-only" "$(make_test_json passed passed passed passed passed passed passed passed passed passed passed passed)"
expect_reject "14-passed" "$(make_test_json passed passed passed passed passed passed passed passed passed passed passed passed passed passed)"
expect_reject "empty" '{"testResults":[{"assertionResults":[]}]}'
expect_reject "invalid-json" '{not valid json'
expect_reject "all-skipped" "$(make_test_json skipped skipped skipped skipped skipped skipped skipped skipped skipped skipped skipped skipped skipped)"
expect_reject "mixed-10-passed" "$(make_test_json passed passed passed passed passed passed passed passed passed passed skipped failed todo)"
expect_reject "13-passed-1-running" "$(make_test_json passed passed passed passed passed passed passed passed passed passed passed passed passed running)"
expect_reject "unknown-status" "$(make_test_json passed passed passed passed passed passed passed passed passed passed passed passed passed future_status)"
expect_reject "missing-status" '{"testResults":[{"assertionResults":[{"status":"passed"},{"status":"passed"},{"status":"passed"},{"status":"passed"},{"status":"passed"},{"status":"passed"},{"status":"passed"},{"status":"passed"},{"status":"passed"},{"status":"passed"},{"status":"passed"},{"status":"passed"},{}]}]}'
expect_reject "missing-assertion-results" '{"testResults":[{}]}'

echo ""
echo "── Summary ──"
echo "  Passed: $PASS"
echo "  Failed: $FAIL"
if [[ "$FAIL" -ne 0 ]]; then
  echo "✗ FAIL: $FAIL validation cases did not behave as expected."
  exit 1
fi
echo "✓ All $PASS fail-closed parser validation cases passed."
