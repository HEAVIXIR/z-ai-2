const LOGIN_PATH = "/__heavix_preview/login";
const LOGOUT_PATH = "/__heavix_preview/logout";
const COOKIE_NAME = "__Host-heavix_preview_session";
const SESSION_TTL_SECONDS = 8 * 60 * 60;
const MAX_FORM_BYTES = 4096;
const encoder = new TextEncoder();

export interface PreviewGateEnv {
  HEAVIX_ENV?: string;
  HEAVIX_PREVIEW_GATE_PASSWORD?: string;
  HEAVIX_PREVIEW_GATE_SIGNING_KEY?: string;
}

type Downstream = () => Promise<Response>;

function securityHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  headers.set("cache-control", "private, no-store, max-age=0");
  headers.set("pragma", "no-cache");
  headers.set("x-robots-tag", "noindex, nofollow, noarchive");
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "no-referrer");
  headers.set("x-frame-options", "DENY");
  headers.set("cross-origin-resource-policy", "same-origin");
  return headers;
}

function response(body: BodyInit | null, status: number, headers?: HeadersInit): Response {
  return new Response(body, { status, headers: securityHeaders(headers) });
}

function unavailable(): Response {
  return response("Preview access is not configured. Access is closed.", 503, {
    "content-type": "text/plain; charset=utf-8",
    "retry-after": "300",
  });
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

function validSecret(value: string | undefined): value is string {
  return typeof value === "string" && encoder.encode(value).length >= 32;
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function signExpiry(expiry: number, signingKey: string, origin: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(signingKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(`heavix-preview-v1:${origin}:${expiry}`));
  return base64Url(new Uint8Array(signature));
}

async function createSession(signingKey: string, origin: string, nowSeconds = Math.floor(Date.now() / 1000)): Promise<string> {
  const expiry = nowSeconds + SESSION_TTL_SECONDS;
  return `${expiry}.${await signExpiry(expiry, signingKey, origin)}`;
}

function readCookie(request: Request): string | null {
  const cookieHeader = request.headers.get("cookie") ?? "";
  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(`${COOKIE_NAME}=`)) return trimmed.slice(COOKIE_NAME.length + 1);
  }
  return null;
}

async function hasValidSession(request: Request, signingKey: string): Promise<boolean> {
  const value = readCookie(request);
  if (!value || value.length > 160) return false;
  const [expiryText, signature, ...rest] = value.split(".");
  if (!expiryText || !signature || rest.length > 0 || !/^\d{10}$/.test(expiryText)) return false;
  const expiry = Number(expiryText);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(expiry) || expiry <= now || expiry > now + SESSION_TTL_SECONDS + 60) return false;
  const expected = await signExpiry(expiry, signingKey, new URL(request.url).origin);
  return constantTimeEqual(encoder.encode(signature), encoder.encode(expected));
}

function loginPage(error = false): Response {
  const message = error
    ? '<p role="alert">رمز عبور صحیح نیست. دوباره تلاش کنید.</p>'
    : "";
  const html = `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow,noarchive">
<title>ورود به پیش‌نمایش هویـکس</title>
<style>
:root{color-scheme:dark;font-family:Tahoma,Arial,sans-serif}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#101827;color:#eef3fb;padding:24px}
main{width:min(100%,420px);padding:32px;border:1px solid #34445d;border-radius:18px;background:#172338;box-shadow:0 18px 60px #0005}
h1{font-size:22px;margin:0 0 10px}
p{color:#b9c7da;line-height:1.9}
label{display:block;margin:22px 0 8px}
input{width:100%;padding:14px;border-radius:10px;border:1px solid #536780;background:#0e1726;color:#fff;font:inherit}
button{width:100%;margin-top:18px;padding:14px;border:0;border-radius:10px;background:#d5e6ff;color:#102039;font:inherit;font-weight:700;cursor:pointer}
[role=alert]{color:#ffb8b8}
small{display:block;margin-top:18px;color:#9eacc0}
</style>
</head>
<body>
<main>
<h1>پیش‌نمایش خصوصی هویـکس</h1>
<p>این محیط فقط برای افراد مجاز است. برای ادامه، رمز عبور دسترسی پیش‌نمایش را وارد کنید.</p>
${message}
<form method="post" action="${LOGIN_PATH}" autocomplete="on">
<label for="password">رمز عبور</label>
<input id="password" name="password" type="password" autocomplete="current-password" minlength="32" required autofocus>
<button type="submit">ورود به پیش‌نمایش</button>
</form>
<small>نشست پس از ۸ ساعت منقضی می‌شود.</small>
</main>
</body>
</html>`;
  return response(html, error ? 401 : 200, {
    "content-type": "text/html; charset=utf-8",
    "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  });
}

function originIsSame(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    if (new URL(origin).origin !== new URL(request.url).origin) return false;
  } catch {
    return false;
  }
  const fetchSite = request.headers.get("sec-fetch-site");
  return fetchSite === null || fetchSite === "same-origin" || fetchSite === "none";
}

async function readSmallForm(request: Request): Promise<URLSearchParams | null> {
  const contentType = request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (contentType !== "application/x-www-form-urlencoded") return null;
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_FORM_BYTES) return null;
  if (!request.body) return new URLSearchParams();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_FORM_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new URLSearchParams(new TextDecoder().decode(bytes));
}

