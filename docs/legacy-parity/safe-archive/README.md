# Safe archive register

This directory preserves the provenance and safe metadata for 18 legacy paths that must not be committed with their original payloads.

- **Pinned source:** `HEAVIXIR/z` at `217f98ecc800aa64ae4739d27ed2aeb95dd260ed`
- **Archive-entry scan:** CI run [40487144945](https://github.com/HEAVIXIR/z-ai-2/actions/runs/40487144945)
- **Disposition source:** `docs/legacy-parity/VALUE-BASED-DISPOSITION-2026-10-27.md`, §3.S.2 and §6
- **Inventory scope:** 1 environment file, 8 SQLite database snapshots, 5 unverified JPG uploads, 3 patch/migration ZIPs, and 1 workspace TAR.

## Safety rules

1. Never commit original `.env`, `.db`, `.jpg`, `.zip`, or `.tar` payloads from the legacy archive.
2. Never print or copy credential values. The environment file is represented only by a redacted shape.
3. Database files are opaque data snapshots; do not open, restore, or migrate them as part of this documentation work.
4. Patch and workspace archives are untrusted. Do not extract or execute them as an implementation shortcut.
5. The source archive commit is pinned for provenance. Member-level SHA-256 values are intentionally not asserted here unless independently recorded in a cited evidence artifact; do not infer them from file sizes or Git blob IDs.
6. This inventory is not authorization to deploy, restore data, or apply historical migrations. Production remains NO-GO pending the current release gates.

## Inventory documents

- [Redacted environment structure](./dotenv-structure.md)
- [Database snapshot inventory](./db-snapshots-inventory.md)
- [Unverified upload inventory](./unverified-uploads-inventory.md)
- [Patch and migration archive inventory](./patch-archives-inventory.md)
- [Workspace artifact inventory](./workspace-artifacts-inventory.md)
