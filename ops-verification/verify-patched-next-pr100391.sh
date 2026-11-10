#!/usr/bin/env bash
set -Eeuo pipefail
# Test a patched Next package set in a disposable HEAVIX clone.
# No package manifests are edited; no DB connection, deploy, or Production action occurs.
BUNDLE_DIR="${1:-}"
HEAVIX_REF="${HEAVIX_REF:-}"
HEAVIX_REPO="${HEAVIX_REPO:-https://github.com/HEAVIXIR/z-ai-2.git}"
MAX_TRACE_ENTRIES="${MAX_TRACE_ENTRIES:-5000}"
OUTPUT_DIR="${OUTPUT_DIR:-$PWD/artifacts/heavix-pr100391-verification}"
WORK_DIR="${WORK_DIR:-$(mktemp -d "${TMPDIR:-/tmp}/heavix-pr100391-proof.XXXXXX")}"
KEEP_WORK_DIR="${KEEP_WORK_DIR:-0}"
log(){ printf '[heavix-patch-proof] %s\n' "$*"; }
die(){ printf '[heavix-patch-proof] ERROR: %s\n' "$*" >&2; exit 1; }
cleanup(){ if [[ "$KEEP_WORK_DIR" == 1 ]]; then log "Keeping isolated checkout: $WORK_DIR"; else rm -rf "$WORK_DIR"; fi; }
trap cleanup EXIT
[[ -n "$BUNDLE_DIR" && -d "$BUNDLE_DIR" ]] || die "Usage: $0 <build-output-dir>"
[[ -n "$HEAVIX_REF" ]] || die "Set HEAVIX_REF to the exact branch or commit to test."
for f in next.tar next-swc.tar next-mdx.tar next-env.tar next-bundle-analyzer.tar; do [[ -s "$BUNDLE_DIR/$f" ]] || die "Missing archive: $f"; done
for c in git bun tar node find sha256sum; do command -v "$c" >/dev/null 2>&1 || die "Missing command: $c"; done
mkdir -p "$OUTPUT_DIR"
OUTPUT_DIR="$(cd "$OUTPUT_DIR" && pwd)"
[[ -z "$(find "$OUTPUT_DIR" -mindepth 1 -maxdepth 1 -print -quit)" ]] || die "Output directory must be empty."
(cd "$BUNDLE_DIR" && sha256sum -c SHA256SUMS)
log "Cloning HEAVIX at explicit ref $HEAVIX_REF"
git clone --depth 1 --branch "$HEAVIX_REF" "$HEAVIX_REPO" "$WORK_DIR/heavix"
cd "$WORK_DIR/heavix"
actual_sha="$(git rev-parse HEAD)"
printf '%s\n' "$actual_sha" > "$OUTPUT_DIR/heavix-tested-commit.txt"
[[ -f package.json && -f bun.lock && -f wrangler.jsonc ]] || die "Expected HEAVIX Bun/Wrangler files missing."
[[ -f scripts/run-prisma-workerd-proof.mjs ]] || die "Existing Workerd smoke harness missing."
log "Installing HEAVIX dependencies from the committed lockfile"
bun install --frozen-lockfile
replace_package(){
  local archive="$1" destination="$2"
  mkdir -p "$destination"
  find "$destination" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
  tar -xf "$BUNDLE_DIR/$archive" -C "$destination"
  [[ -s "$destination/package.json" ]] || die "Invalid package archive: $archive"
}
replace_package next.tar node_modules/next
replace_package next-swc.tar node_modules/@next/swc
replace_package next-mdx.tar node_modules/@next/mdx
replace_package next-env.tar node_modules/@next/env
replace_package next-bundle-analyzer.tar node_modules/@next/bundle-analyzer
installed_version="$(node -p "require('./node_modules/next/package.json').version")"
[[ "$installed_version" == 16.4.5 ]] || die "Expected patched Next 16.4.5, found $installed_version."
log "Running HEAVIX Cloudflare build (build only; no deploy)"
set +e
bun run build:cloudflare 2>&1 | tee "$OUTPUT_DIR/cloudflare-build.log"
build_status=${PIPESTATUS[0]}
set -e
[[ "$build_status" -eq 0 ]] || die "Cloudflare build failed with exit $build_status."
log "Measuring output traces and checking emitted Prisma WASM"
node - "$OUTPUT_DIR" "$MAX_TRACE_ENTRIES" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const out = process.argv[2];
const maxEntries = Number(process.argv[3]);
const traces = [];
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.isFile() && e.name.endsWith('.nft.json')) {
      const data = JSON.parse(fs.readFileSync(p, 'utf8'));
      traces.push({ file: p, entries: Array.isArray(data.files) ? data.files.length : 0 });
    }
  }
}
for (const root of ['.next', '.open-next']) if (fs.existsSync(root)) walk(root);
const total = traces.reduce((n, t) => n + t.entries, 0);
const wasm = [];
function findWasm(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) findWasm(p);
    else if (e.isFile() && e.name === 'query_compiler_bg.wasm') wasm.push(p);
  }
}
for (const root of ['.next', '.open-next']) if (fs.existsSync(root)) findWasm(root);
const result = { traceFiles: traces.length, traceEntries: total, maxTraceEntries: maxEntries, traces, queryCompilerWasm: wasm };
fs.writeFileSync(path.join(out, 'artifact-evidence.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ traceFiles: traces.length, traceEntries: total, queryCompilerWasm: wasm }, null, 2));
if (!traces.length) throw new Error('No *.nft.json output trace files found.');
if (total > maxEntries) throw new Error('Trace entry count exceeds configured limit: ' + total);
if (!wasm.length) throw new Error('query_compiler_bg.wasm absent from .next/.open-next output.');
NODE
{
  for metric in memory.peak memory.max memory.events; do
    if [[ -r "/sys/fs/cgroup/$metric" ]]; then printf '%s:\n' "$metric"; cat "/sys/fs/cgroup/$metric"; fi
  done
} > "$OUTPUT_DIR/cgroup-memory.txt"
log "Running Wrangler non-deploying dry-run"
bunx wrangler deploy --dry-run --outdir "$OUTPUT_DIR/wrangler-dry-run" 2>&1 | tee "$OUTPUT_DIR/wrangler-dry-run.log"
log "Running explicit no-database Workerd smoke"
HEAVIX_RUNTIME_PROOF_TARGET=SMOKE_ONLY \
HEAVIX_APP_PREVIEW_PPG_URL= \
HEAVIX_STORE_PREVIEW_PPG_URL= \
DATABASE_URL= \
STORE_DATABASE_URL= \
bun run test:workerd 2>&1 | tee "$OUTPUT_DIR/workerd-smoke.log"
cat > "$OUTPUT_DIR/RESULT.txt" <<EOF
Result: PASS
HEAVIX ref: $HEAVIX_REF
HEAVIX tested commit: $actual_sha
Patched Next version: $installed_version
Cloudflare build: PASS
Trace and query_compiler_bg.wasm checks: PASS (artifact-evidence.json)
Wrangler deploy dry-run: PASS (no upload/deploy)
Workerd mode: SMOKE_ONLY; no database URLs supplied
Database connections attempted: NO
Database writes: NO
Production accessed: NO
Worker deployed: NO
DNS changed: NO
EOF
log "PASS: evidence saved to $OUTPUT_DIR"
log "Scope note: this proves artifact presence and the no-DB Workerd smoke, not a DB-backed Prisma query or Production readiness."
