#!/bin/bash

set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-/home/z/my-project}"
BUILD_DIR="${BUILD_DIR:?BUILD_DIR is required}"
SOURCE_DB_DIR="$PROJECT_DIR/db"
SOURCE_DB_PATH="$SOURCE_DB_DIR/custom.db"
TARGET_DB_DIR="$BUILD_DIR/db"
TARGET_DB_PATH="$TARGET_DB_DIR/custom.db"

mkdir -p "$TARGET_DB_DIR"

# FAIL-CLOSED: The Preview SQLite schema MUST exist. We refuse to run
# db:push against the main PostgreSQL schema with a file: URL — that
# would silently create a SQLite database using a PostgreSQL schema,
# producing invalid SQL and corrupting the build artifact.
if [ ! -f "$PROJECT_DIR/prisma/preview-schema.prisma" ]; then
    echo "✗ FATAL: prisma/preview-schema.prisma not found."
    echo "  The Preview SQLite schema is required for runtime build."
    echo "  The main PostgreSQL schema (prisma/schema.prisma) MUST NOT be"
    echo "  used with a file: URL — it would produce invalid SQLite SQL."
    echo "  See PR #83 for Preview schema isolation."
    exit 1
fi

if [ -f "$SOURCE_DB_PATH" ]; then
    echo "🗄️  Copying Preview database to build artifacts..."
    cp -a "$SOURCE_DB_DIR/." "$TARGET_DB_DIR/"
else
    echo "ℹ️  No Preview database found at db/custom.db, initializing empty Preview database"
fi

echo "🗄️  Syncing database schema in build artifacts..."
(
    cd "$PROJECT_DIR"
    # Use the Preview SQLite schema (NOT the main PostgreSQL schema).
    # The preview-schema.prisma declares provider = "sqlite" and is a
    # mirror of the main schema for local/preview development only.
    PREVIEW_DATABASE_URL="file:$TARGET_DB_PATH" bun run db:push:preview
)

if [ ! -f "$TARGET_DB_PATH" ]; then
    echo "❌ Database initialization succeeded but $TARGET_DB_PATH was not created"
    exit 1
fi

echo "✅ Build artifact database ready"
ls -lah "$TARGET_DB_DIR"
