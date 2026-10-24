#!/usr/bin/env bash
# HEAVIX — STEP 15.94 — Fail-closed parser validation
#
# Validates that the tls-proof job's JSON result parser correctly REJECTS
# incomplete and non-passing result sets. This is a focused unit test for
# the fail-closed logic (not the behavioral TLS tests themselves).
#
# It simulates various vitest JSON outputs and verifies the parser logic
# accepts only the "exactly 13 passed" case.
#
# Run: bash scripts/validate-tls-proof-fail-closed.sh

set -euo pipefail

PASS=0
FAIL=0

# ─── The parser logic under test (mirrors .github/workflows/ci.yml tls-proof step) ──
# Returns 0 if the JSON represents exactly 13 passed tests with 0 non-passing,
# else returns 1.
parse_tls_proof_result() {
  local json_file="$1"

  # Validate JSON is parseable
  if ! jq empty "$json_file" 2>/dev/null; then
    echo "PARSE_ERROR"
    return 1
  fi

  local total_count pass_count non_pass_count
  total_count=$(jq '[.testResults[].assertionResults[]?] | length' "$json_file")
  pass_count=$(jq '[.testResults[].assertionResults[]? | select(.status == "passed")] | length' "$json_file")
  non_pass_count=$((total_count - pass_count))

  # Fail-closed: exactly 13 tests must have status "passed"
  if [ "$pass_count" -ne 13 ]; then
    echo "FAIL_NOT_13(passed=$pass_count)"
    return 1
  fi
  # Fail-closed: no non-passing tests allowed (TOTAL must equal PASS)
  if [ "$non_pass_count" -ne 0 ]; then
    echo "FAIL_NON_PASS(non_pass=$non_pass_count)"
    return 1
  fi
  echo "OK(passed=$pass_count)"
  return 0
}

# ─── Test helper ───────────────────────────────────────────────────────────
expect_accept() {
  local name="$1"
  local json="$2"
  local result
  # Check if JSON is valid first (don't use set -e-killing constructs)
  if ! echo "$json" | jq '.' >/dev/null 2>&1; then
    echo "✗ FAIL ($name): input is not valid JSON — should have been accepted"
    FAIL=$((FAIL + 1))
    return
  fi
  local tmp
  tmp=$(mktemp)
  echo "$json" > "$tmp"
  local parse_result
  parse_result=$(parse_tls_proof_result "$tmp" || true)
  rm -f "$tmp"
  if echo "$parse_result" | grep -q "^OK"; then
    echo "✓ PASS ($name): accepted (expected)"
    PASS=$((PASS + 1))
  else
    echo "✗ FAIL ($name): should have been accepted but got: $parse_result"
    FAIL=$((FAIL + 1))
  fi
}

expect_reject() {
  local name="$1"
  local json="$2"
  if ! echo "$json" | jq '.' >/dev/null 2>&1; then
    echo "✓ PASS ($name): rejected (invalid JSON, as expected)"
    PASS=$((PASS + 1))
    return
  fi
  local tmp
  tmp=$(mktemp)
  echo "$json" > "$tmp"
  local parse_result
  parse_result=$(parse_tls_proof_result "$tmp" || true)
  rm -f "$tmp"
  if echo "$parse_result" | grep -q "^OK"; then
    echo "✗ FAIL ($name): should have been rejected but was accepted: $parse_result"
    FAIL=$((FAIL + 1))
  else
    echo "✓ PASS ($name): rejected ($parse_result, as expected)"
    PASS=$((PASS + 1))
  fi
}

# ─── Generate a vitest-like JSON with given test statuses ─────────────────
# Args: status1 status2 status3 ... (e.g., "passed passed passed")
# If no statuses given, produces an empty assertionResults array.
make_test_json() {
  local statuses=("$@")
  local assertions="["
  local first=1
  for s in "${statuses[@]}"; do
    if [ "$s" = "" ]; then
      continue
    fi
    if [ $first -eq 1 ]; then
      first=0
    else
      assertions+=","
    fi
    assertions+="{\"status\":\"$s\"}"
  done
  assertions+="]"
  echo "{\"testResults\":[{\"assertionResults\":$assertions}]}"
}

echo "── STEP 15.94: Fail-closed parser validation ──"
echo ""

# ─── Test cases ─────────────────────────────────────────────────────────────

# Case 1: exactly 13 passed — must ACCEPT
expect_accept "13-passed" "$(make_test_json passed passed passed passed passed passed passed passed passed passed passed passed passed)"

# Case 2: 12 passed + 1 skipped — must REJECT (incomplete)
expect_reject "12-passed-1-skipped" "$(make_test_json passed passed passed passed passed passed passed passed passed passed passed passed skipped)"

# Case 3: 13 passed + 1 extra skipped — must REJECT (non-pass present)
expect_reject "13-passed-1-extra-skipped" "$(make_test_json passed passed passed passed passed passed passed passed passed passed passed passed passed skipped)"

# Case 4: 12 passed + 1 failed — must REJECT (failure present)
expect_reject "12-passed-1-failed" "$(make_test_json passed passed passed passed passed passed passed passed passed passed passed passed failed)"

# Case 5: 13 passed + 1 pending — must REJECT (pending not allowed)
expect_reject "13-passed-1-pending" "$(make_test_json passed passed passed passed passed passed passed passed passed passed passed passed passed pending)"

# Case 6: 13 passed + 1 todo — must REJECT (todo not allowed)
expect_reject "13-passed-1-todo" "$(make_test_json passed passed passed passed passed passed passed passed passed passed passed passed passed todo)"

# Case 7: only 12 passed — must REJECT (too few)
expect_reject "12-passed-only" "$(make_test_json passed passed passed passed passed passed passed passed passed passed passed passed)"

# Case 8: 14 passed — must REJECT (too many — unexpected)
expect_reject "14-passed" "$(make_test_json passed passed passed passed passed passed passed passed passed passed passed passed passed passed)"

# Case 9: empty result set — must REJECT
expect_reject "empty" "$(make_test_json)"

# Case 10: invalid JSON — must REJECT
expect_reject "invalid-json" "{not valid json"

# Case 11: all skipped — must REJECT
expect_reject "all-skipped" "$(make_test_json skipped skipped skipped skipped skipped skipped skipped skipped skipped skipped skipped skipped skipped)"

# Case 12: mixed statuses, only 10 passed — must REJECT
expect_reject "mixed-10-passed" "$(make_test_json passed passed passed passed passed passed passed passed passed passed skipped failed todo)"

# Case 13: 13 passed but with a "running" status extra — must REJECT
expect_reject "13-passed-1-running" "$(make_test_json passed passed passed passed passed passed passed passed passed passed passed passed passed running)"

echo ""
echo "── Summary ──"
echo "  Passed: $PASS"
echo "  Failed: $FAIL"
echo ""
if [ "$FAIL" -ne 0 ]; then
  echo "✗ FAIL: $FAIL validation cases did not behave as expected."
  exit 1
fi
echo "✓ All $PASS fail-closed parser validation cases passed."
exit 0
