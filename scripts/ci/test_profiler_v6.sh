#!/usr/bin/env bash
# test_profiler_v6.sh — Build & run the P0 verification test suite for
#                       malloc_profiler_v6.c (standalone fixed version).
#
# This script builds TWO profiler variants:
#   1. malloc_profiler_v6_test.so  — with -DPROFILER_V6_TEST_HOOKS (exports
#      __profiler_v6_test_* symbols for deterministic bootstrap testing)
#   2. malloc_profiler_v6_prod.so  — production build (NO test hooks; identical
#      to what would be Base64-embedded in the workflow)
#
# It then:
#   - Runs the C test suite under the TEST variant (exercises P0-a/b/c/d)
#   - Runs a Node.js smoke test under the PROD variant (verifies no crash in
#     a real V8 runtime, and that production code has zero test-hook surface)
#
# Usage:  bash scripts/ci/test_profiler_v6.sh
# Exit:   0 = all passed, 1 = any failure
# ============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

echo "============================================================"
echo " STEP A-3.15 — P0 verification for malloc_profiler_v6 (fixed)"
echo " repo:   $REPO_DIR"
echo " work:   $WORK_DIR"
echo "============================================================"

PROFILER_SRC="$REPO_DIR/scripts/ci/malloc_profiler_v6.c"
TEST_SRC="$REPO_DIR/scripts/ci/test_profiler_v6.c"

for f in "$PROFILER_SRC" "$TEST_SRC"; do
    if [[ ! -f "$f" ]]; then
        echo "FAIL: missing source file: $f"
        exit 1
    fi
done

PROF_TEST_SO="$WORK_DIR/malloc_profiler_v6_test.so"
PROF_PROD_SO="$WORK_DIR/malloc_profiler_v6_prod.so"
TEST_BIN="$WORK_DIR/test_profiler_v6"

echo
echo "--- 1. Compile profiler TEST variant (-DPROFILER_V6_TEST_HOOKS) ---"
if ! gcc -shared -fPIC -O2 -g -DPROFILER_V6_TEST_HOOKS \
        -o "$PROF_TEST_SO" "$PROFILER_SRC" -ldl -lpthread -Wall -Wextra -Werror; then
    echo "FAIL: profiler TEST compilation failed"
    exit 1
fi
echo "OK: $PROF_TEST_SO ($(stat -c%s "$PROF_TEST_SO") bytes)"

echo
echo "--- 2. Compile profiler PROD variant (no test hooks) ---"
if ! gcc -shared -fPIC -O2 -g \
        -o "$PROF_PROD_SO" "$PROFILER_SRC" -ldl -lpthread -Wall -Wextra -Werror; then
    echo "FAIL: profiler PROD compilation failed"
    exit 1
fi
echo "OK: $PROF_PROD_SO ($(stat -c%s "$PROF_PROD_SO") bytes)"

# Verify the PROD variant does NOT export the test symbols.
if nm -D "$PROF_PROD_SO" 2>/dev/null | grep -q "__profiler_v6_test_"; then
    echo "FAIL: PROD variant exports test-hook symbols (should not)"
    nm -D "$PROF_PROD_SO" | grep "__profiler_v6_test_"
    exit 1
fi
echo "OK: PROD variant has no test-hook symbols (verified via nm -D)"

echo
echo "--- 3. Compile test binary (linked against TEST variant for hooks) ---"
if ! gcc -O2 -g -pthread -o "$TEST_BIN" "$TEST_SRC" "$PROF_TEST_SO" -ldl -Wall -Wextra -Werror; then
    echo "FAIL: test binary compilation failed"
    exit 1
fi
echo "OK: $TEST_BIN ($(stat -c%s "$TEST_BIN") bytes)"

echo
echo "--- 4. Run P0 test suite under TEST profiler (LD_PRELOAD) ---"
export LD_PRELOAD="$PROF_TEST_SO"
TEST_EXIT=0
"$TEST_BIN" 2>"$WORK_DIR/test_stderr.log" || TEST_EXIT=$?
echo "     test exit code: $TEST_EXIT"
echo "     --- full test result lines ---"
grep -E "^(=== T|PASS|FAIL|====| Results)" "$WORK_DIR/test_stderr.log" | sed 's/^/     | /'
echo "     --- last 3 profiler JSON lines ---"
grep -E "PROFILER6_(INIT|SUMMARY)" "$WORK_DIR/test_stderr.log" | tail -3 | sed 's/^/     | /'

echo
echo "--- 5. Node.js smoke test under PROD profiler (no test hooks) ---"
NODE_BIN=""
for c in node nodejs; do
    if command -v "$c" >/dev/null 2>&1; then NODE_BIN="$c"; break; fi
done
if [[ -z "$NODE_BIN" ]]; then
    echo "WARN: node not found; skipping Node.js smoke test"
else
    echo "     using: $($NODE_BIN --version 2>/dev/null || echo 'unknown')"
    cat > "$WORK_DIR/node_smoke.js" <<'JS'
const N = 50000;
let arr = [];
for (let i = 0; i < N; i++) {
    arr.push(Buffer.alloc(8192 + (i % 100000)));
    if (i % 5000 === 0) arr = arr.slice(-100);
}
let b = Buffer.alloc(4096);
for (let k = 0; k < 10; k++) b = Buffer.concat([b, b]);
console.error(JSON.stringify({type:"NODE_SMOKE_DONE", allocs:N, finalBufLen:b.length}));
JS
    export LD_PRELOAD="$PROF_PROD_SO"
    NODE_EXIT=0
    "$NODE_BIN" "$WORK_DIR/node_smoke.js" 2>"$WORK_DIR/node_stderr.log" || NODE_EXIT=$?
    echo "     node exit code: $NODE_EXIT"
    echo "     --- key profiler/node output ---"
    grep -E "PROFILER6_INIT|NODE_SMOKE_DONE" "$WORK_DIR/node_stderr.log" | head -5 | sed 's/^/     | /'
    if [[ $NODE_EXIT -ne 0 ]]; then
        echo "FAIL: Node.js smoke test crashed (exit $NODE_EXIT)"
        TEST_EXIT=1
    fi
fi

echo
echo "============================================================"
if [[ $TEST_EXIT -eq 0 ]]; then
    echo " RESULT: ALL P0 TESTS PASSED"
else
    echo " RESULT: FAILURES DETECTED (exit $TEST_EXIT)"
fi
echo "============================================================"
exit $TEST_EXIT
