#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP_SCHEMA="$(mktemp)"
TMP_MAIN_SCHEMA="$(mktemp)"
trap 'rm -f "$TMP_SCHEMA" "$TMP_MAIN_SCHEMA"' EXIT

# Preview mirrors Main's data model. Keep the Worker-only generator out of
# the SQLite schema so a generate command cannot overwrite the PostgreSQL
# Worker client with a SQLite-generated client.
sed \
  -e 's/provider = "sqlite"/provider = "postgresql"/' \
  -e 's/url      = env("PREVIEW_DATABASE_URL")/url      = env("DATABASE_URL")/' \
  "$ROOT/prisma/preview-schema.prisma" > "$TMP_SCHEMA"

# The Worker generator belongs only to the PostgreSQL Main schema. Strip that
# runtime-specific block from the comparison baseline; compare all models and
# the regular Prisma generator exactly.
sed '/^[[:space:]]*generator workerClient[[:space:]]*{$/,/^[[:space:]]*}[[:space:]]*$/d' \
  "$ROOT/prisma/schema.prisma" > "$TMP_MAIN_SCHEMA"

diff -u "$TMP_MAIN_SCHEMA" "$TMP_SCHEMA"
echo "Preview schema matches Main data model (only datasource/runtime-generator differences)."
