# HEAVIX Auth Crypto Worker (isolated spike)

This Worker is a standalone proof of concept for moving the existing bcrypt cost-10 work out of the OpenNext application Worker.

## Security and scope

- Exports a Durable Object class with only two RPC methods: `hashPassword` and `verifyPassword`.
- The default Worker HTTP handler always returns 404. There is no public password API.
- The object performs no storage reads/writes, migrations of user data, alarms, DB access, or external fetches.
- Passwords and hashes are never logged or persisted.
- One active bcrypt operation is allowed per object instance; excess concurrent calls fail closed with `AUTH_CRYPTO_BUSY`.
- Input is bounded to 1 KiB UTF-8. Existing application validation remains authoritative.
- Hash output remains bcrypt cost 10. Existing cost-10 bcrypt hashes are accepted without rehashing.
- No fallback to bcrypt on the main application Worker is provided by this service.

## Local checks

From the repository root:

```sh
bun test tests/unit/auth-crypto-worker.test.ts
```

The isolated Worker config is `workers/auth-crypto/wrangler.jsonc`. It has no routes, custom domains, vars, secrets, DB bindings, or public Workers.dev URL. Do not deploy until account Free-plan status, Durable Object SQLite support, quota behavior, and the Preview-only target have been independently verified.

## Important deployment note

The `new_sqlite_classes` migration declares the DO class. It does not migrate or seed application data. The class intentionally makes no storage calls. The application Worker is not yet bound to this service; this spike must pass local tests and a separately authorized Free-plan Preview deployment before integration.
