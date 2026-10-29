# Legacy environment file — redacted structure

- **Source path:** `.env`
- **Source archive:** `bun.zip` (per the pinned archive disposition)
- **Source commit:** `217f98ecc800aa64ae4739d27ed2aeb95dd260ed`
- **Classification:** SECRET / SAFE_ARCHIVE
- **Recorded size:** 50 bytes
- **Disposition:** Do not copy the original file or any value into Git.

The audit records a development database URL, not a production credential. Its value is not reproduced here. The only retained representation is a shape placeholder:

```dotenv
DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<dbname>?schema=<schema>
```

This is a redacted format illustration, not a usable connection string. It must not be placed in an active `.env` file. Use reviewed variable names and non-secret examples in `.env.example` only.

If evidence later shows this development credential was deployed to a reachable environment, rotate the affected password. This record alone is not evidence of exposure or of a production credential.
