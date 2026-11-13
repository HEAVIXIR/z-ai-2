/** Pure guards shared by the OpenNext proof route and its unit tests. */
export function isPostgres17(version: string | null | undefined): boolean {
  return /^17\./.test(version ?? "");
}

/** PostgreSQL OIDs are unsigned 32-bit identifiers scoped to one cluster. */
export function isPostgresDatabaseOid(value: string | null | undefined): value is string {
  return !!value && /^[1-9]\d{0,9}$/.test(value) && Number(value) <= 4_294_967_295;
}

export function extractBearerToken(header: string | null): string {
  return header?.replace(/^Bearer\s+/i, "") ?? "";
}

export function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}
