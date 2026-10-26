type ParsedDatabaseUrl = {
  host: string;
  port: string;
  user: string;
  database: string;
  password: string;
};

function decodePart(value: string, label: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new Error(`${label} database URL is invalid`);
  }
}

function parseDatabaseUrl(raw: string | undefined, label: string): ParsedDatabaseUrl {
  if (!raw) throw new Error(`${label} database URL is not configured`);

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${label} database URL is invalid`);
  }

  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error(`${label} database URL must use PostgreSQL`);
  }

  const host = url.hostname;
  const port = url.port || "5432";
  const user = decodePart(url.username, label);
  const password = decodePart(url.password, label);
  const database = decodePart(url.pathname.replace(/^\/+/, ""), label);

  if (!host || !user || !password || !database) {
    throw new Error(`${label} database URL is missing required connection fields`);
  }

  return { host, port, user, database, password };
}

/**
 * Translate canonical Prisma URLs into pg_dump environment variables.
 * Error messages deliberately never include raw URLs or credentials.
 */
export function buildBackupEnvironment(
  env: Pick<NodeJS.ProcessEnv, "DATABASE_URL" | "STORE_DATABASE_URL">,
): NodeJS.ProcessEnv {
  const main = parseDatabaseUrl(env.DATABASE_URL, "Main");
  const store = parseDatabaseUrl(env.STORE_DATABASE_URL, "Store");

  return {
    DB_HOST: main.host,
    DB_PORT: main.port,
    DB_USER: main.user,
    DB_NAME: main.database,
    DB_PASSWORD: main.password,
    STORE_DB_HOST: store.host,
    STORE_DB_PORT: store.port,
    STORE_DB_USER: store.user,
    STORE_DB_NAME: store.database,
    STORE_DB_PASSWORD: store.password,
  };
}
