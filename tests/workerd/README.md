# HEAVIX Prisma Workerd Runtime Proof

This is a local-only Worker harness. It does not use the deployed
`heavix-preview` Worker, the OpenNext production entrypoint, or Cloudflare
production secrets. The runner starts Wrangler locally; Wrangler executes the
test Worker in its Miniflare/workerd runtime.

Required environment:
- `HEAVIX_RUNTIME_PROOF_TARGET=PREVIEW_ONLY`
- `HEAVIX_APP_PREVIEW_PPG_URL`: dedicated App Preview PPG connection string
- `HEAVIX_STORE_PREVIEW_PPG_URL`: dedicated Store Preview PPG connection string

The runner refuses missing or identical inputs and never prints credentials.
It creates a mode-0600 temporary `.dev.vars` file in an ignored temporary
configuration directory and removes that directory on exit.

Run after installing dependencies and generating both Worker clients:

```sh
bun install --frozen-lockfile
bunx prisma generate --schema=prisma/schema.prisma
bunx prisma generate --schema=prisma/store/schema.prisma
bun run test:workerd
```

The proof uses read-only SQL only. It checks exact Preview migration
fingerprints, PostgreSQL 17/public schema, per-request client reuse,
sequential/concurrent request isolation, read-only transactions, and
missing-secret fail-closed behavior. It performs no schema changes, seeds,
business-row reads, or writes.

A successful local proof does not establish which databases the deployed
Cloudflare secrets target and does not authorize deployment.
