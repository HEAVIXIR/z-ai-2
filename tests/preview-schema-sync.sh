#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP_SCHEMA="$(mktemp)"
TMP_MAIN_SCHEMA="$(mktemp)"
trap 'rm -f "$TMP_SCHEMA" "$TMP_MAIN_SCHEMA"' EXIT

# The Preview schema mirrors Main's data model, except for its datasource
# provider/URL and generated-client output path. Main's engineType is a
# runtime-specific Workers setting; the disposable SQLite preview schema
# intentionally keeps Prisma's default engine, so exclude that one line from
# this parity comparison.
sed \
  -e '1c\// HEAVIX — Industrial heavy-machinery marketplace' \
  -e '2c\// SQLite development schema (PostgreSQL for production — switch provider + url for deployment)' \
  -e '/^[[:space:]]*output   = "..\/src\/lib\/generated\/preview-sqlite-client"$/d' \
  -e 's/provider = "sqlite"/provider = "postgresql"/' \
  -e 's/url      = env("PREVIEW_DATABASE_URL")/url      = env("DATABASE_URL")/' \
  "$ROOT/prisma/preview-schema.prisma" > "$TMP_SCHEMA"

sed '/^[[:space:]]*engineType = "client"$/d' "$ROOT/prisma/schema.prisma" > "$TMP_MAIN_SCHEMA"

diff -u "$TMP_MAIN_SCHEMA" "$TMP_SCHEMA"
echo "Preview schema matches Main schema (only datasource/client-output/runtime-engine differences)."
