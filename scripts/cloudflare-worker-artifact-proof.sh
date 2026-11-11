#!/usr/bin/env bash
# Read-only artifact proof: bundles the Worker locally and never uploads a version.
set -euo pipefail

outdir="$(mktemp -d "${TMPDIR:-/tmp}/heavix-worker-dry.XXXXXX")"
echo "HEAVIX_WRANGLER_DRY_RUN_OUTDIR=$outdir"

bunx wrangler deploy --dry-run --outdir="$outdir"

worker="$outdir/worker.js"
test -s "$worker" || {
  echo "FAIL: Wrangler dry-run did not produce worker.js"
  find "$outdir" -maxdepth 3 -type f -print
  exit 1
}

count_matches() {
  local pattern="$1"
  (grep -Roh "$pattern" "$outdir" --include='*.js' --include='*.mjs' || true) | wc -l | tr -d ' '
}

compile_count="$(count_matches 'compileStreaming')"
instantiate_count="$(count_matches 'instantiateStreaming')"
loader_count="$(count_matches 'loadWasmChunk')"
wasm_count="$(find "$outdir" -type f -name '*.wasm' -size +0c | wc -l | tr -d ' ')"

echo "HEAVIX_WASM_ARTIFACT compileStreaming=$compile_count instantiateStreaming=$instantiate_count loadWasmChunk=$loader_count wasmFiles=$wasm_count"
find "$outdir" -type f -name '*.wasm' -print

test "$compile_count" -eq 0 || {
  echo "FAIL: unsupported streaming WebAssembly loader remains in the Worker bundle"
  exit 1
}
test "$instantiate_count" -eq 0 || {
  echo "FAIL: unsupported streaming WebAssembly instantiation remains in the Worker bundle"
  exit 1
}
test "$loader_count" -gt 0 || {
  echo "FAIL: OpenNext Workerd loadWasmChunk helper is missing"
  exit 1
}
test "$wasm_count" -gt 0 || {
  echo "FAIL: non-empty WASM assets are missing from the Wrangler dry-run bundle"
  exit 1
}

echo "PASS: Workerd-compatible WASM loader and assets are present."
echo "HEAVIX_PREVIEW_DEPLOY_BLOCKED_PENDING_ARTIFACT_AND_DATABASE_ISOLATION_PROOF"
