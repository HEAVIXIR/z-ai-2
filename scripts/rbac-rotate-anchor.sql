-- HEAVIX — STEP 15.80: Anchor value rotation (rejects empty/missing value).
--
-- This script ROTATES the server-identity anchor value. It is intentionally
-- SEPARATE from the installation script (rbac-create-anchor-table.sql) so
-- that rotation is an explicit, deliberate action — not a side-effect of
-- re-running installation.
--
-- STEP 15.80: REJECTS empty/missing anchor_value BEFORE any UPDATE via a
-- CASE expression that forces a division-by-zero error if the value is
-- empty. This is a plain SQL statement (no DO block) so psql variable
-- substitution (:'anchor_value') works.
--
-- STEP 15.79 context: uses a plain UPDATE (psql var works outside $$),
-- then a DO block that verifies the row exists.
--
-- USAGE:
--   ANCHOR_VALUE=$(openssl rand -hex 32)
--   psql -h <host> -U postgres -d <db> \
--     -v anchor_value="$ANCHOR_VALUE" \
--     -f scripts/rbac-rotate-anchor.sql

\set ON_ERROR_STOP on

-- ── 0. Reject empty/missing anchor_value BEFORE any UPDATE ─────────────
-- The psql variable :'anchor_value' is interpolated into this SELECT.
-- If it's empty, the CASE forces a division-by-zero error (1/0), which
-- causes psql to exit non-zero BEFORE the UPDATE runs.
-- If it's non-empty, the SELECT returns 0 (no error) and execution continues.
SELECT CASE WHEN :'anchor_value' = '' THEN 1/0 ELSE 0 END AS empty_check;

-- ── 1. Rotate the value (plain UPDATE — psql var works outside $$) ────
UPDATE "_dryrun_anchor"
SET value = :'anchor_value',
    rotated_at = now()
WHERE key = 'server_identity';

-- ── 2. Verify the row exists (DO block — queries table, no psql vars) ──
DO $$
DECLARE
  row_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM "_dryrun_anchor" WHERE key = 'server_identity'
  ) INTO row_exists;

  IF NOT row_exists THEN
    RAISE EXCEPTION '_dryrun_anchor does not contain a server_identity row. Run scripts/rbac-create-anchor-table.sql first to install the anchor.';
  END IF;
END $$;

-- ── 3. Verify the rotation (informational) ──────────────────────────────
SELECT key, created_at, rotated_at FROM "_dryrun_anchor" WHERE key = 'server_identity';
