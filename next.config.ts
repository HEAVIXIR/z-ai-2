import type { NextConfig } from "next";

/**
 * HEAVIX Next.js configuration — STEP 15.37-D (F-013 + F-014).
 *
 * Security notes:
 * - `typescript.ignoreBuildErrors` is set to `false` (F-013 remediation).
 *   Previously this was `true`, which silently allowed TypeScript errors to
 *   pass through production builds — including errors that could mask
 *   security-relevant type mismatches (e.g. authorization function signatures,
 *   API route handler inputs, etc.). Build now fails on type errors.
 *
 * - `headers()` returns a defense-in-depth security header stack (F-014):
 *   * Strict-Transport-Security — enforce HTTPS at the browser level.
 *   * X-Frame-Options: DENY — anti-clickjacking (redundant with CSP
 *     `frame-ancestors 'none'`, but older browsers only honor X-Frame-Options).
 *   * X-Content-Type-Options: nosniff — prevent MIME sniffing.
 *   * Referrer-Policy: strict-origin-when-cross-origin — limit referrer leakage.
 *   * Permissions-Policy — deny camera/mic/geo/payment by default.
 *   * Content-Security-Policy — see inline comments for tradeoffs.
 *
 * CSP tradeoff (documented):
 *   Next.js requires `'unsafe-inline'` for the inline <script> tags it injects
 *   (e.g. the bootstrapping scripts that hydrate server components and pass
 *   serialized props). It also requires `'unsafe-eval'` in DEVELOPMENT because
 *   the dev server compiles modules via eval-based HMR. In production the
 *   `'unsafe-eval'` source is not strictly required by Next.js core, but is
 *   retained here as a transitional measure to avoid breaking libraries that
 *   may rely on dynamic evaluation (e.g. some chart / markdown renderers).
 *
 *   A stricter CSP using per-request nonces is the recommended end state
 *   (Next.js supports `nonce` on script tags via the `headers()` API in
 *   App Router). That work is tracked as a follow-up TODO because it requires
 *   nonce propagation through the React server component tree and is
 *   out-of-scope for this security-header floor.
 *
 *   To ease rollout, the CSP directive is currently applied in ENFORCE mode.
 *   If violations are observed in production, the operator should temporarily
 *   duplicate the policy as `Content-Security-Policy-Report-Only` (with a
 *   reporting endpoint) to triage before re-enabling enforcement.
 */

const cspDirectives = [
  "default-src 'self'",
  // Next.js injects inline <script> tags for hydration data; dev mode uses eval.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  // Tailwind + Next.js inject inline <style> tags.
  "style-src 'self' 'unsafe-inline'",
  // Allow images from self, data: URIs (small inline assets), blob: (client
  // side image previews), and any HTTPS image host (marketplace listings
  // commonly reference external image URLs).
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  // API calls / fetch / EventSource: same origin only.
  "connect-src 'self'",
  // Media (audio/video) — same origin only by default.
  "media-src 'self'",
  // Disallow embedding this app in any frame (anti-clickjacking).
  "frame-ancestors 'none'",
  // Restrict <base href> to same origin.
  "base-uri 'self'",
  // Restrict form submissions to same origin.
  "form-action 'self'",
  // Disallow plugins (legacy Flash/PDF embeds).
  "object-src 'none'",
  // Disallow workers/sharedworkers from blob: (defense-in-depth).
  "worker-src 'self'",
  "frame-src 'self'",
  "manifest-src 'self'",
].join("; ");

const securityHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
  {
    key: "Content-Security-Policy",
    value: cspDirectives,
  },
];

const nextConfig: NextConfig = {
  output: "standalone",
  // OpenNext/esbuild needs the workerd-conditioned pg-cloudflare entrypoints.
  // Next's output file tracer otherwise omits these dynamically required files.
  outputFileTracingIncludes: {
    "**/*": [
      "./node_modules/pg-cloudflare/dist/**",
      "./node_modules/pg-cloudflare/esm/**",
      // Prisma's engineType="client" Worker clients load this WASM compiler
      // at runtime. Without explicit tracing includes, Next/OpenNext can omit
      // it from the deployed bundle and every Prisma query fails with ENOENT.
      "./src/lib/generated/main-worker-client/query_compiler_bg.wasm",
      "./src/lib/generated/store-worker-client/query_compiler_bg.wasm",
    ],
  },
  typescript: {
    // F-013: build MUST fail on type errors. Was previously `true` which masked
    // security-relevant type mismatches at build time.
    ignoreBuildErrors: false,
  },
  reactStrictMode: false,
  allowedDevOrigins: [
    "127.0.0.1",
    "localhost",
    "*.space-z.ai",
    "*.fcapp.run",
  ],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
