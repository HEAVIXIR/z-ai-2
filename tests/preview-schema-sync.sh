#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP_MAIN="$(mktemp)"
TMP_PREVIEW="$(mktemp)"
trap 'rm -f "$TMP_MAIN" "$TMP_PREVIEW"' EXIT

# Prisma 7 keeps datasource URLs in prisma.config.ts. The Preview schema must
# match the main data model while using SQLite and a separate client output.
normalize_schema() {
  local input="$1"
  local output="$2"
  sed \
    -e '/^[[:space:]]*output[[:space:]]*=/d' \
    -e '/^[[:space:]]*runtime[[:space:]]*=/d' \
    -e '/^[[:space:]]*generator nodeClient[[:space:]]*{/,/^[[:space:]]*}/d' \
    -e '/^[[:space:]]*generator nodeRuntimeClient[[:space:]]*{/,/^[[:space:]]*}/d' \
    -e 's/provider[[:space:]]*=[[:space:]]*"sqlite"/provider = "postgresql"/' \
    -e '/^[[:space:]]*$/d' \
    "$input" > "$output"
}

normalize_schema "$ROOT/prisma/schema.prisma" "$TMP_MAIN"
normalize_schema "$ROOT/prisma/preview-schema.prisma" "$TMP_PREVIEW"

diff -u "$TMP_MAIN" "$TMP_PREVIEW"
echo "Preview schema matches Main data model (Node-only generator excluded; datasource provider and client output/runtime differ)."
