-- HEAVIX — STEP 15.79: Anchor value rotation (explicit, non-silent, robust).
--
-- This script ROTATES the server-identity anchor value. It is intentionally
-- SEPARATE from the installation script (rbac-create-anchor-table.sql) so
-- that rotation is an explicit, deliberate action — not a side-effect of
-- re-running installation.
--
-- STEP 15.79 FIX: the previous version used `\if :ROWCOUNT = 0` which is
-- NOT a valid psql variable. psql does not automatically populate ROWCOUNT
-- after a DML statement. This version uses a DO block with an explicit
-- row-count check that works on all supported PostgreSQL versions (13+).
--
-- USAGE:
--   ANCHOR_VALUE=$(openssl rand -hex 32)
--   psql -h <host> -U postgres -d <db> \
--     -v anchor_value="$ANCHOR_VALUE" \
--     -f scripts/rbac-rotate-anchor.sql
--
-- This script UPDATEs the existing 'server_identity' row. If the row does
-- NOT exist, the DO block raises an EXCEPTION (the script exits with a
-- non-zero psql error code). The rotated_at timestamp is updated to record
-- when the rotation happened.

-- ── 1. Rotate the value via a DO block with explicit row-count check ──────
-- The DO block performs the UPDATE and checks GET DIAGNOSTICS row_count.
-- If the row was not found (row_count = 0), it raises an EXCEPTION —
-- psql will exit with a non-zero error code, signaling failure.
DO $$
DECLARE
  affected_rows integer;
BEGIN
  UPDATE "_dryrun_anchor"
  SET value = :'anchor_value',
      rotated_at = now()
  WHERE key = 'server_identity';

  GET DIAGNOSTICS affected_rows = ROW_COUNT;

  IF affected_rows = 0 THEN
    RAISE EXCEPTION '_dryrun_anchor does not contain a server_identity row. Run scripts/rbac-create-anchor-table.sql first to install the anchor.';
  END IF;
END $$;

-- ── 2. Verify the rotation (informational) ────────────────────────────────
SELECT key, created_at, rotated_at FROM "_dryrun_anchor" WHERE key = 'server_identity';
