#!/usr/bin/env bash
set -Eeuo pipefail

# Verify patched Next packages in a disposable HEAVIX checkout.
# No database access, deployment, Production action, or DNS change is performed.

BUNDLE_DIR="${1:-}"
HEAVIX_REF="${HEAVIX_REF:-}"
HEAVIX_REPO="${HEAVIX_REPO:-https://github.com/HEAVIXIR/z-ai-2.git}"
MAX_UNIQUE_TRACE_FILES="${MAX_UNIQUE_TRACE_FILES:-5000}"
OUTPUT_DIR="${OUTPUT_DIR:-$PWD/artifacts/heavix-pr100391-verification}"
KEEP_WORK_DIR="${KEEP_WORK_DIR:-0}"
WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/heavix-pr100391-proof.XXXXXX")"

log() { printf '[heavix-patch-proof] %s\n' "$*"; }
die() { printf '[heavix-patch-proof] ERROR: %s\n' "$*" >&2; exit 1; }
cleanup() {
  if [[ "$KEEP_WORK_DIR" == 1 ]]; then
    log "Keeping isolated checkout: $WORK_DIR"
  else
    rm -rf "$WORK_DIR"
  fi
}

capture_failure_state() {
  local rc=$?
  set +e
  if [[ "$rc" -ne 0 && -d "${OUTPUT_DIR:-}" ]]; then
    {
      echo "=== FAILURE STATE CAPTURE ==="
      date -u +%Y-%m-%dT%H:%M:%SZ
      echo "exit_code=$rc"
      for path in "$WORK_DIR/heavix/node_modules/next" "$WORK_DIR/heavix/node_modules/next/types"; do
        echo "=== $path ==="
        ls -ld "$path" 2>&1
        if [[ -L "$path" ]]; then
          echo "symlink_target=$(readlink "$path" 2>&1)"
          echo "resolved_target=$(readlink -f "$path" 2>&1)"
        fi
        find "$path" -maxdepth 1 -printf '%M %u %g %s %p\n' 2>&1 | head -60
      done
      echo "=== next.tar entries (first 100) ==="
      if [[ -s "${BUNDLE_DIR:-}/next.tar" ]]; then
        tar -tf "$BUNDLE_DIR/next.tar" 2>&1 | head -100
        echo "=== next.tar types/global.d.ts matches ==="
        tar -tf "$BUNDLE_DIR/next.tar" 2>&1 |
          grep -E '(^|/)types/global\.d\.ts$' || echo "(NOT FOUND in archive)"
      else
        echo "next.tar unavailable"
      fi
      echo "=== package.json files declaration ==="
      grep -n -A8 -B2 '"files"' "$WORK_DIR/heavix/node_modules/next/package.json" 2>&1
    } > "$OUTPUT_DIR/failure-state-capture.txt" 2>&1
    log "Captured failure filesystem and archive evidence"
  fi
}
trap 'capture_failure_state; cleanup' EXIT

[[ -n "$BUNDLE_DIR" && -d "$BUNDLE_DIR" ]] || die "Usage: $0 <build-output-dir>"
BUNDLE_DIR="$(cd "$BUNDLE_DIR" && pwd)"
[[ -n "$HEAVIX_REF" ]] || die "Set HEAVIX_REF to the exact branch or commit to test."
[[ "$MAX_UNIQUE_TRACE_FILES" =~ ^[1-9][0-9]*$ ]] || die "MAX_UNIQUE_TRACE_FILES must be a positive integer."
for file in next.tar next-swc.tar next-mdx.tar next-env.tar next-bundle-analyzer.tar; do
  [[ -s "$BUNDLE_DIR/$file" ]] || die "Missing archive: $file"
done
for command_name in git bun tar node find sha256sum; do
  command -v "$command_name" >/dev/null 2>&1 || die "Missing command: $command_name"
done

mkdir -p "$OUTPUT_DIR"
OUTPUT_DIR="$(cd "$OUTPUT_DIR" && pwd)"
[[ -z "$(find "$OUTPUT_DIR" -mindepth 1 -maxdepth 1 -print -quit)" ]] ||
  die "Output directory must be empty."
(cd "$BUNDLE_DIR" && sha256sum -c SHA256SUMS)

