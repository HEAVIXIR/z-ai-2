# Legacy archive inventory (read-only)

- Source: https://github.com/HEAVIXIR/z (default branch main)
- Target: this checked-out HEAVIXIR/z-ai-2 commit
- This workflow does not copy, modify, delete, or deploy files.
- Archives inspected: 13
- File entries inspected: 1715
- New paths absent from target: 86
- Identical files already present: 990
- Existing-path content conflicts: 639
- Paths duplicated across source archives with differing content (row count): 0
- Entries requiring sensitive/data review: 22
- Unsafe archive paths skipped: 0
- Archives with extraction/read errors: 0

## Required decision before import

Import only after reviewing the manifest, excluding secrets, database dumps, generated artifacts, stale migrations, and files that conflict with the current canonical schema/auth/provider architecture. New files are candidates, not automatic approvals.