function setSessionCookie(value: string): string {
  return `${COOKIE_NAME}=${value}; Max-Age=${SESSION_TTL_SECONDS}; Path=/; Secure; HttpOnly; SameSite=Strict`;
}

function clearSessionCookie(): string {
  return `${COOKIE_NAME}=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Strict`;
}

function redirectTo(request: Request, path: string, cookie?: string): Response {
  const headers = new Headers({ location: new URL(path, request.url).toString() });
  if (cookie) headers.append("set-cookie", cookie);
  return response(null, 303, headers);
}

function unauthorized(request: Request): Response {
  const isNavigation = request.method === "GET"
    && request.headers.get("sec-fetch-mode") === "navigate"
    && (request.headers.get("accept") ?? "").includes("text/html");
  if (isNavigation) return redirectTo(request, LOGIN_PATH);
  return response(JSON.stringify({ error: "preview_authentication_required" }), 401, {
    "content-type": "application/json; charset=utf-8",
    "www-authenticate": 'Preview realm="Heavix"',
  });
}

export async function handlePreviewGate(
  request: Request,
  env: PreviewGateEnv,
  downstream: Downstream,
): Promise<Response> {
  // This entrypoint is dedicated to the preview Worker. Missing/wrong mode or
  // missing credentials never falls through to OpenNext.
  if (env.HEAVIX_ENV !== "preview"
    || !validSecret(env.HEAVIX_PREVIEW_GATE_PASSWORD)
    || !validSecret(env.HEAVIX_PREVIEW_GATE_SIGNING_KEY)) {
    return unavailable();
  }

  const url = new URL(request.url);
  if (url.pathname === LOGIN_PATH) {
    if (request.method === "GET" && (url.search === "" || url.search === "?error=1")) {
      return loginPage(url.searchParams.get("error") === "1");
    }
    if (request.method !== "POST" || !originIsSame(request)) {
      return response("Forbidden", 403, { "content-type": "text/plain; charset=utf-8" });
    }
    const form = await readSmallForm(request);
    const passwords = form?.getAll("password") ?? [];
    if (passwords.length !== 1) return loginPage(true);
    const supplied = encoder.encode(passwords[0] ?? "");
    const expected = encoder.encode(env.HEAVIX_PREVIEW_GATE_PASSWORD);
    if (!constantTimeEqual(supplied, expected)) return loginPage(true);
    const session = await createSession(env.HEAVIX_PREVIEW_GATE_SIGNING_KEY, url.origin);
    return redirectTo(request, "/", setSessionCookie(session));
  }

  if (url.pathname === LOGOUT_PATH) {
    if (request.method === "GET") {
      if (!await hasValidSession(request, env.HEAVIX_PREVIEW_GATE_SIGNING_KEY)) return unauthorized(request);
      const html = `<!doctype html><html lang="fa" dir="rtl"><meta charset="utf-8"><title>خروج از پیش‌نمایش</title><body><form method="post" action="${LOGOUT_PATH}"><button type="submit">خروج از پیش‌نمایش</button></form></body></html>`;
      return response(html, 200, {
        "content-type": "text/html; charset=utf-8",
        "content-security-policy": "default-src 'none'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      });
    }
    if (request.method !== "POST" || !originIsSame(request)) {
      return response("Forbidden", 403, { "content-type": "text/plain; charset=utf-8" });
    }
    return redirectTo(request, LOGIN_PATH, clearSessionCookie());
  }

  if (!await hasValidSession(request, env.HEAVIX_PREVIEW_GATE_SIGNING_KEY)) {
    return unauthorized(request);
  }

  // SameSite cookies alone do not stop every same-site/cross-origin CSRF case.
  // Require an exact Origin for all unsafe methods before dispatching to Next.
  if (request.method !== "GET" && request.method !== "HEAD" && !originIsSame(request)) {
    return response("Forbidden", 403, { "content-type": "text/plain; charset=utf-8" });
  }

  const upstream = await downstream();
  const headers = securityHeaders(upstream.headers);
  headers.set("vary", headers.get("vary") ? `${headers.get("vary")}, Cookie` : "Cookie");
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}

export const previewGatePaths = { login: LOGIN_PATH, logout: LOGOUT_PATH, cookie: COOKIE_NAME };
