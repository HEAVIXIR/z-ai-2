#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/../.zscripts" && pwd)"
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TEST_ROOT="$(mktemp -d)"
trap 'rm -rf "$TEST_ROOT"' EXIT

FAKE_BIN="$TEST_ROOT/bin"
mkdir -p "$FAKE_BIN"
cat >"$FAKE_BIN/bun" <<'EOF'
#!/bin/bash
set -euo pipefail

if [ "$#" -ne 2 ] || [ "$1" != "run" ] || [ "$2" != "db:push:preview" ]; then
    echo "unexpected bun invocation: $*" >&2
    exit 1
fi

case "${PREVIEW_DATABASE_URL:-}" in
    file:*) db_path="${PREVIEW_DATABASE_URL#file:}" ;;
    *)
        echo "PREVIEW_DATABASE_URL must be an absolute SQLite file URL" >&2
        exit 1
        ;;
esac

case "$db_path" in
    /*) ;;
    *)
        echo "database path must be absolute: $db_path" >&2
        exit 1
        ;;
esac

mkdir -p "$(dirname "$db_path")"
if [ ! -f "$db_path" ]; then
    printf 'initialized\n' >"$db_path"
fi
printf '%s\n' "$PREVIEW_DATABASE_URL" >>"${DB_PUSH_CALLS:?}"
EOF
chmod +x "$FAKE_BIN/bun"

export PATH="$FAKE_BIN:$PATH"
export DB_PUSH_CALLS="$TEST_ROOT/db-push-calls"

# Missing Preview schema must fail closed and must not create an artifact.
MISSING_PROJECT="$TEST_ROOT/missing-project"
MISSING_BUILD="$TEST_ROOT/missing-build"
mkdir -p "$MISSING_PROJECT"
if PROJECT_DIR="$MISSING_PROJECT" BUILD_DIR="$MISSING_BUILD" \
    bash "$SCRIPT_DIR/database-runtime-build.sh"; then
    echo "FAIL: runtime build must reject a missing Preview schema" >&2
    exit 1
fi
test ! -e "$MISSING_BUILD/db/custom.db"

# The runtime build accepts the dedicated Preview schema and initializes only
# the build artifact, not the source project.
EMPTY_PROJECT="$TEST_ROOT/empty-project"
EMPTY_BUILD="$TEST_ROOT/empty-build"
mkdir -p "$EMPTY_PROJECT/prisma"
cp "$PROJECT_ROOT/prisma/preview-schema.prisma" "$EMPTY_PROJECT/prisma/preview-schema.prisma"

PROJECT_DIR="$EMPTY_PROJECT" BUILD_DIR="$EMPTY_BUILD" \
    bash "$SCRIPT_DIR/database-runtime-build.sh"

test -f "$EMPTY_BUILD/db/custom.db"
test "$(cat "$EMPTY_BUILD/db/custom.db")" = "initialized"
test ! -e "$EMPTY_PROJECT/db/custom.db"

# Existing Preview data and sibling files are preserved; schema sync targets
# the copied build artifact, not the source database.
EXISTING_PROJECT="$TEST_ROOT/existing-project"
EXISTING_BUILD="$TEST_ROOT/existing-build"
mkdir -p "$EXISTING_PROJECT/db" "$EXISTING_PROJECT/prisma"
cp "$PROJECT_ROOT/prisma/preview-schema.prisma" "$EXISTING_PROJECT/prisma/preview-schema.prisma"
printf 'preview-data\n' >"$EXISTING_PROJECT/db/custom.db"
printf 'sidecar\n' >"$EXISTING_PROJECT/db/README.txt"

PROJECT_DIR="$EXISTING_PROJECT" BUILD_DIR="$EXISTING_BUILD" \
    bash "$SCRIPT_DIR/database-runtime-build.sh"

test "$(cat "$EXISTING_BUILD/db/custom.db")" = "preview-data"
test "$(cat "$EXISTING_BUILD/db/README.txt")" = "sidecar"
test "$(wc -l <"$DB_PUSH_CALLS" | tr -d ' ')" = "2"
grep -Fx "file:$EMPTY_BUILD/db/custom.db" "$DB_PUSH_CALLS"
grep -Fx "file:$EXISTING_BUILD/db/custom.db" "$DB_PUSH_CALLS"

echo "database runtime build tests passed"
