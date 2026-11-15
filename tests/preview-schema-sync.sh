#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP_SCHEMA="$(mktemp)"
trap 'rm -f "$TMP_SCHEMA"' EXIT

# The Preview schema mirrors Main except for datasource/client-output differences.
# SQLite Preview does not use directUrl, so add it only to the temporary mirror.
sed \
  -e '1c\// HEAVIX — Industrial heavy-machinery marketplace' \
  -e '2c\// SQLite development schema (PostgreSQL for production — switch provider + url for deployment)' \
  -e '/^[[:space:]]*output   = "..\/src\/lib\/generated\/preview-sqlite-client"$/d' \
  -e 's/provider = "sqlite"/provider = "postgresql"/' \
  -e 's/url      = env("PREVIEW_DATABASE_URL")/url      = env("DATABASE_URL")/' \
  -e '/url      = env("DATABASE_URL")/a\  directUrl = env("DIRECT_URL")' \
  "$ROOT/prisma/preview-schema.prisma" > "$TMP_SCHEMA"

diff -u "$ROOT/prisma/schema.prisma" "$TMP_SCHEMA"
echo "Preview schema matches Main schema (only datasource/client-output differences)."
