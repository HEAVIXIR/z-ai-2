# HEAVIX Industrial Marketplace Identity & Account Standard
**Status:** Baseline contract — implementation must be additive and preview-first  
**Version:** 1.0.0  
**Date:** 2026-11-14  
**Applies to:** Registration, authentication, organizations, teams, authorization, verification, listings, RFQ, rental, auction, service workflows, admin and audit.

## 1. Design principles

1. A person has one canonical identity. One person may participate in multiple organizations and hold different organization-scoped roles.
2. Account persona, organization type, organization membership role, platform RBAC role, verification state and account status are distinct concepts. Never overload `User.role` or `User.userType` to represent all of them.
3. Public registration never grants privileged platform roles. New public accounts receive the least-privilege buyer/member baseline only.
4. Organization ownership and staff permissions are scoped to that organization. A dealer administrator is not a HEAVIX platform administrator.
5. Authorization is enforced server-side on every protected read/write; hiding UI controls is not authorization.
6. Preserve existing users, listings, sessions, taxonomy and historical records. Migrations are additive, reversible where possible, and preview-tested before Production.
7. Verification is evidence-based and progressive. A badge must represent a defined completed check, not merely a selected account type.
8. No plaintext passwords, verification codes, API keys or sensitive identity documents in logs/audit metadata.

## 2. Marketplace account personas (commercial profile)

Personas describe how the member participates in the machinery market. They are not permission roles and may be multi-select where the business genuinely has multiple activities.

| Key | Persona | Typical use |
|---|---|---|
| INDIVIDUAL | Individual / occasional owner | Buys or sells own/occasional equipment |
| DEALER | Machinery dealer / reseller | Manages stock, used/new listings and sales leads |
| MANUFACTURER | Manufacturer / OEM | Lists own products, models, authorized dealer network |
| IMPORTER_DISTRIBUTOR | Importer / distributor | Represents brands or imports equipment and parts |
| RENTAL_COMPANY | Rental / leasing fleet | Fleet availability, rental enquiries and contracts |
| AUCTION_HOUSE | Auctioneer / liquidator | Auction events, lots and bidder enquiries |
| BROKER | Broker / intermediary | Facilitates deals under disclosed mandate |
| SERVICE_PROVIDER | Service and maintenance provider | Inspection, repair, parts, transport, training and related services |
| FLEET_OPERATOR | Contractor / industrial end-user | Manages own fleet and may dispose of surplus assets |
| PUBLIC_ORGANIZATION | Public body / project owner | Procurement, tenders and institutional equipment needs |

A person can be a member of an organization with one or more business activities. Do not force an OEM or dealer into mutually exclusive buyer/seller account states: buying and selling capabilities are capabilities, not the person's identity.

## 3. Organization model

An Organization is the legal or operating business profile; a User is a human identity. One User may belong to multiple Organizations. An Organization may have multiple Users.

Organization profile fields (target contract):
- legalName, displayName, registrationNumber (country-specific), tax/VAT identifier where applicable
- organizationType / businessActivities (multi-valued controlled vocabulary)
- country, registeredAddress, operatingRegions, website, businessEmail, businessPhone
- verificationStatus, verificationLevel, verifiedAt, verifiedBy, evidence references
- public profile, logo, description, brands represented and service coverage

Membership roles are organization-scoped:
- OWNER: legal/business owner; transfer ownership and appoint administrators
- ORG_ADMIN: manage company profile, memberships and all organization workflows except ownership transfer
- SALES_MANAGER: manage assigned sales staff, inventory and enquiries
- SALES_REP: manage own/assigned listings, leads and customer conversations
- INVENTORY_MANAGER: create/update inventory and listing data, no finance or member administration
- BUYER: create/manage purchase requests and procurement enquiries
- FINANCE: view permitted billing/financial records; no listing moderation or staff role grants
- SERVICE_MANAGER / TECHNICIAN: manage service jobs within assigned scope
- VIEWER: read-only access explicitly granted by organization

Each membership must have status (INVITED, ACTIVE, SUSPENDED, REMOVED), inviter, timestamps and audit trail. Role grants must be checked against the acting member's grant authority. No self-promotion to OWNER/ORG_ADMIN.

## 4. Platform RBAC roles (HEAVIX operator staff only)

Keep platform roles separate from organization membership:
- ADMIN: platform-wide administration; tightly restricted, MFA required
- MODERATOR: content/listing moderation only
- SUPPORT: customer support with masked/minimal PII and no role grants
- TRUST_SAFETY: verification, abuse and dispute workflows
- FINANCE_OPS: platform billing/settlement permissions only
- CONTENT_EDITOR: editorial and taxonomy content permissions only
- ANALYST: approved aggregate/read-only analytics

Use the existing canonical Permission and RolePermission matrix as the permission source. Avoid broad role checks in application routes; use `requirePermission`, `can`, or equivalent centralized authorization. Every sensitive action must have a dedicated permission and audit record. Do not treat a legacy string in `User.role` as sufficient authorization.

## 5. Account state and verification

Keep these dimensions separate:
- Account lifecycle: PENDING_VERIFICATION, ACTIVE, SUSPENDED, BLOCKED, CLOSED
- Contact checks: email and phone independently VERIFIED / UNVERIFIED
- Organization verification: UNVERIFIED, SUBMITTED, IN_REVIEW, VERIFIED, REJECTED, EXPIRED
- Verification level: BASIC_CONTACT, BUSINESS_IDENTITY, BUSINESS_PLUS, PLATFORM_TRUSTED (each with documented evidence and expiry rules)
- Listing trust state: DRAFT, PENDING_REVIEW, PUBLISHED, REJECTED, SUSPENDED; not inferred solely from seller badge.

