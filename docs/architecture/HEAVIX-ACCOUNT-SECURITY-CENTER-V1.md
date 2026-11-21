# HEAVIX Account & Security Center — V1

**Status:** Implemented on the selected integration branch; runtime verification pending  
**Scope:** Every authenticated HEAVIX account, independent of marketplace persona, organization membership role, or platform RBAC role.

## Product contract

The shared route `/account/security` is the single self-service location for:

- Current email and its independent verification state
- Email change, requiring the current password and a six-digit OTP sent to the proposed address
- Current mobile and its independent verification state
- Password change, requiring the current password and a new password of 8–128 characters
- A clear status that mobile changes remain unavailable until an SMS OTP adapter is configured

The user dashboard navigation and Admin top bar both link to this shared route. Authorization is based on the canonical user session, not a marketplace persona or organization role.

## Security invariants

1. Every mutation is authenticated and protected by the existing fail-closed CSRF check.
2. Password and email changes require re-authentication with the current password.
3. Email changes do not replace the current address until the new address has been verified.
4. Email-change codes are random six-digit values, expire after ten minutes, are bcrypt-hashed, rate-limited, and consumed atomically once.
5. The pending email address is carried in a versioned `ACV1` envelope in the existing `VerificationCode.code` field for records of type `EMAIL_CHANGE`. The OTP itself is stored only as a bcrypt hash inside that envelope. This is a compatibility measure to avoid a schema migration in this workstream; do not interpret these rows as ordinary `EMAIL` challenges.
6. Successful password or email changes revoke all existing sessions and issue a fresh session to the current browser.
7. Credential rotation invalidates outstanding password-reset and account-contact-change challenges.
8. Audit events record action and security outcomes, never passwords, OTP values, or actual contact values.
9. The mobile-change API is fail-closed: until an approved SMS delivery and verification adapter exists, it returns `503 SMS_VERIFICATION_NOT_CONFIGURED` and does not write the proposed number or change verification status.

## API surface

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/account/identity` | Self-scoped contact and identity status |
| POST | `/api/account/password` | Change password and rotate sessions |
| POST | `/api/account/email-change/request` | Re-authenticate and send OTP to new email |
| POST | `/api/account/email-change/verify` | Verify OTP and atomically replace email |
| POST | `/api/account/mobile-change` | Explicitly gated until SMS verification is available |

## Data and infrastructure constraints

- Reuses the existing `User`, `Session`, `VerificationCode`, bcrypt password helper, email transport, CSRF helper, rate limiter, and audit log.
- No Prisma model or schema change was introduced.
- No migration, seed, database write, paid provider, or SMS provider was run or enabled.
- Existing email delivery configuration is reused; no new external service was added.

## Verification status

A source-level security contract test was added at `tests/security/account-security-contract.test.ts`. It has not been executed in this workstream. Build, runtime, email-delivery, and SMS-delivery verification remain pending and must be performed only under the project's free-infrastructure and preview-only operating constraints.
