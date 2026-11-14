-- HEAVIX Identity Core V1 — additive only.
-- Existing User, Company, UserRole and RBAC records remain untouched.

ALTER TABLE "Company" ADD COLUMN "businessType" TEXT;

CREATE TABLE "UserCommercialPersona" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "personaKey" TEXT NOT NULL,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserCommercialPersona_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CompanyMembership" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "roleKey" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CompanyMembership_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserCommercialPersona_userId_personaKey_key"
  ON "UserCommercialPersona"("userId", "personaKey");
CREATE INDEX "UserCommercialPersona_personaKey_status_idx"
  ON "UserCommercialPersona"("personaKey", "status");
CREATE UNIQUE INDEX "CompanyMembership_companyId_userId_key"
  ON "CompanyMembership"("companyId", "userId");
CREATE INDEX "CompanyMembership_userId_status_idx"
  ON "CompanyMembership"("userId", "status");
CREATE INDEX "CompanyMembership_companyId_status_idx"
  ON "CompanyMembership"("companyId", "status");

ALTER TABLE "UserCommercialPersona"
  ADD CONSTRAINT "UserCommercialPersona_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompanyMembership"
  ADD CONSTRAINT "CompanyMembership_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompanyMembership"
  ADD CONSTRAINT "CompanyMembership_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
