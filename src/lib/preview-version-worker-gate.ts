const PROOF_ROUTE = "/api/opennext-runtime-proof";

function extractBearerToken(header: string | null): string {
  return header?.replace(/^Bearer\s+/i, "") ?? "";
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

/**
 * A version-only outer gate. The OpenNext application is never invoked unless
 * this is the exact proof GET endpoint and the ephemeral bearer token matches.
 * This protects every other application route when testing a Worker Version URL.
 */
export function isAllowedPreviewProofRequest(
  request: Request,
  expectedToken: string | undefined,
): boolean {
  if (request.method !== "GET" || !expectedToken) return false;
  const url = new URL(request.url);
  if (url.pathname !== PROOF_ROUTE || url.search !== "") return false;
  const suppliedToken = extractBearerToken(request.headers.get("authorization"));
  return constantTimeEqual(suppliedToken, expectedToken);
}
