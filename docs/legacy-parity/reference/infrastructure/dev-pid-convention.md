# Legacy reference record: `.zscripts/dev.pid`

- **Disposition:** `PRESERVE_AS_REFERENCE`
- **Source repository:** [HEAVIXIR/z](https://github.com/HEAVIXIR/z)
- **Pinned source tree:** `217f98ecc800aa64ae4739d27ed2aeb95dd260ed`
- **Legacy member path:** `.zscripts/dev.pid`
- **Expected archive family:** `.zscripts.zip` (**unverified; inferred from path prefix only**)
- **Target location:** `docs/legacy-parity/reference/` (documentation-only; not a runtime path)
- **Content status:** **NOT EXTRACTED / NOT HASH-VERIFIED**. This record is provenance metadata, not a copy of the legacy file.
- **Member SHA-256:** unavailable until exact member bytes can be retrieved and verified.

## Reason for preservation

Runtime PID marker is host/session state, not portable application source. Preserve only the convention and rationale; never copy a stale PID value into the target.

## Required follow-up

1. Verify that the exact member exists in the pinned source archive.
2. Retrieve the member without opening unrelated archive contents.
3. Compute and record SHA-256 for the extracted bytes.
4. Run a secret/sensitive-data review before committing the source content.
5. Compare with current target implementation and update this disposition if evidence changes.

No code, database mutation, seed execution, production deployment, or runtime behavior is introduced by this record.
