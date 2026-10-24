-- HEAVIX — STEP 15.78: Non-destructive, idempotent anchor-table installation.
--
-- STEP 15.77 used `DROP TABLE IF EXISTS` which is DESTRUCTIVE: re-running the
-- script would delete the existing anchor value. The owner identified (H-04)
-- that this is unacceptable for a security control — re-installation must not
-- destroy the existing trusted value.
--
-- STEP 15.78 FIX:
--   - CREATE TABLE IF NOT EXISTS (non-destructive — does NOT drop existing data)
--   - INSERT ... ON CONFLICT (key) DO NOTHING (idempotent — does NOT overwrite)
--   - To ROTATE the value, use the separate rotation script
--     (scripts/rbac-rotate-anchor.sql) which requires explicit confirmation.
--
-- ── HONEST SCOPE OF THIS CONTROL ──────────────────────────────────────────
--
-- This anchor table is a DEFENSE AGAINST ACCIDENTAL WRONG-DB CONNECTION
-- (e.g., connecting to a dev/staging DB that lacks the anchor, or has a
-- different anchor value). It is NOT a cryptographic proof of server identity.
--
-- A CLONED DATABASE, a restored backup, or a logical replication target
-- will have the IDENTICAL table contents — including the anchor value.
-- This control CANNOT distinguish the original server from a clone.
--
-- TRUE server identity requires TLS with CA validation (verifying the
-- server's TLS certificate against a trusted CA), which is a deployment-
-- architecture decision OUTSIDE this script's scope. See
-- docs/phase3/STEP-15.68-STAGING-RUNBOOK.md §6 for TLS guidance.
--
-- Until TLS-based verification is deployed, Finding D (server identity)
-- remains UNVERIFIED in the audit report — NOT FIXED.
--
-- ── USAGE ─────────────────────────────────────────────────────────────────
--
--   # Generate a unique secret for each server/cluster:
--   ANCHOR_VALUE=$(openssl rand -hex 32)
--
--   # Install (idempotent + non-destructive):
--   psql -h <host> -U postgres -d <db> \
--     -v anchor_value="$ANCHOR_VALUE" \
--     -f scripts/rbac-create-anchor-table.sql
--
--   # The value is NOT printed by the script. Store it in your secrets
--   # manager and set DRYRUN_SERVER_IDENTITY_ANCHOR at dry-run time.

-- ── 1. Create the table IF NOT EXISTS (non-destructive) ──────────────────
CREATE TABLE IF NOT EXISTS "_dryrun_anchor" (
  key text PRIMARY KEY,
  value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  rotated_at timestamptz
);

-- ── 1a. Reject empty/missing anchor_value BEFORE any insert (STEP 15.80) ─
-- The psql variable :'anchor_value' is interpolated into this SELECT.
-- If it's empty, the CASE forces a division-by-zero error (1/0), which
-- causes psql to exit non-zero BEFORE the INSERT runs.
\set ON_ERROR_STOP on
SELECT CASE WHEN :'anchor_value' = '' THEN 1/0 ELSE 0 END AS empty_check;

-- ── 2. Insert the server-identity value (idempotent — does NOT overwrite) ─
-- ON CONFLICT DO NOTHING: if the 'server_identity' row already exists, this
-- is a no-op. The existing value is PRESERVED. To change the value, use
-- the rotation script (scripts/rbac-rotate-anchor.sql) which is explicit.
INSERT INTO "_dryrun_anchor" (key, value)
VALUES ('server_identity', :'anchor_value')
ON CONFLICT (key) DO NOTHING;

-- ── 3. Grant SELECT to the read-only role (so the preflight can read it) ─
GRANT SELECT ON "_dryrun_anchor" TO heavix_dryrun_ro;

-- ── 4. REVOKE all write privileges (defense-in-depth) ────────────────────
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON "_dryrun_anchor" FROM heavix_dryrun_ro;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON "_dryrun_anchor" FROM PUBLIC;

-- ── 5. Verify the grants (informational — not a security check) ──────────
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_name = '_dryrun_anchor'
ORDER BY grantee, privilege_type;
-- Expected output:
--   heavix_dryrun_ro | SELECT
--   (NO write privileges for heavix_dryrun_ro or PUBLIC)

-- ── 6. Verify the anchor row exists (informational) ──────────────────────
SELECT key, created_at, rotated_at FROM "_dryrun_anchor" WHERE key = 'server_identity';
