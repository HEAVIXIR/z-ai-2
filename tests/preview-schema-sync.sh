#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP_SCHEMA="$(mktemp)"
TMP_MAIN="$(mktemp)"
trap 'rm -f "$TMP_SCHEMA" "$TMP_MAIN"' EXIT

# The Preview schema mirrors the Main application models and Node client
# contract. Its datasource differs (SQLite + PREVIEW_DATABASE_URL), while
# Main has an additional Worker-only generated client that must not leak into
# the local SQLite schema.
sed \
  -e '1c\// HEAVIX — Industrial heavy-machinery marketplace' \
  -e '2c\// SQLite development schema (PostgreSQL for production — switch provider + url for deployment)' \
  -e '/^[[:space:]]*output   = "..\/src\/lib\/generated\/preview-sqlite-client"$/d' \
  -e 's/provider = "sqlite"/provider = "postgresql"/' \
  -e 's/url      = env("PREVIEW_DATABASE_URL")/url      = env("DATABASE_URL")/' \
  "$ROOT/prisma/preview-schema.prisma" > "$TMP_SCHEMA"

# Normalize Main by removing only the extra Workerd generator block.
sed '/^generator workerClient {/,/^}/d' "$ROOT/prisma/schema.prisma" > "$TMP_MAIN"

# Ignore only repeated blank lines introduced when removing the generator;
# all non-empty schema content and ordering remain strictly compared.
normalize_blank_lines() {
  awk 'NF { if (blank) print ""; print; blank=0; next } { blank=1 } END { if (blank) print "" }' "$1"
}

diff -u <(normalize_blank_lines "$TMP_MAIN") <(normalize_blank_lines "$TMP_SCHEMA")
echo "Preview schema matches Main application models and Node client contract."
