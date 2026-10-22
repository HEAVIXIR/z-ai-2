-- HEAVIX — STEP 15.50: Create read-only PostgreSQL role for dry-run
-- This script creates a role 'heavix_dryrun_ro' with SELECT-only privileges
-- on all tables in the public schema of the current database.
-- It is run as a CI step before the dry-run script.

-- Create the role (idempotent — drop if exists, then create)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'heavix_dryrun_ro') THEN
    DROP ROLE heavix_dryrun_ro;
  END IF;
END $$;

CREATE ROLE heavix_dryrun_ro LOGIN PASSWORD 'dryrun_ro_password';

-- Grant CONNECT on the database
GRANT CONNECT ON DATABASE heavix_test TO heavix_dryrun_ro;

-- Grant USAGE on the public schema
GRANT USAGE ON SCHEMA public TO heavix_dryrun_ro;

-- Grant SELECT on all existing tables in public schema
-- (This covers all RBAC tables: User, UserRole, Role, Permission, RolePermission, etc.)
GRANT SELECT ON ALL TABLES IN SCHEMA public TO heavix_dryrun_ro;

-- Grant SELECT on all sequences (for count queries, etc.)
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO heavix_dryrun_ro;

-- Ensure future tables also get SELECT (in case schema is re-pushed)
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO heavix_dryrun_ro;

-- Verify: the role should have NO INSERT/UPDATE/DELETE privileges
-- (We don't explicitly REVOKE because we never GRANTED them.
--  PostgreSQL roles start with no privileges except those explicitly granted.)
