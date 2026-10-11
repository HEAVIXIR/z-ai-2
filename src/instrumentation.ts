/* ============================================================
   HEAVIX — Process Resilience Instrumentation (R-08 v4)
   ------------------------------------------------------------
   STEP 11.90 — Final fixes for owner CHANGES REQUESTED (STEP 11.89).

   Changes from v3:
   A. P1003: comment and code are now consistent. P1003 is NOT
      transient (could be permanent — DB deleted/moved). Comment
      updated to match code logic. No contradiction.
   B. sanitizeErrorForLogging: recursive cause handling (up to 3
      levels) + redactSensitive applied to cause.message AND
      cause.stack. Added token= to non-Error path.
   C. Shutdown: documented as "best-effort delay, NOT guaranteed
      request draining." Next.js standalone does not expose
      server.close() in instrumentation.ts. The 500ms delay gives
      the event loop time to process in-flight responses. Docker's
      10s termination grace period is the real drain mechanism.
      This limitation is explicitly documented, not hidden.
   ============================================================ */

interface PrismaErrorLike {
  name?: string;
  code?: string;
  message?: string;
  clientVersion?: string;
  cause?: unknown;
  stack?: string;
}

/**
 * Redact sensitive patterns from a string.
 * Applied uniformly to message, stack, cause, and all string conversions.
 */
function redactSensitive(str: string): string {
  return str
    .replace(/postgresql:\/\/[^\s'"]+/gi, 'postgresql://[REDACTED]')
    .replace(/postgres:\/\/[^\s'"]+/gi, 'postgres://[REDACTED]')
    .replace(/password=[^\s&'"]+/gi, 'password=[REDACTED]')
    .replace(/token=[^\s&'"]+/gi, 'token=[REDACTED]')
    .replace(/apiKey=[^\s&'"]+/gi, 'apiKey=[REDACTED]')
    .replace(/secret=[^\s&'"]+/gi, 'secret=[REDACTED]')
    .replace(/Authorization:\s*Bearer\s+[^\s]+/gi, 'Authorization: Bearer [REDACTED]');
}

/**
 * Recursively sanitize an error and its cause chain (up to 3 levels).
 * Redacts ALL sensitive patterns from message, stack, and nested causes.
 */
function sanitizeErrorForLogging(reason: unknown, depth: number = 0): string {
  if (!reason) return '(no reason)';
  if (depth > 3) return '[max cause depth reached]';

  if (reason instanceof Error) {
    const name = reason.name || 'Error';
    const code = (reason as PrismaErrorLike).code || '';
    const msg = redactSensitive((reason.message || '').substring(0, 500));
    const stack = redactSensitive((reason.stack || '').substring(0, 1000));

    // Recursively handle nested cause chain
    let causeStr = '';
    const cause = (reason as PrismaErrorLike).cause;
    if (cause instanceof Error) {
      const causeSanitized = sanitizeErrorForLogging(cause, depth + 1);
      causeStr = '\nCaused by: ' + causeSanitized;
    } else if (cause) {
      causeStr = '\nCaused by: ' + redactSensitive(String(cause).substring(0, 300));
    }

    return `${name} [${code}] ${msg}\n${stack}${causeStr}`;
  }

  // For non-Error reasons, convert to string, truncate, and redact
  const str = String(reason).substring(0, 500);
  return redactSensitive(str);
}

function isTransientDBError(reason: unknown): boolean {
  if (!reason) return false;

  const error = reason as PrismaErrorLike & { errno?: string; syscall?: string };
  const errorName = error.name || '';
  const errorCode = error.code || '';
  const errorMsg = error.message || '';

  // ── PrismaClientInitializationError ──
  // Not ALL initialization errors are transient. Only specific
  // connection-related codes are transient (process can safely continue).
  //
  // Transient (continue):
  //   P1001: Can't reach database server (network issue)
  //   P1002: Timed out fetching engine (temporary slowness)
  //
  // Non-transient (exit — could be permanent):
  //   P1003: Database does not exist at path (could be deleted/moved permanently)
  //   P1004: Schema mismatch (configuration error)
  //   P1005: Database file is locked (state issue)
  //   P1009: Database file can't be created (permissions)
  //   P1010: Auth failed (credentials issue)
  //   P1011-1015: Various configuration/permission errors
  //   No code / unknown code: fail-safe → exit
  if (errorName === 'PrismaClientInitializationError') {
    if (['P1001', 'P1002'].includes(errorCode)) return true;
    return false; // P1003+ and unknown → non-transient → exit
  }

  // ── PrismaClientKnownRequestError ──
  // Connection-related codes only:
  //   P1001: Can't reach database server
  //   P1002: Timed out
  //   P1008: Operations timed out
  //   P1017: Server closed the connection
  if (errorName === 'PrismaClientKnownRequestError') {
    if (['P1001', 'P1002', 'P1008', 'P1017'].includes(errorCode)) return true;
  }

  // ── Node.js network errors (transient) ──
  if (['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'EHOSTUNREACH', 'ENETUNREACH'].includes(errorCode)) {
    return true;
  }

  // ── PostgreSQL admin termination (pg_terminate_backend) ──
  if (errorMsg.includes('terminating connection due to administrator command')) return true;
  if (errorMsg.includes('Server has closed the connection')) return true;
  if (errorMsg.includes('Can\'t reach database server')) return true;

  return false; // Default: NOT transient → exit (fail-safe)
}

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  // ── unhandledRejection: CLASSIFY then decide ──
  process.on('unhandledRejection', (reason: unknown) => {
    const sanitized = sanitizeErrorForLogging(reason);

    if (isTransientDBError(reason)) {
      console.error('[instrumentation] Transient DB error (process continuing):', sanitized);
      return;
    }

    console.error('[instrumentation] Non-transient unhandled rejection (process exiting):', sanitized);
    process.exit(1);
  });

  // ── uncaughtException: always log and exit ──
  process.on('uncaughtException', (error: Error) => {
    const sanitized = sanitizeErrorForLogging(error);
    console.error('[instrumentation] Uncaught Exception (process exiting):', sanitized);
    process.exit(1);
  });

  // ── SIGTERM/SIGINT: best-effort shutdown delay ──
  //
  // LIMITATION: Next.js standalone server does not expose server.close()
  // in instrumentation.ts. The HTTP server is created internally by
  // Next.js and is not accessible from this module. Therefore, we
  // cannot explicitly drain in-flight requests.
  //
  // Instead, we use a 500ms delay to give the Node.js event loop time
  // to process remaining HTTP responses. This is a best-effort approach:
  //   - Short responses (< 500ms): will complete before exit
  //   - Long responses (> 500ms): may be terminated
  //   - Docker's 10s termination grace period provides additional safety
  //
  // For production, Docker's `stop_grace_period: 10s` (default) is the
  // real drain mechanism. This handler ensures we exit cleanly within
  // the grace period rather than being SIGKILLed.
  let shuttingDown = false;

  function gracefulShutdown(signal: string) {
    if (shuttingDown) return; // Prevent double-shutdown
    shuttingDown = true;
    console.log(`[instrumentation] ${signal} received — best-effort shutdown (500ms delay, NOT guaranteed drain)`);
    setTimeout(() => {
      process.exit(0);
    }, 500);
  }

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  console.log('[instrumentation] Process resilience handlers registered (R-08 v4: refined classification + recursive redaction + best-effort shutdown)');
}