log "Cloning HEAVIX at explicit ref $HEAVIX_REF"
git clone --filter=blob:none --no-checkout "$HEAVIX_REPO" "$WORK_DIR/heavix"
git -C "$WORK_DIR/heavix" fetch --depth 1 origin "$HEAVIX_REF"
git -C "$WORK_DIR/heavix" checkout --detach FETCH_HEAD
cd "$WORK_DIR/heavix"

# Recreate generated next-env.d.ts only in this disposable checkout.
if [[ ! -f next-env.d.ts ]]; then
  printf '%s\n' '/// <reference types="next" />' > next-env.d.ts
  log "Generated temporary next-env.d.ts in disposable checkout"
fi
actual_sha="$(git rev-parse HEAD)"
printf '%s\n' "$actual_sha" > "$OUTPUT_DIR/heavix-tested-commit.txt"
[[ -f package.json && -f bun.lock && -f wrangler.jsonc ]] || die "Expected HEAVIX Bun/Wrangler files missing."
[[ -f scripts/run-prisma-workerd-proof.mjs ]] || die "Existing Workerd smoke harness missing."

log "Installing HEAVIX dependencies from the committed lockfile"
bun install --frozen-lockfile
{
  echo "=== next package immediately after bun install ==="
  ls -ld node_modules/next 2>&1
  if [[ -L node_modules/next ]]; then
    echo "symlink_target=$(readlink node_modules/next 2>&1)"
    echo "resolved_target=$(readlink -f node_modules/next 2>&1)"
  fi
  find node_modules/next -maxdepth 1 -printf '%M %u %g %s %p\n' 2>&1 | head -60
} > "$OUTPUT_DIR/next-package-before-replace.txt" 2>&1

tar -tf "$BUNDLE_DIR/next.tar" > "$OUTPUT_DIR/next-tar-file-list.txt"
if grep -Fxq "./types/global.d.ts" "$OUTPUT_DIR/next-tar-file-list.txt"; then
  log "Archive inventory confirms types/global.d.ts is present in next.tar"
else
  log "Archive inventory shows types/global.d.ts is absent from next.tar"
fi

replace_package() {
  local archive="$1"
  local destination="$2"
  mkdir -p "$destination"
  find "$destination" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
  tar -xf "$BUNDLE_DIR/$archive" -C "$destination"
  [[ -s "$destination/package.json" ]] || die "Invalid package archive: $archive"
}
replace_package next.tar node_modules/next
{
  echo "=== next package immediately after archive extraction ==="
  ls -ld node_modules/next 2>&1
  if [[ -L node_modules/next ]]; then
    echo "symlink_target=$(readlink node_modules/next 2>&1)"
    echo "resolved_target=$(readlink -f node_modules/next 2>&1)"
  fi
  find node_modules/next -maxdepth 1 -printf '%M %u %g %s %p\n' 2>&1 | head -60
  echo "=== next/types after extraction ==="
  find node_modules/next/types -maxdepth 1 -printf '%M %u %g %s %p\n' 2>&1 | head -100
  echo "=== global.d.ts exact path ==="
  stat node_modules/next/types/global.d.ts 2>&1
} > "$OUTPUT_DIR/next-package-after-replace.txt" 2>&1

replace_package next-swc.tar node_modules/@next/swc
replace_package next-mdx.tar node_modules/@next/mdx
replace_package next-env.tar node_modules/@next/env
replace_package next-bundle-analyzer.tar node_modules/@next/bundle-analyzer

[[ -s node_modules/next/types/global.d.ts ]] || die "Patched next package is missing types/global.d.ts"
grep -q 'interface RequestInit' node_modules/next/types/global.d.ts || die "Next types/global.d.ts lacks RequestInit augmentation"
grep -qx '/// <reference types="next" />' next-env.d.ts || die "next-env.d.ts does not contain the exact canonical Next type reference"
log "Verified Next RequestInit augmentation and canonical next-env.d.ts reference"

installed_version="$(node -p "require('./node_modules/next/package.json').version")"
[[ "$installed_version" == 16.4.5 ]] || die "Expected patched Next 16.4.5, found $installed_version."
log "Running HEAVIX Cloudflare build in explicit Preview mode (build only; no deploy; no database URLs)"
set +e
HEAVIX_ENV=preview bun run build:cloudflare 2>&1 | tee "$OUTPUT_DIR/cloudflare-build.log"
build_status=${PIPESTATUS[0]}
set -e
[[ "$build_status" -eq 0 ]] || die "Cloudflare build failed with exit $build_status."

