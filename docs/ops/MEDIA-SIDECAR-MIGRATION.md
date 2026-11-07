# Private media sidecar migration

## Purpose

Wave 3A originally stored metadata sidecars next to binaries under
`public/uploads`. Those JSON files can be served as public static assets and
must not contain uploader IDs or entity associations in a public path.

New uploads now write sidecars under `.heavix-media-metadata/`, outside
`public/`. Legacy public sidecars remain readable during rollout, while
middleware returns a non-cacheable 404 for their URLs. Attaching an existing
legacy asset writes a private copy and removes the public sidecar; deleting an
asset removes both private and legacy sidecars.

The migration utility moves metadata only. It does not move, rewrite, or delete
image/video binaries.

## Required preconditions

Do not run the apply mode during a rolling deployment or while an older
application instance can still write sidecars into `public/uploads`.

Before applying:

1. Confirm the target filesystem is the intended HEAVIX environment and is
   persistent for the duration of the migration.
2. Drain old application instances or otherwise stop legacy media writers.
3. Confirm a current, restorable backup exists for the media filesystem and
   associated database state.
4. Run the dry-run command and inspect every reported invalid path, conflict,
   and error. Apply mode must not be used while any of those remain.
5. Keep the HTTP middleware guard deployed throughout the migration.

## Commands

Dry-run is the default and performs no writes:

```sh
bun run scripts/migrate-media-sidecars-private.ts
```

Apply requires both the explicit flag and confirmation environment variable:

```sh
HEAVIX_CONFIRM_MEDIA_SIDECAR_MIGRATION=1 bun run scripts/migrate-media-sidecars-private.ts --apply
```

The utility uses exclusive copy, verifies the private copy byte-for-byte, sets
private directory/file permissions, and only then removes the public source.
Existing private metadata is accepted only when it is byte-identical to the
legacy source. Conflicts are never overwritten.

## Acceptance checks

After apply:

- the script reports zero invalid entries, conflicts, and errors;
- no valid legacy `.meta.json` remains under `public/uploads`;
- private metadata exists under `.heavix-media-metadata`;
- normal image URLs continue to work;
- sidecar URLs return non-cacheable 404;
- admin media list, attach, and delete operations pass;
- no binary files were moved or removed by this utility.

If invalid or conflicting metadata is reported, leave the source sidecar in
place (the HTTP guard still denies access) and resolve it manually. Do not
force overwrite or delete.

## Current execution status

The utility is committed as code only. It has not been run against Preview,
Production, or any user media directory. The larger move from local filesystem
media storage to Backblaze B2 remains a separate release requirement tracked
under Issue #189.
