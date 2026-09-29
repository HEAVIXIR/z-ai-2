-- Additive migration (Phase 7 — STEP 1)
-- Adds 4 tables that exist in schema.prisma + the working dev DB (created via `prisma db push`)
-- but were MISSING from the baseline 0_init/migration.sql.
-- Without this migration, `prisma migrate deploy` on a fresh DB omits these tables
-- and runtime queries throw PrismaClientValidationError / "no such table".
--
-- Scope: SEOMetadata, AdminPage, AdminPageVersion, AdminPageTemplate ONLY.
-- DDL is byte-identical to what Prisma's `db push` created in the dev SQLite DB
-- (ground-truth DDL sourced from sqlite_master on db/heavix.db).
-- Purely additive: CREATE TABLE + CREATE INDEX. No DROP, no ALTER, no data rewrite.
-- The broader migration drift (Company/DealRoom/Listing/SiteSettings/User divergence +
-- ~48 other missing tables) is DESTRUCTIVE and explicitly OUT OF SCOPE here —
-- requires a separate migration re-baseline directive.

-- CreateTable
CREATE TABLE "SEOMetadata" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "metaTitle" TEXT,
    "metaDescription" TEXT,
    "keywords" TEXT,
    "canonicalUrl" TEXT,
    "ogImage" TEXT,
    "ogTitle" TEXT,
    "ogDescription" TEXT,
    "structuredData" TEXT,
    "robotsIndex" BOOLEAN NOT NULL DEFAULT true,
    "robotsFollow" BOOLEAN NOT NULL DEFAULT true,
    "sitemapPriority" REAL NOT NULL DEFAULT 0.5,
    "sitemapChangeFreq" TEXT NOT NULL DEFAULT 'weekly',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AdminPage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT,
    "pageType" TEXT NOT NULL DEFAULT 'CUSTOM',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "publishedVersionId" TEXT,
    "scheduledPublishAt" DATETIME,
    "scheduledUnpublishAt" DATETIME,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "seoCanonical" TEXT,
    "seoOgImage" TEXT,
    "seoRobotsIndex" BOOLEAN NOT NULL DEFAULT true,
    "seoRobotsFollow" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AdminPageVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pageId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "layout" JSONB NOT NULL,
    "changeLog" TEXT,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" DATETIME,
    "publishedBy" TEXT,
    CONSTRAINT "AdminPageVersion_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "AdminPage" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AdminPageTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "pageType" TEXT NOT NULL DEFAULT 'CUSTOM',
    "layout" JSONB NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- Indexes (SEOMetadata)
CREATE UNIQUE INDEX "SEOMetadata_entityType_entityId_key" ON "SEOMetadata"("entityType", "entityId");
CREATE INDEX "SEOMetadata_entityType_idx" ON "SEOMetadata"("entityType");

-- Indexes (AdminPage)
CREATE UNIQUE INDEX "AdminPage_key_key" ON "AdminPage"("key");
CREATE INDEX "AdminPage_pageType_idx" ON "AdminPage"("pageType");
CREATE INDEX "AdminPage_status_idx" ON "AdminPage"("status");

-- Indexes (AdminPageVersion)
CREATE INDEX "AdminPageVersion_pageId_idx" ON "AdminPageVersion"("pageId");
CREATE UNIQUE INDEX "AdminPageVersion_pageId_version_key" ON "AdminPageVersion"("pageId", "version");
CREATE INDEX "AdminPageVersion_status_idx" ON "AdminPageVersion"("status");

-- Indexes (AdminPageTemplate)
CREATE UNIQUE INDEX "AdminPageTemplate_key_key" ON "AdminPageTemplate"("key");