log "Measuring per-route trace references, unique traced files, and emitted Prisma WASM"
node - "$OUTPUT_DIR" "$MAX_UNIQUE_TRACE_FILES" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const out = process.argv[2];
const maxUniqueFiles = Number(process.argv[3]);
const traces = [];
const wasm = [];
const referencedByTraceCount = new Map();
const uniqueFiles = new Set();
function canonicalPath(traceFile, entry) {
  const absolute = path.resolve(path.dirname(traceFile), entry);
  try { return fs.realpathSync.native(absolute); } catch { return absolute; }
}
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (entry.isFile() && entry.name.endsWith('.nft.json')) {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      const entries = Array.isArray(data.files) ? data.files : [];
      const resolved = entries.map((item) => canonicalPath(file, item));
      for (const item of resolved) {
        uniqueFiles.add(item);
        referencedByTraceCount.set(item, (referencedByTraceCount.get(item) || 0) + 1);
      }
      traces.push({ file: path.relative(process.cwd(), file), entries: entries.length, uniqueEntries: new Set(resolved).size });
    } else if (entry.isFile() && entry.name === 'query_compiler_bg.wasm') {
      wasm.push(path.relative(process.cwd(), file));
    }
  }
}
for (const root of ['.next', '.open-next']) if (fs.existsSync(root)) walk(root);
const totalReferences = traces.reduce((sum, trace) => sum + trace.entries, 0);
const topReferencedFiles = [...referencedByTraceCount.entries()].sort((a,b)=>b[1]-a[1]).slice(0,100)
  .map(([file,traceCount])=>({file:path.relative(process.cwd(),file),traceCount}));
const wasmRelatedReferences = [...referencedByTraceCount.entries()].filter(([file])=>/wasm|turbopack/i.test(file))
  .sort((a,b)=>b[1]-a[1]).map(([file,traceCount])=>({file:path.relative(process.cwd(),file),traceCount}));
const maxEntriesPerTrace = Math.max(0,...traces.map(trace=>trace.entries));
const result = {traceFiles:traces.length,traceEntries:totalReferences,uniqueTraceFiles:uniqueFiles.size,
  maxUniqueTraceFiles:maxUniqueFiles,maxEntriesPerTrace,traces:traces.sort((a,b)=>b.entries-a.entries),
  topReferencedFiles,wasmRelatedReferences,queryCompilerWasm:wasm};
fs.writeFileSync(path.join(out,'artifact-evidence.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({traceFiles:traces.length,traceEntries:totalReferences,uniqueTraceFiles:uniqueFiles.size,
  maxEntriesPerTrace,wasmRelatedReferences:wasmRelatedReferences.slice(0,20),queryCompilerWasm:wasm},null,2));
if(!traces.length) throw new Error('No *.nft.json output trace files found.');
if(uniqueFiles.size>maxUniqueFiles) throw new Error(`Unique traced file count exceeds configured limit: ${uniqueFiles.size}`);
if(!wasm.length) throw new Error('query_compiler_bg.wasm absent from .next/.open-next output.');
NODE

{
  for metric in memory.peak memory.max memory.events; do
    if [[ -r "/sys/fs/cgroup/$metric" ]]; then
      printf '%s:\n' "$metric"
      cat "/sys/fs/cgroup/$metric"
    fi
  done
} > "$OUTPUT_DIR/cgroup-memory.txt"

log "Running Wrangler non-deploying dry-run"
bunx wrangler deploy --dry-run --outdir "$OUTPUT_DIR/wrangler-dry-run" 2>&1 | tee "$OUTPUT_DIR/wrangler-dry-run.log"
log "Running explicit no-database Workerd smoke"
HEAVIX_RUNTIME_PROOF_TARGET=SMOKE_ONLY \
HEAVIX_APP_PREVIEW_PPG_URL='' \
HEAVIX_STORE_PREVIEW_PPG_URL='' \
DATABASE_URL='' \
STORE_DATABASE_URL='' \
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
log "Scope note: proves artifact presence and no-DB Workerd smoke, not DB-backed Prisma execution or Production readiness."
