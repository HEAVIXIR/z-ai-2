# HEAVIX owner account setup

The repository does not use a default admin username/password. Public registration intentionally creates BUYER accounts only. Do not hardcode an admin password or use a bypass endpoint.

## 1. Create and verify the account

1. Open the deployed HEAVIX registration page.
2. Register with the owner email `heavixir@gmail.com`, a mobile number you control, and a strong unique password.
3. Complete both email and mobile verification until the account is `ACTIVE`.
4. Do not send passwords, verification codes, or database connection strings to anyone in chat.

## 2. Confirm the database target

Run the reviewed command from a trusted operator environment with the intended `DATABASE_URL` already loaded securely. The command compares the hostname and database name parsed from `DATABASE_URL` against values you type explicitly. It does not print the connection string.

**You must explicitly attest to the target environment after independently verifying the database target.** The script cannot reliably infer whether an arbitrary database hostname is production from `DATABASE_URL` alone, so it refuses to run without `HEAVIX_OWNER_TARGET_ENV_CONFIRM`.

First perform a dry run (do not set `HEAVIX_OWNER_PROMOTION_EXECUTE`):

```sh
HEAVIX_OWNER_PROMOTION_CONFIRM_EMAIL=heavixir@gmail.com \
HEAVIX_OWNER_DB_HOST_CONFIRM='EXACT_DB_HOST' \
HEAVIX_OWNER_DB_NAME_CONFIRM='EXACT_DB_NAME' \
HEAVIX_OWNER_TARGET_ENV_CONFIRM=non-production \
bun run admin:promote-owner
```

For a production target, set `HEAVIX_OWNER_TARGET_ENV_CONFIRM=production` and additionally set:

```sh
HEAVIX_OWNER_PROMOTION_ALLOW_PRODUCTION=YES
HEAVIX_OWNER_PROMOTION_CONFIRM_PRODUCTION='HEAVIXIR/z-ai-2:main:heavixir@gmail.com'
```

The command rejects a missing/invalid environment confirmation, rejects labeling `NODE_ENV=production` as non-production, and rejects production confirmation flags paired with a non-production declaration.

Only after reviewing the dry-run output and independently confirming the exact DB target, rerun the same command with `HEAVIX_OWNER_PROMOTION_EXECUTE=YES`. This command does not create accounts or change passwords; it only promotes an existing, active, email-verified and mobile-verified account. It refuses if the account or canonical ADMIN role is missing. The RBAC seed must be reviewed and run separately if the role catalog is absent.

## Safety properties

- No public admin-bootstrap API or shared bootstrap secret.
- No hardcoded credentials, password reset, or account creation.
- Requires exact owner email and explicit DB host/database confirmation.
- Requires explicit target-environment attestation; production requires two additional repository-specific confirmations.
- Dry-run is the default; execution requires a separate affirmative flag.
- Writes canonical `UserRole(ADMIN)` and legacy `User.role=ADMIN` in one transaction, then verifies the role assignment.