Minimum onboarding:
1. Create person identity, verify email/phone, accept terms/privacy.
2. Select commercial persona(s) and country.
3. If business workflows are selected, create or join an Organization; collect only required business profile fields.
4. Submit business evidence when applying for a verified-business badge or restricted commercial features.
5. Review evidence, record reviewer and outcome, and allow appeal/resubmission.
6. Apply capability gates by workflow: browsing and enquiries can be low-friction; bulk listings, dealer storefronts, auctions, finance and high-risk actions require stronger checks as policy dictates.

## 6. Authorization rules

- Authentication: `heavix-user` -> Session.token -> Session.userId -> User remains the canonical session chain.
- Account status and session expiry are checked on every authenticated request.
- Platform authorization: UserRole -> Role -> RolePermission -> Permission.
- Organization authorization: OrganizationMembership -> organization-scoped role/capability, always constrained by organizationId on data access.
- Resource ownership: verify the resource's organizationId / ownerId in the same query or transaction as the operation.
- Never trust organizationId, role, verification status, ownerId or permissions supplied by the browser.
- Prevent IDOR by scoping list/detail/update/delete queries to authorized organization IDs.
- Deny by default when role, permission, membership, verification or resource ownership cannot be resolved.
- High-risk platform/admin accounts require MFA before production activation; session rotation and revocation on password, status or privilege changes.

## 7. Registration and login

- Public registration may create only a normal person identity with least-privilege BUYER/member access.
- Do not accept platform roles or organization membership roles from public request bodies.
- Normalize phone numbers to E.164 with country context; normalize email case and whitespace.
- Enforce unique canonical identifiers and safe generic login errors.
- Password policy: modern adaptive hash (existing password service), robust minimum length and breached/common-password rejection; do not silently weaken existing verification.
- Rate-limit registration, login, password reset and verification resend; use CSRF/origin checks for browser mutations.
- Verification codes are cryptographically random, single-use, short-lived, hashed at rest where feasible, and never returned by production APIs.
- Login creates a canonical session only after password and account-state checks. Rotate/revoke sessions on credential reset, account suspension and privilege changes.
- Avoid leaking whether an email/mobile exists in public authentication responses.

## 8. Audit and privacy

Audit role grants/revocations, membership invitations, ownership transfer, organization verification decisions, account state changes, MFA changes, exports and sensitive data access. Record actor, target, action, timestamp, reason, correlation ID and safe before/after metadata. Never store passwords, raw session tokens, verification codes or identity-document contents in audit rows. Apply least-privilege PII visibility and retention/deletion policy.

## 9. Compatibility and implementation mapping

Current HEAVIX implementation already has:
- User + Session canonical identity and `heavix-user` cookie.
- UserRole, Role, Permission, RolePermission and centralized authorization module.
- Public registration forces legacy `User.role=BUYER` and writes canonical UserRole(BUYER).
- Current RBAC seed currently defines ADMIN, SELLER, BUYER, MODERATOR, SUPPORT.

Compatibility requirements:
- Do not remove or rename existing roles/columns in the first migration.
- Keep `User.role` as a legacy compatibility field only until all callers are migrated; canonical platform authorization must use UserRole/Permission.
- Keep `User.userType` as a legacy/basic profile field only; introduce explicit persona and organization relations additively.
- Map existing SELLER users to a dealer/seller commercial profile only after data review; never infer business verification from this mapping.
- Seed canonical roles/permissions idempotently; never auto-promote a user from a client-provided value.
- Do not run the existing `seed-user-roles.ts` blindly: it can create/promote an admin from environment credentials and bulk-assign BUYER. First reconcile its behavior with the canonical bootstrap procedure and exact Preview DB target.

## 10. Delivery sequence (Preview first)

A. Inventory: map live Preview DATABASE_URL/connection identity, schema, role catalog, memberships, registration and admin routes. Read-only first.
B. Contract tests: assert public registration cannot set ADMIN/SELLER/platform roles; assert org-scoped role cannot access platform admin; assert cross-organization IDOR denied; assert suspended/blocked users and expired sessions denied.
C. Schema: additive Organization, OrganizationMembership, UserPersona (or equivalent normalized relations), verification evidence metadata and MFA/session security metadata. Add indexes and unique constraints; preserve old rows.
D. Seeds: idempotent platform role/permission reconciliation; no credential-based implicit admin creation. Bootstrap a platform admin only via explicit, audited, one-time Preview-only operation.
E. Services/API: shared identity, organization, membership, verification and authorization services. No duplicate route-specific authorization logic.
F. UI: onboarding wizard, personal workspace, organization workspace, team/subaccount management, verification center and admin review queues.
G. Migration/backfill: dry-run counts, deterministic mappings, conflict report, backup proof, transaction and rollback plan. Never infer VERIFIED.
H. Preview acceptance: build/typecheck/security tests, browser registration/login, buyer journey, organization onboarding, invite/team scopes, listing/RFQ/rental/auction/service flows, admin RBAC, audit, mobile and weak-network checks.
I. Production: separate explicit approval after Preview acceptance. No Production DB/DNS/Worker changes under this baseline.

## 11. Acceptance criteria

- One human identity can belong to multiple organizations without duplicate accounts.
- Organization teams can safely delegate work without sharing credentials.
- Buyer, dealer, OEM, importer, rental, auction, broker, service provider and fleet workflows are represented without conflating them with security roles.
- Platform admin access is impossible through public registration or organization roles.
- Every data operation is organization-scoped and deny-by-default.
- Verification badges are backed by recorded evidence and review decisions.
- Existing user sessions, listings and historical relations remain intact after additive migration.
- All privileged actions are auditable; sensitive secrets and documents are not logged.
- Preview tests pass before any Production rollout.
