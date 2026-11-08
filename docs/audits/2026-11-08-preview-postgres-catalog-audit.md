# HEAVIX Preview PostgreSQL catalog audit — 2026-11-08

## Scope and safety

Read-only catalog inspection of the two Preview databases on branch commit
`a1d6fb2ac28421056a87fbb5feafdc0121efc65a`.

- Main Preview: `heavix-app-preview` / `db_ew8d6duermpt125paxaqorr9`
- Store Preview: `heavix-store-preview` / `db_cmtgxfrfwxw5mi77020tcnc3`
- Queries used PostgreSQL catalog and `information_schema` SELECT statements only.
- No application rows were selected or modified. No DDL, migration, backup, restore,
  secret access, deployment, DNS, or Production operation was performed.

## Catalog snapshot

| Metric | Main Preview | Store Preview |
|---|---:|---:|
| Indexes | 289 | 86 |
| Unique indexes | 194 | 49 |
| Invalid or not-ready indexes | 0 | 0 |
| Foreign-key constraints | 124 | 36 |
| Unvalidated foreign keys | 0 | 0 |
| Columns with database defaults | 357 | 95 |
| Generated columns | 0 | 0 |

### Foreign-key delete actions

| Delete action | Main Preview | Store Preview |
|---|---:|---:|
| CASCADE | 74 | 6 |
| RESTRICT | 1 | 20 |
| SET NULL | 49 | 10 |
| NO ACTION / SET DEFAULT | 0 | 0 |

All observed foreign keys are validated. The catalog query also captured each constraint's
full definition and both update/delete action codes.

## Interpretation and limitations

This is a live catalog integrity snapshot, not yet a complete Prisma-to-PostgreSQL
definition-parity proof. Earlier checks on this branch established:

- Main: 120/120 Prisma models have corresponding live tables; zero column-name,
  scalar-type, or nullability differences.
- Store: 34/34 Prisma models have corresponding live tables; zero column-name,
  scalar-type, or nullability differences.

The current catalog pass establishes that indexes are valid/ready and foreign keys are
validated. It does **not** by itself prove that every live index expression, ordering,
partial predicate, included column, collation/opclass, unique constraint, database
default expression, or FK action exactly matches the checked-in Prisma schema and its
migration history. Those definitions still require an explicit normalized comparison
against the schema/migration SQL before release approval.

## Exact-HEAD workflow validation

After the read-only audit, both required workflows completed successfully for the exact
HEAD commit `a1d6fb2ac28421056a87fbb5feafdc0121efc65a`:

- CI run [42517611939](https://github.com/HEAVIXIR/z-ai-2/actions/runs/42517611939): all executable jobs succeeded; legacy archive inventory was skipped by configuration.
- Workerd run [42517611864](https://github.com/HEAVIXIR/z-ai-2/actions/runs/42517611864): succeeded, including local Workerd request-path proof.

These CI backup/restore tests use disposable PostgreSQL databases. They are not evidence
of a completed backup of either Preview database or Production.

## Release gate

Preview remains **NO-GO for deployment** until database destination attestation,
supported runtime backup-to-Backblaze-B2 implementation, restore validation, and the
remaining full schema-definition reconciliation are complete. Vercel remains excluded
from HEAVIX infrastructure; no PR is opened while the Vercel GitHub App restriction
remains. No Production, DNS, secrets, live migration, or deployment action is authorized
by this audit.
