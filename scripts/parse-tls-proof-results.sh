#!/usr/bin/env bash
# HEAVIX — STEP 15.94 — Shared fail-closed parser for the TLS proof job.
# This is the implementation exercised by both CI and the focused parser tests.
set -uo pipefail

parse_tls_proof_result() {
  local json_file="${1:-}"

  if [[ -z "$json_file" || ! -f "$json_file" || ! -s "$json_file" ]]; then
    echo "FAIL_EMPTY_JSON"
    return 1
  fi
  if ! jq empty "$json_file" 2>/dev/null; then
    echo "FAIL_INVALID_JSON"
    return 1
  fi
  # Fail closed on missing or malformed Vitest result structure.
  if ! jq -e '(.testResults | type) == "array" and all(.testResults[]; (.assertionResults | type) == "array")' "$json_file" >/dev/null 2>&1; then
    echo "FAIL_INVALID_RESULT_SCHEMA"
    return 1
  fi

  local total_count pass_count non_pass_count
  local skip_count fail_count todo_count pending_count running_count non_pass_statuses
  total_count=$(jq '[.testResults[].assertionResults[]] | length' "$json_file") || return 1
  pass_count=$(jq '[.testResults[].assertionResults[] | select(.status == "passed")] | length' "$json_file") || return 1
  skip_count=$(jq '[.testResults[].assertionResults[] | select(.status == "skipped")] | length' "$json_file") || return 1
  fail_count=$(jq '[.testResults[].assertionResults[] | select(.status == "failed")] | length' "$json_file") || return 1
  todo_count=$(jq '[.testResults[].assertionResults[] | select(.status == "todo")] | length' "$json_file") || return 1
  pending_count=$(jq '[.testResults[].assertionResults[] | select(.status == "pending")] | length' "$json_file") || return 1
  running_count=$(jq '[.testResults[].assertionResults[] | select(.status == "running")] | length' "$json_file") || return 1
  non_pass_count=$((total_count - pass_count))
  non_pass_statuses=$(jq -r '[.testResults[].assertionResults[] | select(.status != "passed") | (.status // "<missing>")] | unique | join(", ")' "$json_file") || return 1

  echo "── TLS Proof Test Summary ──"
  echo "  Total:    $total_count"
  echo "  Passed:   $pass_count"
  echo "  Failed:   $fail_count"
  echo "  Skipped:  $skip_count"
  echo "  Todo:     $todo_count"
  echo "  Pending:  $pending_count"
  echo "  Running:  $running_count"
  echo "  Expected: exactly 13 assertions, all with status 'passed'"

  if [[ "$total_count" -ne 13 || "$pass_count" -ne 13 || "$non_pass_count" -ne 0 ]]; then
    echo "✗ FAIL: expected exactly 13 passed assertions and zero non-passing assertions."
    echo "  Non-pass statuses: ${non_pass_statuses:-<none>}"
    return 1
  fi

  echo "✓ Exactly 13 TLS behavioral tests passed (0 skips, failures, todo, pending, running, or unknown statuses)."
  return 0
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  if [[ "$#" -ne 1 ]]; then
    echo "Usage: $0 <vitest-json-file>" >&2
    exit 2
  fi
  parse_tls_proof_result "$1"
fi
