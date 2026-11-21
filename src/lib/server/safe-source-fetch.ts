import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";

const ALLOWED_SOURCE_HOSTS = ["divar.ir", "divar.com", "sheypoor.com"];
const SOURCE_DNS_LOOKUP_TIMEOUT_MS = 8_000;
const SOURCE_REQUEST_TIMEOUT_MS = 12_000;

function normalizeAllowedHosts(hosts: string[]): string[] {
  return hosts
    .map((host) => host.trim().toLowerCase().replace(/^\.+|\.+$/g, ""))
    .filter((host) =>
      host.length > 0 &&
      host.length <= 253 &&
      !host.includes("*") &&
      host.split(".").every((label) =>
        label.length > 0 &&
        label.length <= 63 &&
        /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label),
      ),
    );
}

export function isAllowedSourceUrl(
  raw: string,
  allowedHosts: string[] = ALLOWED_SOURCE_HOSTS,
): boolean {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password) return false;
    const host = url.hostname.toLowerCase();
    const approved = normalizeAllowedHosts(allowedHosts);
    return approved.some((domain) => host === domain || host.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

function ipv4Number(address: string): number[] | null {
  if (!/^(?:0|[1-9]\d{0,2})(?:\.(?:0|[1-9]\d{0,2})){3}$/.test(address)) return null;
  const parts = address.split(".").map(Number);
  if (parts.some((part) => part > 255)) return null;
  return parts;
}

/** Conservative global-unicast check; special-purpose and non-public ranges fail closed. */
export function isPublicIpv4(address: string): boolean {
  const parts = ipv4Number(address);
  if (!parts) return false;
  const [a, b, c] = parts;
  return !(
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 31 && c === 196) ||
    (a === 192 && b === 52 && c === 193) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 175 && c === 48) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113)
  );
}

export type SourceFetchResult = { html: string; title: string; redirect?: string };
type LookupResult = Array<{ address: string; family: number }>;
type SourceFetchDependencies = {
  lookup: (hostname: string, options: { all: true; family: 4; verbatim: true }) => Promise<LookupResult>;
  request: (url: URL, address: string, signal?: AbortSignal) => Promise<SourceFetchResult>;
};

function lookupWithTimeout(
  lookup: () => Promise<LookupResult>,
  signal?: AbortSignal,
): Promise<LookupResult> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      callback();
    };
    const onAbort = () => finish(() => reject(new Error("درخواست دریافت صفحه لغو شد.")));

    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener("abort", onAbort, { once: true });
    timer = setTimeout(
      () => finish(() => reject(new Error("مهلت بررسی DNS منبع تمام شد."))),
      SOURCE_DNS_LOOKUP_TIMEOUT_MS,
    );

    try {
      lookup().then(
        (result) => finish(() => {
          if (signal?.aborted) reject(new Error("درخواست دریافت صفحه لغو شد."));
          else resolve(result);
        }),
        (error) => finish(() => reject(error)),
      );
    } catch (error) {
      finish(() => reject(error));
    }
  });
}

