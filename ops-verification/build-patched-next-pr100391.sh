#!/usr/bin/env bash
set -Eeuo pipefail
# Build Next.js v16.4.5 with the exact minimal fix from vercel/next.js#100391.
# No HEAVIX checkout, npm publish, database, Worker, or Production resource is touched.
NEXT_REF="${NEXT_REF:-v16.4.5}"
NEXT_REPO="${NEXT_REPO:-https://github.com/vercel/next.js.git}"
OUTPUT_DIR="${1:-$PWD/artifacts/next-pr100391}"
MIN_MEMORY_GIB="${MIN_MEMORY_GIB:-8}"
MIN_CPU_CORES="${MIN_CPU_CORES:-4}"
MIN_DISK_GIB="${MIN_DISK_GIB:-15}"
WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/heavix-next-patch.XXXXXX")"
KEEP_WORK_DIR="${KEEP_WORK_DIR:-0}"
log(){ printf '[next-patch-build] %s\n' "$*"; }
die(){ printf '[next-patch-build] ERROR: %s\n' "$*" >&2; exit 1; }
cleanup(){ if [[ "$KEEP_WORK_DIR" == 1 ]]; then log "Keeping source workspace: $WORK_DIR"; else rm -rf "$WORK_DIR"; fi; }
trap cleanup EXIT
for c in git pnpm node python3 cargo rustc tar sha256sum awk df nproc find grep; do command -v "$c" >/dev/null 2>&1 || die "Missing command: $c"; done
node_major="$(node -p 'Number(process.versions.node.split(".")[0])')"
(( node_major >= 20 )) || die "Node.js 20+ required."
(( $(nproc) >= MIN_CPU_CORES )) || die "Need at least $MIN_CPU_CORES CPU cores."
mem_limit=""
if [[ -r /sys/fs/cgroup/memory.max ]]; then
  candidate="$(cat /sys/fs/cgroup/memory.max)"
  [[ "$candidate" =~ ^[0-9]+$ ]] && mem_limit="$candidate"
fi
if [[ -n "$mem_limit" ]]; then
  mem_gib="$(awk -v b="$mem_limit" 'BEGIN {printf "%.1f", b/1073741824}')"
else
  mem_kib="$(awk '/MemTotal:/ {print $2}' /proc/meminfo)"
  mem_gib="$(awk -v k="$mem_kib" 'BEGIN {printf "%.1f", k/1048576}')"
fi
awk -v a="$mem_gib" -v m="$MIN_MEMORY_GIB" 'BEGIN {exit !(a >= m)}' || die "Need $MIN_MEMORY_GIB GiB RAM; found $mem_gib GiB."
disk_gib="$(df -Pk "$WORK_DIR" | awk 'NR==2 {printf "%.1f", $4/1048576}')"
awk -v a="$disk_gib" -v m="$MIN_DISK_GIB" 'BEGIN {exit !(a >= m)}' || die "Need $MIN_DISK_GIB GiB free disk; found $disk_gib GiB."
mkdir -p "$OUTPUT_DIR"
OUTPUT_DIR="$(cd "$OUTPUT_DIR" && pwd)"
[[ -z "$(find "$OUTPUT_DIR" -mindepth 1 -maxdepth 1 -print -quit)" ]] || die "Output directory must be empty: $OUTPUT_DIR"
log "Cloning Next.js $NEXT_REF"
git clone --depth 1 --branch "$NEXT_REF" "$NEXT_REPO" "$WORK_DIR/next.js"
cd "$WORK_DIR/next.js"
source_file="turbopack/crates/turbopack-wasm/js/src/node/loadWasm.ts"
[[ -f "$source_file" ]] || die "Expected upstream helper not found: $source_file"
git rev-parse HEAD > "$OUTPUT_DIR/upstream-source-commit.txt"
python3 - "$source_file" <<'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1])
s = p.read_text()
old = "return resolve(__turbopack_runtime_root__, chunkPath)"
new = """return resolve(
    /* turbopackIgnore: true */ __turbopack_runtime_root__,
    chunkPath
  )"""
if new in s:
    raise SystemExit("Patch already present; refusing a second application.")
if s.count(old) != 1:
    raise SystemExit("Expected exactly one original resolvePath expression.")
p.write_text(s.replace(old, new, 1))
PY
grep -Fq '/* turbopackIgnore: true */ __turbopack_runtime_root__' "$source_file" || die "Patch verification failed."
git diff --check
git diff -- "$source_file" > "$OUTPUT_DIR/pr100391.patch"
[[ -s "$OUTPUT_DIR/pr100391.patch" ]] || die "Patch diff is empty."
sha256sum "$OUTPUT_DIR/pr100391.patch" > "$OUTPUT_DIR/pr100391.patch.sha256"
log "Installing pinned Next.js monorepo dependencies"
pnpm install --frozen-lockfile
log "Running upstream JavaScript build"
# Build JS separately so we can restore the tracked global type if the build
# pipeline removes it before pack-util's existsSync-based file selection.
pnpm run build
if [[ ! -s packages/next/types/global.d.ts ]]; then
  log "Restoring tracked packages/next/types/global.d.ts after build"
  git show "$NEXT_REF:packages/next/types/global.d.ts" > packages/next/types/global.d.ts
