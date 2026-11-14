-- Additive, backward-compatible selectable homepage hero templates.
ALTER TABLE "HeroConfig"
  ADD COLUMN "activeTemplate" TEXT DEFAULT 'classic',
  ADD COLUMN "cinematicConfig" TEXT;
