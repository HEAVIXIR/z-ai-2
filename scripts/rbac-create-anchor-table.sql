-- HEAVIX — STEP 15.77: Create the server-identity trust-anchor table.
--
-- This table stores the server-identity value that the dry-run preflight
-- compares against DRYRUN_SERVER_IDENTITY_ANCHOR. The value is set by the
-- DBA out-of-band (NOT from DATABASE_URL or any caller-controlled env var).
--
-- WHY A TABLE (NOT A GUC):
--   STEP 15.76 used a PostgreSQL custom GUC (app.server_identity). The owner
--   identified (H-03) that custom GUCs are SESSION-LEVEL FORGEABLE: the
--   connecting client can override the DBA-set value via
--   `SET app.server_identity = '<value>'` before the preflight reads it.
--   ANY role can SET custom GUCs — there is no privilege check.
--
--   A TABLE is NOT affected by SET. The preflight verifies the read-only role
--   has NO write privileges (INSERT/UPDATE/DELETE/TRUNCATE) on this table.
--   So the connecting client CANNOT forge the table value.
--
-- Usage:
--   psql -h <host> -U postgres -d <db> \
--     -v anchor_value="<your-secret-server-identity>" \
--     -f scripts/rbac-create-anchor-table.sql
--
-- The anchor_value should be a unique secret for each server/cluster.
-- Generate one with: openssl rand -hex 32

-- Create the table (idempotent — drop if exists)
DROP TABLE IF EXISTS "_dryrun_anchor";
CREATE TABLE "_dryrun_anchor" (
  key text PRIMARY KEY,
  value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Insert the server-identity value (from psql variable :anchor_value)
INSERT INTO "_dryrun_anchor" (key, value) VALUES ('server_identity', :'anchor_value');

-- Grant SELECT to the read-only role (so the preflight can read the value)
GRANT SELECT ON "_dryrun_anchor" TO heavix_dryrun_ro;

-- Explicitly REVOKE all write privileges (defense-in-depth)
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON "_dryrun_anchor" FROM heavix_dryrun_ro;

-- Also REVOKE from PUBLIC (no inherited write access)
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON "_dryrun_anchor" FROM PUBLIC;

-- Verify the grants
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_name = '_dryrun_anchor'
ORDER BY grantee, privilege_type;
-- Expected output:
--   heavix_dryrun_ro | SELECT
-- (NO write privileges for heavix_dryrun_ro or PUBLIC)
