-- HEAVIX — STEP 15.80: Anchor value rotation (rejects empty/missing value).
--
-- This script ROTATES the server-identity anchor value. It is intentionally
-- SEPARATE from the installation script (rbac-create-anchor-table.sql) so
-- that rotation is an explicit, deliberate action — not a side-effect of
-- re-running installation.
--
-- STEP 15.80 FIX: the owner identified that the previous version did NOT
-- reject an empty or missing `anchor_value` before performing the UPDATE.
-- This could set the anchor to an empty string (silently breaking the
-- wrong-DB defense). This version REJECTS an empty/missing value BEFORE
-- any change is made, via a psql `\if` guard that checks the variable.
--
-- STEP 15.79 context: previous versions used a DO block (psql var doesn't
-- work inside $$) and a CTE with division-by-zero (fragile). The STEP 15.79
-- version uses a plain UPDATE (psql var works outside $$), then a DO block
-- that checks if the row exists and raises an EXCEPTION if not.
--
-- USAGE:
--   ANCHOR_VALUE=$(openssl rand -hex 32)
--   psql -h <host> -U postgres -d <db> \
--     -v anchor_value="$ANCHOR_VALUE" \
--     -f scripts/rbac-rotate-anchor.sql
--
-- This script:
--   1. REJECTS empty/missing anchor_value (fails BEFORE any change)
--   2. UPDATEs the existing 'server_identity' row
--   3. Verifies the row exists (DO block, raises EXCEPTION if not)

\set ON_ERROR_STOP on

-- ── 0. Reject empty/missing anchor_value BEFORE any change ──────────────
-- If anchor_value is not set or is empty, the script halts immediately
-- WITHOUT modifying the database. This prevents silently setting the
-- anchor to an empty string (which would break the wrong-DB defense).
\if :{?anchor_value}
  \if '{anchor_value}' = ''
    \echo 'ERROR: anchor_value is empty. Provide a non-empty value.'
    \echo '       Usage: psql -v anchor_value="<secret>" -f scripts/rbac-rotate-anchor.sql'
    \quit 1
  \endif
\else
  \echo 'ERROR: anchor_value variable is not set.'
  \echo '       Usage: psql -v anchor_value="<secret>" -f scripts/rbac-rotate-anchor.sql'
  \quit 1
\endif

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
