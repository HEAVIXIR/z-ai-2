#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP_SCHEMA="$(mktemp)"
trap 'rm -f "$TMP_SCHEMA"' EXIT

# The Preview schema is an exact mirror of Main except for its datasource
# provider/URL and a separate generated-client output path. Fail CI on drift.
sed \
  -e '1,2c\\// HEAVIX — Industrial heavy-machinery marketplace\n// SQLite development schema (PostgreSQL for production — switch provider + url for deployment)' \
  -e '/^[[:space:]]*output   = "..\/src\/lib\/generated\/preview-sqlite-client"$/d' \
  -e 's/provider = "sqlite"/provider = "postgresql"/' \
  -e 's/url      = env("PREVIEW_DATABASE_URL")/url      = env("DATABASE_URL")/' \
  "$ROOT/prisma/preview-schema.prisma" > "$TMP_SCHEMA"

diff -u "$ROOT/prisma/schema.prisma" "$TMP_SCHEMA"
echo "Preview schema matches Main schema (only datasource/client-output differences)."
