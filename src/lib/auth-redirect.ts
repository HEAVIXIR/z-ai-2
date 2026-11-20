/**
 * Accept only same-origin absolute paths for post-authentication navigation.
 * Reject protocol-relative URLs and backslash variants to prevent open redirects.
 */
export function safeInternalRedirect(value: string | null | undefined, fallback = "/"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\") || /[\u0000-\u001f]/.test(value)) {
    return fallback;
  }
  try {
    const parsed = new URL(value, "https://heavix.invalid");
    if (parsed.origin !== "https://heavix.invalid") return fallback;
    return parsed.pathname + parsed.search + parsed.hash;
  } catch {
    return fallback;
  }
}
