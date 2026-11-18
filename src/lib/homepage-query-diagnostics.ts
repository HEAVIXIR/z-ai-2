const SAFE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const SAFE_QUALIFIED_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_.]{0,95}$/;
const SAFE_QUERY_NAME = /^[a-z0-9][a-z0-9_.-]{0,79}$/;
const SAFE_PRISMA_CODE = /^P\\d{4}$/;
const SAFE_META_CODE = /^[A-Z0-9_]{1,16}$/;

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" ? value as UnknownRecord : null;
}

function safeString(value: unknown, pattern: RegExp): string | undefined {
  return typeof value === "string" && pattern.test(value) ? value : undefined;
}

function classifyErrorMessage(value: unknown): string {
  if (typeof value !== "string") return "unclassified";
  const message = value.toLowerCase();
  if (/does not exist|undefined table|unknown column|no such table/.test(message)) return "schema-object-missing";
  if (/unknown argument|invalid .* invocation|argument .* is missing/.test(message)) return "query-validation";
  if (/timed out|timeout|could not connect|can't reach database|connection.*closed/.test(message)) return "connection-or-timeout";
  return "unclassified";
}

/** Extract only allowlisted, non-secret Prisma diagnostics. */
export function sanitizeHomepageQueryError(queryName: string, error: unknown) {
  const record = asRecord(error);
  const meta = asRecord(record?.meta);
  const errorName = safeString(record?.name, /^[A-Za-z][A-Za-z0-9_$]{0,79}$/) ?? "UnknownError";
  const prismaCode = safeString(record?.code, SAFE_PRISMA_CODE);
  const databaseCode = safeString(meta?.code, SAFE_META_CODE);
  const model = safeString(meta?.modelName ?? meta?.model_name, SAFE_IDENTIFIER);
  const field = safeString(meta?.field_name ?? meta?.fieldName, SAFE_IDENTIFIER);
  const column = safeString(meta?.column ?? meta?.column_name, SAFE_IDENTIFIER);
  const table = safeString(meta?.table ?? meta?.table_name, SAFE_QUALIFIED_IDENTIFIER);
  const rawTarget = meta?.target;
  const target = Array.isArray(rawTarget)
    ? rawTarget.map((item) => safeString(item, SAFE_IDENTIFIER)).filter((item): item is string => Boolean(item)).slice(0, 8)
    : typeof rawTarget === "string"
      ? rawTarget.split(",").map((item) => safeString(item.trim(), SAFE_IDENTIFIER)).filter((item): item is string => Boolean(item)).slice(0, 8)
      : undefined;

  return {
    query: safeString(queryName, SAFE_QUERY_NAME) ?? "homepage.unknown",
    errorName,
    classification: classifyErrorMessage(record?.message),
    ...(prismaCode ? { prismaCode } : {}),
    ...(databaseCode ? { databaseCode } : {}),
    ...(model ? { model } : {}),
    ...(field ? { field } : {}),
    ...(column ? { column } : {}),
    ...(table ? { table } : {}),
    ...(target && target.length ? { target } : {}),
  };
}

/** Run one homepage data read and emit a privacy-safe diagnostic on failure. */
export async function withHomepageQueryDiagnostics<T>(
  queryName: string,
  operation: () => T | PromiseLike<T>,
): Promise<Awaited<T>> {
  try {
    return await operation();
  } catch (error) {
    console.error("[homepage-db-query-failed]", sanitizeHomepageQueryError(queryName, error));
    throw error;
  }
}
