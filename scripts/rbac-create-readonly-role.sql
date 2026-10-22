-- HEAVIX — STEP 15.51: Create read-only PostgreSQL role for dry-run
-- CR-15.51-04: Password is passed as a psql variable, NOT hard-coded.
--
-- Usage in CI:
--   psql -h localhost -U postgres -d heavix_test \
--     -v dryrun_password="$DRYUN_RO_PW" \
--     -f scripts/rbac-create-readonly-role.sql

-- Create the role (idempotent — drop if exists, then create)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'heavix_dryrun_ro') THEN
    DROP ROLE heavix_dryrun_ro;
  END IF;
END $$;

-- CR-15.51-04: Password from psql variable :dryrun_password
-- If the variable is not provided, generate a random one
CREATE ROLE heavix_dryrun_ro LOGIN PASSWORD COALESCE(
  :'dryrun_password',
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

-- CR-15.51-03: Explicitly REVOKE all write privileges
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM heavix_dryrun_ro;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM heavix_dryrun_ro;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO heavix_dryrun_ro;
