type ParsedDatabaseUrl = {
  host: string;
  port: string;
  user: string;
  database: string;
  password: string;
  sslmode: string;
};

function decodePart(value: string, label: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new Error(\`\${label} database URL is invalid\`);
  }
}

function parseDatabaseUrl(raw: string | undefined, label: string): ParsedDatabaseUrl {
  if (!raw) throw new Error(\`\${label} database URL is not configured\`);

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(\`\${label} database URL is invalid\`);
  }

  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error(\`\${label} database URL must use PostgreSQL\`);
  }

  const host = url.hostname;
  const port = url.port || "5432";
  const user = decodePart(url.username, label);
  const password = decodePart(url.password, label);
  const database = decodePart(url.pathname.replace(/^\/+/, ""), label);
  const sslmode = url.searchParams.get("sslmode") || "prefer";

  if (!host || !user || !password || !database) {
    throw new Error(\`\${label} database URL is missing required connection fields\`);
  }

  if (!["disable", "allow", "prefer", "require", "verify-ca", "verify-full"].includes(sslmode)) {
    throw new Error(\`\${label} database URL has an unsupported SSL mode\`);
  }

  return { host, port, user, database, password, sslmode };
}

/**
 * Translate the Main direct URL and Store URL into pg_dump environment variables.
 * Main deliberately uses DIRECT_URL, never the potentially pooled DATABASE_URL.
 * Error messages deliberately never include raw URLs or credentials.
 */
export function buildBackupEnvironment(
  env: { DIRECT_URL?: string; DATABASE_URL?: string; STORE_DATABASE_URL?: string },
): Record<string, string> {
  const main = parseDatabaseUrl(env.DIRECT_URL, "Main direct");
  const store = parseDatabaseUrl(env.STORE_DATABASE_URL, "Store");

  return {
    DB_HOST: main.host,
    DB_PORT: main.port,
    DB_USER: main.user,
    DB_NAME: main.database,
    DB_PASSWORD: main.password,
    DB_SSLMODE: main.sslmode,
    STORE_DB_HOST: store.host,
    STORE_DB_PORT: store.port,
    STORE_DB_USER: store.user,
    STORE_DB_NAME: store.database,
    STORE_DB_PASSWORD: store.password,
    STORE_DB_SSLMODE: store.sslmode,
  };
}
