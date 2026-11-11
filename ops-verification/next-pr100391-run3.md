# Run 3 — Next.js PR #100391 experiment

- Bash syntax validation passed.
- ShellCheck passed.
- Toolchain checks passed: Node.js, pnpm 10.33.0, Rust/Cargo 1.99.1, Bun 1.4.4.
- Next.js v16.4.5 tag checkout and exact source patch application passed.
- The build stopped before compilation because `tsx` was not installed in the freshly cloned Next.js workspace. The upstream `pack-next.ts` script itself runs `pnpm i`, but its launcher (`tsx`) must already be installed.
- The builder now performs `pnpm install --frozen-lockfile` before invoking the official `pnpm pack-next --tar --compress=strip` pipeline.

No HEAVIX build, DB access, Worker upload, or Production action occurred in this run.
