-- CategoryAttribute active state is independent from required/optional.
-- Existing links remain active by default; existing listing values are untouched.
ALTER TABLE "CategoryAttribute"
ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;