fi
[[ -s packages/next/types/global.d.ts ]] || die "Upstream types/global.d.ts source is missing."

# Capture the exact file state before the official packer starts.
{
  echo "=== pre-pack type file ==="
  stat packages/next/types/global.d.ts 2>&1
  sha256sum packages/next/types/global.d.ts 2>&1
  echo "=== pre-pack types directory ==="
  find packages/next/types -maxdepth 1 -printf '%M %u %g %s %p\n' 2>&1 | sort
  echo "=== package files declaration ==="
  node -e 'const p=require("./packages/next/package.json"); console.log(JSON.stringify(p.files.filter(x => x.includes("types")), null, 2))'
} > "$OUTPUT_DIR/types-dir-before-pack.txt" 2>&1

# Instrument only the disposable upstream checkout's packageFiles() with
# read-only diagnostics. The selection/filtering algorithm remains unchanged.
python3 - scripts/pack-util.ts <<'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1])
s = p.read_text()
old = """  const packageFiles = [...globbedFiles, ...simpleFiles].sort()
  const set = new Set()
  return packageFiles.filter((f) => {"""
new = """  const packageFiles = [...globbedFiles, ...simpleFiles].sort()
  const set = new Set()
  const selectedFiles = packageFiles.filter((f) => {"""
if s.count(old) != 1:
    raise SystemExit("Expected exactly one packageFiles selection block.")
s = s.replace(old, new, 1)
old_end = """    set.add(f)
    return true
  })
}"""
new_end = """    set.add(f)
    return true
  })
  if (path.endsWith('/packages/next')) {
    console.log('[heavix-pack-diagnostic] packages/next packageFiles()')
    console.log(JSON.stringify({
      globalDtsExists: existsSync(join(path, 'types/global.d.ts')),
      declaredTypeEntries: allFiles.filter((f) => f.includes('types')),
      simpleTypeEntries: simpleFiles.filter((f) => f.includes('types')),
      globbedTypeEntries: globbedFiles.filter((f) => f.includes('types')),
      candidateTypeEntries: packageFiles.filter((f) => f.includes('types')),
      selectedTypeEntries: selectedFiles.filter((f) => f.includes('types')),
    }, null, 2))
  }
  return selectedFiles
}"""
if s.count(old_end) != 1:
    raise SystemExit("Expected exactly one packageFiles() function ending.")
p.write_text(s.replace(old_end, new_end, 1))
PY

tarball_dir="tarballs"
log "Running upstream pack-next (with read-only packageFiles diagnostics)"
pnpm pack-next --no-js-build --tar --compress=strip
tar -tf "$tarball_dir/next.tar" > "$OUTPUT_DIR/next-tar-file-list.txt"
grep -E '(^|/)types/global\.d\.ts$' "$OUTPUT_DIR/next-tar-file-list.txt" > "$OUTPUT_DIR/next-tar-global-dts-matches.txt" || true

for f in next.tar next-swc.tar next-mdx.tar next-env.tar next-bundle-analyzer.tar; do
  [[ -s "$tarball_dir/$f" ]] || die "Official pack-next output missing: $f"
  if [[ "$f" == "next.tar" ]]; then
    awk '$0 == "./types/global.d.ts" || $0 == "types/global.d.ts" { found=1 } END { exit !found }' "$OUTPUT_DIR/next-tar-file-list.txt" ||
      die "Official next.tar is missing exact types/global.d.ts path (with or without tar's ./ prefix)."
  fi
  cp "$tarball_dir/$f" "$OUTPUT_DIR/$f"
done
(cd "$OUTPUT_DIR" && sha256sum next.tar next-swc.tar next-mdx.tar next-env.tar next-bundle-analyzer.tar > SHA256SUMS)
cat > "$OUTPUT_DIR/BUILD-MANIFEST.txt" <<EOF
Upstream repository: $NEXT_REPO
Upstream ref: $NEXT_REF
Upstream commit: $(cat "$OUTPUT_DIR/upstream-source-commit.txt")
Applied fix: vercel/next.js PR #100391
Patch SHA256: $(sha256sum "$OUTPUT_DIR/pr100391.patch" | awk '{print $1}')
Build command: pnpm pack-next --no-js-build --tar --compress=strip
Package set: next, next-swc, next-mdx, next-env, next-bundle-analyzer
Built UTC: $(date -u +%Y-%m-%dT%H:%M:%SZ)
EOF
log "PASS: coordinated patched package set at $OUTPUT_DIR"
log "Verify: (cd '$OUTPUT_DIR' && sha256sum -c SHA256SUMS)"
