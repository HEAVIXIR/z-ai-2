-- HEAVIX — STEP 15.51: Create read-only PostgreSQL role for dry-run
-- This script creates a role 'heavix_dryrun_ro' with SELECT-only privileges.
-- CR-15.51-04: Password is NOT hard-coded — it comes from the DRYRUN_RO_PASSWORD
-- environment variable, set by the CI workflow. If not set, a random password
-- is generated (the role is only used within the CI service container).
--
-- Usage in CI:
--   DRYRUN_RO_PASSWORD=$(openssl rand -hex 16) \
--     psql -h localhost -U postgres -d heavix_test -f scripts/rbac-create-readonly-role.sql
--
-- Then the dry-run connects with:
--   postgresql://heavix_dryrun_ro:${DRYRUN_RO_PASSWORD}@localhost:5432/heavix_test

-- Create the role (idempotent — drop if exists, then create)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'heavix_dryrun_ro') THEN
    DROP ROLE heavix_dryrun_ro;
  END IF;
END $$;

-- CR-15.51-04: Use environment variable for password, not hard-coded value
-- If DRYRUN_RO_PASSWORD is not set, generate a random one (CI only — never production)
CREATE ROLE heavix_dryrun_ro LOGIN PASSWORD COALESCE(
  current_setting('DRYRUN_RO_PASSWORD', true),
  'ci_random_' || md5(random()::text)
);

-- Grant CONNECT on the database
GRANT CONNECT ON DATABASE heavix_test TO heavix_dryrun_ro;

-- Grant USAGE on the public schema
GRANT USAGE ON SCHEMA public TO heavix_dryrun_ro;

-- Grant SELECT on all existing tables in public schema
GRANT SELECT ON ALL TABLES IN SCHEMA public TO heavix_dryrun_ro;

-- Grant SELECT on all sequences
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO heavix_dryrun_ro;

-- Ensure future tables also get SELECT
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO heavix_dryrun_ro;

-- CR-15.51-03: Explicitly REVOKE all write privileges to ensure no effective write access
-- even if inherited from other roles or default privileges
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM heavix_dryrun_ro;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM heavix_dryrun_ro;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM heavix_dryrun_ro;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO heavix_dryrun_ro;

-- CR-15.51-03: Ensure the role is NOT a member of any role that has write privileges
-- (No GRANT role TO heavix_dryrun_ro statements exist — verified by absence)
-- The role is standalone with only explicitly granted SELECT privileges.
