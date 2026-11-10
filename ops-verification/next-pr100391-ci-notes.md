# Next.js PR #100391 CI investigation notes

## Run 1 — 42799345279

- Bash syntax checks passed.
- ShellCheck stopped the job on four SC1007 warnings caused by empty environment assignments in the no-database Workerd invocation.
- The Next source build and HEAVIX verification were skipped; no compilation or deployment ran.

## Run 2 — 42799418565

- Bash syntax checks passed.
- ShellCheck passed after changing empty values to explicit `VAR=''` assignments.
- The final tool-version check then stopped because pnpm correctly refused to run inside the HEAVIX checkout, whose package manager is Bun.
- The check is now executed from `RUNNER_TEMP`, outside the Bun-managed project. The Next source build and HEAVIX verification have still not run.

Both failures were preflight-only. No database connection, Worker upload, deployment, migration, seed, or Production access occurred.
