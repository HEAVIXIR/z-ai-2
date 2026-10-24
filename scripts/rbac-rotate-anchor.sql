-- HEAVIX — STEP 15.78: Anchor value rotation (explicit, non-silent).
--
-- This script ROTATES the server-identity anchor value. It is intentionally
-- SEPARATE from the installation script (rbac-create-anchor-table.sql) so
-- that rotation is an explicit, deliberate action — not a side-effect of
-- re-running installation.
--
-- USAGE:
--   ANCHOR_VALUE=$(openssl rand -hex 32)
--   psql -h <host> -U postgres -d <db> \
--     -v anchor_value="$ANCHOR_VALUE" \
--     -f scripts/rbac-rotate-anchor.sql
--
-- This script UPDATEs the existing 'server_identity' row. If the row does
-- NOT exist, it fails (you must install first via rbac-create-anchor-table.sql).
-- The rotated_at timestamp is updated to record when the rotation happened.

-- ── 1. Rotate the value (UPDATE — not INSERT, not DROP) ────────────────────
UPDATE "_dryrun_anchor"
SET value = :'anchor_value',
    rotated_at = now()
WHERE key = 'server_identity';

-- If the row was not found, the UPDATE affected 0 rows. This is an error —
-- the table must be installed first. The \if below checks the rowcount.
\if :ROWCOUNT = 0
  \echo 'ERROR: _dryrun_anchor does not contain a server_identity row.'
  \echo '       Run scripts/rbac-create-anchor-table.sql first to install the anchor.'
  \quit 1
\endif

-- ── 2. Verify the rotation (informational) ────────────────────────────────
SELECT key, created_at, rotated_at FROM "_dryrun_anchor" WHERE key = 'server_identity';
