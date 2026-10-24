-- HEAVIX — STEP 15.79: Anchor value rotation (explicit, non-silent, robust).
--
-- This script ROTATES the server-identity anchor value. It is intentionally
-- SEPARATE from the installation script (rbac-create-anchor-table.sql) so
-- that rotation is an explicit, deliberate action — not a side-effect of
-- re-running installation.
--
-- STEP 15.79 FIX: the previous version used a DO block with
-- `:'anchor_value'` inside `$$` quoting. psql variable substitution does
-- NOT work inside PL/pgSQL `$$` dollar-quoted strings (psql treats `$$`
-- blocks as opaque). This version uses a CTE (WITH ... AS) approach that
-- performs the UPDATE + row-count check in a single SQL statement, with
-- the psql variable OUTSIDE any `$$` block.
--
-- USAGE:
--   ANCHOR_VALUE=$(openssl rand -hex 32)
--   psql -h <host> -U postgres -d <db> \
--     -v anchor_value="$ANCHOR_VALUE" \
--     -f scripts/rbac-rotate-anchor.sql
--
-- This script UPDATEs the existing 'server_identity' row. If the row does
-- NOT exist, the CTE returns 0 affected rows and the script exits with a
-- non-zero psql error code (via \set ON_ERROR_STOP on + the SELECT raising
-- a division-by-zero when affected_rows=0).

\set ON_ERROR_STOP on

-- ── 1. Rotate the value via a CTE with explicit row-count check ──────────
-- The CTE performs the UPDATE and returns the number of affected rows.
-- If 0 rows were affected (the 'server_identity' row doesn't exist), the
-- outer query raises a division-by-zero error (1/(affected_rows=0)),
-- which causes psql to exit with a non-zero error code.
WITH updated AS (
  UPDATE "_dryrun_anchor"
  SET value = :'anchor_value',
      rotated_at = now()
  WHERE key = 'server_identity'
  RETURNING 1
)
SELECT
  CASE
    WHEN count(*) = 0 THEN
      -- Force an error: division by zero
      1 / 0
    ELSE 0
  END AS rotation_check
FROM updated;

-- If we reach this point, the rotation succeeded (the CASE above returned 0).

-- ── 2. Verify the rotation (informational) ────────────────────────────────
SELECT key, created_at, rotated_at FROM "_dryrun_anchor" WHERE key = 'server_identity';
