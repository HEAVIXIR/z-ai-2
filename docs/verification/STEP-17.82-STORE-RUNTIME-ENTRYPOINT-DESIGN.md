# HEAVIX — STEP 17.82 Runtime Entry-Point Design

Status: isolated implementation recorded on `feature/prisma7-runtime-contract-proof`. CI run #11 passed Node and Worker full-application typechecks plus the static runtime source-graph isolation check. Produced-bundle inspection and the broader acceptance gates remain open.

## Findings from the current branch

- `src/lib/store-db.ts` imports both `@/lib/generated/store-node-client` and `@/lib/generated/store-client/client`, then exports `NodeStorePrismaClient | WorkerStorePrismaClient`.
- The current `tsconfig.json` has one `@/* -> ./src/*` path map and one `tsc --noEmit` typecheck.
- `vitest.config.ts` aliases only `@` to `src`; it currently has no explicit Store runtime selection.
- `next.config.ts` has no runtime-specific alias or alternate TypeScript config selection.
- `src/lib/store-audit-outbox.ts` types its transaction argument from the Cloudflare-generated client even though its callers are shared service code. This is an independent coupling point that must be corrected before a Node Store entry point can be considered valid.
- Current consumers use a broad range of model delegates and include shapes; a handful of model fixtures cannot justify changing the shared runtime entry point.

## Implemented target layout

1. `src/lib/store-db.node.ts`
   - Imports only the Node-generated Store client and `PrismaPg`.
   - Owns only the Node Store singleton.
   - Exports a concrete Node client, never a Node/Worker union.

2. `src/lib/store-db.worker.ts`
   - Imports only the Cloudflare-generated Store client and `PrismaPg`.
   - Owns only the Worker Store singleton.
   - Exports a concrete Worker client, never a Node/Worker union.

3. Consumer-facing import remains `@/lib/store-db`, resolved by the active build/typecheck target:
   - Node TypeScript config maps it to `src/lib/store-db.node.ts`.
   - Worker TypeScript config maps it to `src/lib/store-db.worker.ts`.
   - Vitest Node config maps it to the Node entry point.
   - `scripts/verify-store-runtime-graph.mjs` resolves runtime imports under both tsconfigs and rejects the opposite generated client entrypoint.
   - Next/OpenNext build config must select the matching alias and matching TypeScript config for the target. Both the Webpack and Turbopack resolution paths must be accounted for; a webpack-only alias is not sufficient evidence for an OpenNext/Turbopack build.

4. CI runs two independent strict typechecks (Node and Worker) over the same application call sites. The ordinary project typecheck must not silently validate only one target.

5. Shared transaction helpers must depend on the smallest verified operation contract they actually consume, rather than importing one runtime's generated `PrismaClient` type. In particular, `enqueueAuditOutbox` only needs a transaction-scoped `auditOutbox.create` capability with the selected `id` result. Its contract must be checked against both generated runtimes without `any`, casts, or suppressions.

## Required acceptance evidence before removing the union

- Every actual `storeDb` consumer compiles under the Node config.
- The same complete consumer set compiles under the Worker config.
- Every callback transaction call site compiles under both targets, including outbox writes.
- Node test/runtime graph contains no Worker-generated client/WASM import.
- Worker/OpenNext graph contains no Node-generated Store client.
- Vitest runs against the Node entry point and transaction integration tests remain green.
- OpenNext Cloudflare build, Docker build, Store behavioral tests, outbox/audit tests, TLS proof, and all required CI gates pass.
- Runtime selection is verified from produced module graphs/build artifacts, not inferred only from environment variables or typechecks. The current source-graph check is an intermediate proof; a produced-bundle inspection is still required.

## Safety boundary

No changes to `main`, Preview, Production, database schemas/data, secrets, or deployments are part of this step. PR #169 remains a Draft proof branch. The target design is not approval to merge or deploy.
