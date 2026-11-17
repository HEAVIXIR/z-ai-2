# HEAVIX Core Infrastructure

**Status:** canonical architecture definition  
**Last verified:** 2026-11-07  
**Repository:** HEAVIXIR/z-ai-2

This document records the infrastructure boundary defined by the HEAVIX project owner. It is the reference for architecture discussions, operational checklists, incident reports, and release decisions.

## The four core infrastructure systems

| System | Canonical responsibility | Required operational proof |
|---|---|---|
| **GitHub** | Source of truth: repository, branches, pull requests, review history, Actions CI, release provenance, operational documentation | Exact commit SHA, branch/base relationship, exact-head CI, review state, release artifact provenance |
| **Cloudflare** | Edge/runtime delivery, Workers, public Preview endpoint, network/security controls, DNS and custom-domain routing where the zone is managed there | Worker script/version/deployment, traffic allocation, subdomain/route, bindings by name/type, secret destination proof without exposing values, security configuration |
| **Prisma** | Prisma ORM, schema/client generation, migrations, and HEAVIX PostgreSQL projects/databases where Prisma Postgres is the provider | Exact database identity, environment isolation, schema/migration state, transaction behavior, connection mode, backup/restore availability |
| **Backblaze B2** | Independent object storage for encrypted backups, archives, and recovery artifacts | Bucket and key scope, object lifecycle/retention, encryption and key custody, checksum verification, successful restore drill |

These systems are independent. Passing GitHub CI does not prove that a Cloudflare Worker is deployed. A Worker binding name does not prove the secret's destination. Prisma schema validity does not prove that a migration is safe for Production. A successful B2 upload does not prove that a database can be restored.

## Explicitly outside the core infrastructure

**Vercel is a peripheral Preview convenience only.** It is not a HEAVIX infrastructure dependency, not the source of truth, and not a release-readiness gate. Vercel rate limits, build statuses, or Preview failures must not be reported as failures of HEAVIX's core infrastructure. Use it only when the project owner specifically requests a Vercel Preview task.

## Environment and release boundaries

1. GitHub main is the source-of-truth branch. A Draft PR is not integrated, even if its branch-specific CI is green.
2. Keep Preview publicly accessible through its single canonical endpoint when requested. Protect version-specific Preview surfaces separately; do not disable the canonical public Preview merely to hide historical versions.
3. Never infer a secret's value or destination from a binding name. Verify database identity through the actual runtime connection path without logging credentials.
4. No Production database query, write, seed, migration, restore, or destructive operation is permitted until the exact target identity and operation scope are proven and explicitly authorized.
5. A successful schema/client build is not evidence that a migration has been applied. A successful backup job is not evidence of recoverability until a restore has been verified.
6. Backblaze B2 is the independent archive/object-storage provider. Cloudflare R2 is not a substitute and is not required by this architecture.
7. Keep PRs Draft during implementation and verification. Do not merge or deploy without explicit release approval.

## Operational review sequence

### 1. GitHub
- Confirm exact main SHA and branch ancestry.
- Review PR changed files and base/head relationship.
- Check exact-head Actions jobs, tests, typecheck, build, and security proofs.
- Confirm whether a workflow is scheduled, manual-only, or gated by repository secrets.
- Verify release provenance before any upload/deployment.

### 2. Cloudflare
- Confirm the canonical public Worker and current traffic deployment.
- Check workers.dev state, custom-domain routes, and DNS zone ownership separately.
- Inspect binding names/types without retrieving secret values.
- Prove Preview and Production secret destinations independently.
- Review Access, version Preview URLs, and account security controls.
- Do not change DNS, traffic allocation, secrets, or deployments during a read-only audit.

### 3. Prisma
- Inventory projects, branches, and databases without reading connection-string values.
- Apply environment identity checks in the real database factory used by the Worker, not only in test harnesses.
- Keep Preview and Production databases isolated.
- Review transactions and migration state; do not execute migrations against Production during an audit.
- Verify provider-managed backup availability and distinguish it from the independent B2 archive.

### 4. Backblaze B2
- Verify least-privilege application-key scope and bucket destination.
- Encrypt before upload; never place plaintext dumps or private keys in GitHub artifacts.
- Verify object size and cryptographic checksum after upload.
- Enforce retention and protect recovery keys separately.
- Perform a restore into a disposable, identity-verified Preview target and validate schema/data consistency.
- A smoke-test upload/download/delete is not a retained backup or a restore drill.

## Current verified snapshot

See [Preview secret destination proof runbook](../operations/preview-secret-destination-proof-runbook.md) for timestamped evidence and outstanding gates. As of 2026-11-07:
- Canonical Cloudflare workers.dev Preview is enabled; version-specific Preview URLs have been disabled while preserving the canonical endpoint.
- The Cloudflare account inventory did not expose a heavix.ir zone or custom Worker route.
- Cloudflare D1 inventory was empty and R2 was not enabled.
- Prisma returned three Ready PostgreSQL databases, but no automated backup objects were returned for them.
- The integrated encrypted Backblaze B2 database archive and restore remains unproven.
- Cloudflare runtime integration files are absent from main and remain in an unmerged Draft PR dependency chain; current Worker version provenance from main is not established.

This snapshot is evidence, not a claim of completion. Update it only from new verified results.
