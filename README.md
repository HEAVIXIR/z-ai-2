# R45 GitHub Remediation Package

Target: `https://github.com/HEAVIXIR/z-ai-2`
Verified GitHub baseline: `03c7f7e110d32616b6271e17bbc2e812c25d5348`

## GitHub access result

The connected GitHub integration is read-only. Branch creation returned HTTP 403:

`Resource not accessible by integration`

Therefore this assistant did **not** mutate GitHub, create a branch, push, merge, reset, or alter the database.

## Included remediation

- Canonical `heavix-user -> Session -> User` authentication.
- Remove runtime `AdminSession` authentication.
- Remove admin username/password login path.
- Remove synthetic `ADMIN` identity and sentinel authorization bypass.
- Fail closed on RBAC lookup errors.
- Make admin middleware use `heavix-user`.
- Remove `User.role` fallback from AI authorization.
- Migrate seller registration to canonical `UserRole(SELLER)`.
- Add a static R45 regression contract.

## Important

`AdminSession` and `User.role` are **not deleted from Prisma schema** by this package. That requires a separate data/schema migration after a zero-consumer audit and DB gate.

## Apply

From a clean clone:

```bash
git fetch origin
git checkout -b security/r45-canonical-auth-hardening origin/main
python3 R45-GitHub-Remediation/apply_r45_remediation.py
python3 R45-GitHub-Remediation/verify_r45_remediation.py
git diff --check
```

Then run the project's actual scripts from `package.json`:

```bash
bun run typecheck
bun run lint
bun run test
bun run build
```

If script names differ, inspect `package.json`.

Do not merge until the complete diff is reviewed and CI passes. Do not run Prisma migration/seed as part of this remediation.