async function requestPinnedSource(url: URL, address: string, signal?: AbortSignal): Promise<SourceFetchResult> {
  return new Promise((resolve, reject) => {
    const request = httpsRequest({
      protocol: "https:",
      hostname: url.hostname,
      port: 443,
      servername: url.hostname,
      path: `${url.pathname}${url.search}`,
      method: "GET",
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; HEAVIX-ListingImporter/1.0)",
        accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.1",
        "accept-language": "fa-IR,fa;q=0.9,en;q=0.7",
        "accept-encoding": "identity",
      },
      lookup: ((_hostname: string, _options: any, callback: any) => callback(null, address, 4)) as any,
    }, (response) => {
      // Attach stream failure handlers before early redirect/status branches resume the body.
      response.on("error", reject);
      response.on("aborted", () => reject(new Error("پاسخ منبع پیش از تکمیل قطع شد.")));
      const status = response.statusCode || 0;
      const location = response.headers.location;
      if ([301, 302, 303, 307, 308].includes(status) && location) {
        response.resume();
        resolve({ html: "", title: "", redirect: location });
        return;
      }
      const contentType = String(response.headers["content-type"] || "").toLowerCase();
      if (contentType && !/(text\/html|application\/xhtml\+xml|application\/json)/.test(contentType)) {
        response.resume();
        reject(new Error("منبع پاسخ HTML معتبری ارائه نکرد."));
        return;
      }
      if (status < 200 || status >= 300) {
        response.resume();
        reject(new Error(`منبع با وضعیت HTTP ${status} پاسخ داد.`));
        return;
      }
      const declaredLength = Number(response.headers["content-length"] || 0);
      if (declaredLength > 2_000_000) {
        response.destroy(new Error("حجم صفحه منبع بیش از حد مجاز است."));
        reject(new Error("حجم صفحه منبع بیش از حد مجاز است."));
        return;
      }
      const chunks: Buffer[] = [];
      let total = 0;
      response.on("data", (chunk: Buffer | string) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        total += buffer.length;
        if (total > 2_000_000) {
          response.destroy(new Error("حجم صفحه منبع بیش از حد مجاز است."));
          return;
        }
        chunks.push(buffer);
      });
      response.on("end", () => {
        const html = Buffer.concat(chunks).toString("utf8");
        const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]+>/g, "").trim() || "";
        resolve({ html, title });
      });
    });
    request.setTimeout(SOURCE_REQUEST_TIMEOUT_MS, () => request.destroy(new Error("مهلت دریافت صفحه منبع تمام شد.")));
    const totalTimeout = setTimeout(
      () => request.destroy(new Error("مهلت دریافت صفحه منبع تمام شد.")),
      SOURCE_REQUEST_TIMEOUT_MS,
    );
    const abortRequest = () => request.destroy(new Error("درخواست دریافت صفحه لغو شد."));
    request.once("close", () => {
      clearTimeout(totalTimeout);
      signal?.removeEventListener("abort", abortRequest);
    });
    if (signal?.aborted) abortRequest();
    else signal?.addEventListener("abort", abortRequest, { once: true });
    request.on("error", reject);
    request.end();
  });
}

const defaultDependencies: SourceFetchDependencies = {
  lookup: dnsLookup as SourceFetchDependencies["lookup"],
  request: requestPinnedSource,
};

/** Revalidate every redirect, reject mixed/private DNS answers, and pin each HTTPS hop to a checked IPv4. */
export async function fetchAllowedSourcePage(
  rawUrl: string,
  signal?: AbortSignal,
  dependencies: SourceFetchDependencies = defaultDependencies,
  allowedHosts: string[] = ALLOWED_SOURCE_HOSTS,
): Promise<{ html: string; title: string }> {
  let current: URL;
  try {
    current = new URL(rawUrl);
  } catch {
    throw new Error("نشانی منبع معتبر نیست.");
  }

  for (let hop = 0; hop <= 4; hop++) {
    if (!isAllowedSourceUrl(current.toString(), allowedHosts) || (current.port && current.port !== "443")) {
      throw new Error("مسیر انتقال به دامنه یا درگاه غیرمجاز مسدود شد.");
    }
    if (signal?.aborted) throw new Error("درخواست دریافت صفحه لغو شد.");

    const resolved = await lookupWithTimeout(
      () => dependencies.lookup(current.hostname, { all: true, family: 4, verbatim: true }),
      signal,
    );
    if (signal?.aborted) throw new Error("درخواست دریافت صفحه لغو شد.");
    if (!resolved.length || resolved.some((entry) => !isPublicIpv4(entry.address))) {
      throw new Error("نشانی شبکه مقصد عمومی و امن نیست.");
    }
    const result = await dependencies.request(current, resolved[0].address, signal);
    if (!result.redirect) return { html: result.html, title: result.title };
    if (hop === 4) throw new Error("تعداد انتقال‌های صفحه از حد مجاز بیشتر است.");

    try {
      current = new URL(result.redirect, current);
    } catch {
      throw new Error("نشانی انتقال منبع معتبر نیست.");
    }
  }
  throw new Error("دریافت امن صفحه منبع ناموفق بود.");
}