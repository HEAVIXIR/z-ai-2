const SAFE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const SAFE_QUALIFIED_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_.]{0,95}$/;
const SAFE_QUERY_NAME = /^[a-z0-9][a-z0-9_.-]{0,79}$/;
const SAFE_PRISMA_CODE = /^P\d{4}$/;
const SAFE_META_CODE = /^[A-Z0-9_]{1,16}$/;
const SAFE_PROPERTY_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,39}$/;
const SENSITIVE_PROPERTY_NAME = /(password|secret|token|url|sql|query|body|header|param|connection|credential)/i;

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" ? value as UnknownRecord : null;
}

function safeString(value: unknown, pattern: RegExp): string | undefined {
  return typeof value === "string" && pattern.test(value) ? value : undefined;
}

function safePropertyNames(record: UnknownRecord | null): string[] {
  if (!record) return [];
  return Object.keys(record)
    .filter((key) => SAFE_PROPERTY_NAME.test(key) && !SENSITIVE_PROPERTY_NAME.test(key))
    .slice(0, 20);
}

function safeConstructorName(value: unknown): string | undefined {
  if (value === null || (typeof value !== "object" && typeof value !== "function")) return undefined;
  const constructor = (value as { constructor?: unknown }).constructor;
  const name = typeof constructor === "function"
    ? (constructor as { name?: unknown }).name
    : undefined;
  return safeString(name, /^[A-Za-z][A-Za-z0-9_$]{0,79}$/);
}

function classifyErrorMessage(value: unknown): string {
  if (typeof value !== "string") return "unclassified";
  const message = value.toLowerCase();
  if (/does not exist|undefined table|unknown column|no such table/.test(message)) return "schema-object-missing";
  if (/unknown argument|invalid .* invocation|argument .* is missing/.test(message)) return "query-validation";
  if (/timed out|timeout|could not connect|can't reach database|connection.*closed/.test(message)) return "connection-or-timeout";
  return "unclassified";
}

function firstRecord(...values: unknown[]): UnknownRecord | null {
  for (const value of values) {
    const record = asRecord(value);
    if (record) return record;
  }
  return null;
}

/**
 * Extract only allowlisted, non-secret Prisma/adapter diagnostics.
 * Raw messages, stacks, SQL, bind values, URLs and arbitrary metadata
 * are never emitted.
 */
export function sanitizeHomepageQueryError(queryName: string, error: unknown) {
  const record = asRecord(error);
  const cause = asRecord(record?.cause);
  const nestedError = asRecord(record?.error);
  const response = asRecord(record?.response);
  const responseData = asRecord(response?.data);
  const errors = Array.isArray(record?.errors) ? record.errors : Array.isArray(responseData?.errors) ? responseData.errors : [];
  const firstError = asRecord(errors[0]);
  const meta = firstRecord(record?.meta, cause?.meta, nestedError?.meta, firstError?.meta);
  const errorName = safeString(record?.name, /^[A-Za-z][A-Za-z0-9_$]{0,79}$/)
    ?? safeConstructorName(error)
    ?? "UnknownError";
  const causeName = safeString(cause?.name, /^[A-Za-z][A-Za-z0-9_$]{0,79}$/)
    ?? safeConstructorName(cause);
  const originalCode = safeString(record?.originalCode, SAFE_META_CODE);
  const prismaCode = [
    record?.code,
    record?.originalCode,
    cause?.code,
    nestedError?.code,
    firstError?.code,
  ].map((value) => safeString(value, SAFE_PRISMA_CODE)).find(Boolean);
  const databaseCode = originalCode ?? safeString(meta?.code, SAFE_META_CODE);
  const adapterKind = safeString(record?.kind, /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/);
  const clientVersion = safeString(record?.clientVersion, /^\d{1,3}\.\d{1,3}\.\d{1,3}(?:[-+][A-Za-z0-9.-]+)?$/);
  const model = safeString(meta?.modelName ?? meta?.model_name, SAFE_IDENTIFIER);
  const field = safeString(meta?.field_name ?? meta?.fieldName, SAFE_IDENTIFIER);
  const column = safeString(record?.column, SAFE_QUALIFIED_IDENTIFIER)
    ?? safeString(meta?.column ?? meta?.column_name, SAFE_IDENTIFIER);
  const table = safeString(meta?.table ?? meta?.table_name, SAFE_QUALIFIED_IDENTIFIER);
  const rawTarget = meta?.target;
  const target = Array.isArray(rawTarget)
    ? rawTarget.map((item) => safeString(item, SAFE_IDENTIFIER)).filter((item): item is string => Boolean(item)).slice(0, 8)
    : typeof rawTarget === "string"
      ? rawTarget.split(",").map((item) => safeString(item.trim(), SAFE_IDENTIFIER)).filter((item): item is string => Boolean(item)).slice(0, 8)
      : undefined;
  const message = [record?.originalMessage, record?.message, cause?.message, nestedError?.message, firstError?.message, responseData?.message]
    .find((value) => typeof value === "string");
  const responseStatus = typeof response?.status === "number" && Number.isInteger(response.status) && response.status >= 100 && response.status <= 599
    ? response.status
    : typeof record?.status === "number" && Number.isInteger(record.status) && record.status >= 100 && record.status <= 599
      ? record.status
      : undefined;

  return {
    query: safeString(queryName, SAFE_QUERY_NAME) ?? "homepage.unknown",
    valueType: typeof error,
    errorName,
    ...(safePropertyNames(record).length ? { errorKeys: safePropertyNames(record) } : {}),
    ...(causeName ? { causeName } : {}),
    ...(cause && safePropertyNames(cause).length ? { causeKeys: safePropertyNames(cause) } : {}),
    ...(responseStatus ? { responseStatus } : {}),
    ...(response && safePropertyNames(response).length ? { responseKeys: safePropertyNames(response) } : {}),
    ...(errors.length ? { nestedErrorCount: errors.length } : {}),
    ...(firstError && safePropertyNames(firstError).length ? { firstNestedErrorKeys: safePropertyNames(firstError) } : {}),
    classification: classifyErrorMessage(message),
    ...(prismaCode ? { prismaCode } : {}),
    ...(databaseCode ? { databaseCode } : {}),
    ...(adapterKind ? { adapterKind } : {}),
    ...(clientVersion ? { clientVersion } : {}),
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
