-- HEAVIX — STEP 15.79: Anchor value rotation (explicit, non-silent, robust).
--
-- This script ROTATES the server-identity anchor value. It is intentionally
-- SEPARATE from the installation script (rbac-create-anchor-table.sql) so
-- that rotation is an explicit, deliberate action — not a side-effect of
-- re-running installation.
--
-- STEP 15.79 FIX: previous versions used a DO block (psql var doesn't work
-- inside $$) and a CTE with division-by-zero (fragile). This version uses
-- a plain UPDATE (psql var works outside $$), then a DO block that checks
-- if the row exists and raises an EXCEPTION if not. The DO block does NOT
-- use psql variables — it queries the table directly.
--
-- USAGE:
--   ANCHOR_VALUE=$(openssl rand -hex 32)
--   psql -h <host> -U postgres -d <db> \
--     -v anchor_value="$ANCHOR_VALUE" \
--     -f scripts/rbac-rotate-anchor.sql
--
-- This script UPDATEs the existing 'server_identity' row. If the row does
-- NOT exist, the DO block raises an EXCEPTION (psql exits non-zero).

\set ON_ERROR_STOP on

-- ── 1. Rotate the value (plain UPDATE — psql var works outside $$) ───────
UPDATE "_dryrun_anchor"
SET value = :'anchor_value',
    rotated_at = now()
WHERE key = 'server_identity';

-- ── 2. Verify the row exists (DO block — NO psql vars, queries table) ────
-- The DO block checks if the 'server_identity' row exists. If the UPDATE
-- affected 0 rows (row was missing), the DO block raises an EXCEPTION.
-- This does NOT use psql variables — it queries the table directly.
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

-- ── 3. Verify the rotation (informational) ────────────────────────────────
SELECT key, created_at, rotated_at FROM "_dryrun_anchor" WHERE key = 'server_identity';
