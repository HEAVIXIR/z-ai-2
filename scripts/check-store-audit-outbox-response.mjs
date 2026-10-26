import { pathToFileURL } from 'node:url';

function nonNegativeSafeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

/**
 * Evaluate the authenticated worker response against the operator-configured
 * backlog-age SLO. This function has no network or database side effects.
 */
export function evaluateOutboxResponse(result, maxAgeSeconds, nowMs = Date.now()) {
  const problems = [];
  if (!Number.isSafeInteger(maxAgeSeconds) || maxAgeSeconds < 1) {
    problems.push('maximum pending age must be a positive safe integer');
  }

  const drain = result?.drain;
  const stats = result?.stats;
  if (result?.ok !== true || !drain || !stats) {
    problems.push('worker response is missing ok/drain/stats fields');
    return { ok: false, problems, summary: null };
  }

  const counters = {
    deliveredThisRun: drain.delivered,
    failedThisRun: drain.failed,
    pending: stats.pending,
    processing: stats.processing,
    delivered: stats.delivered,
    failed: stats.failed,
  };
  for (const [name, value] of Object.entries(counters)) {
    if (!nonNegativeSafeInteger(value)) {
      problems.push(`${name} must be a non-negative safe integer`);
    }
  }
  if (problems.length) return { ok: false, problems, summary: null };

  let oldestPendingAgeSeconds = null;
  if (stats.oldestPendingAt != null) {
    const oldestMs = Date.parse(stats.oldestPendingAt);
    if (!Number.isFinite(oldestMs)) {
      problems.push('oldestPendingAt must be a valid timestamp or null');
    } else {
      oldestPendingAgeSeconds = Math.max(0, Math.floor((nowMs - oldestMs) / 1000));
    }
  }

  const outstanding = stats.pending + stats.processing;
  if (outstanding > 0 && oldestPendingAgeSeconds == null) {
    problems.push('outstanding events exist but oldestPendingAt is missing');
  }
  if (drain.failed > 0) problems.push('one or more deliveries failed during this run');
  if (stats.failed > 0) problems.push('FAILED outbox rows require investigation');
  if (
    outstanding > 0 &&
    oldestPendingAgeSeconds != null &&
    Number.isSafeInteger(maxAgeSeconds) &&
    maxAgeSeconds > 0 &&
    oldestPendingAgeSeconds > maxAgeSeconds
  ) {
    problems.push('oldest outstanding outbox event exceeds the configured age SLO');
  }

  return {
    ok: problems.length === 0,
    problems,
    summary: {
      ...counters,
      oldestPendingAgeSeconds,
      maxPendingAgeSeconds: maxAgeSeconds,
    },
  };
}

async function main() {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  let result;
  try {
    result = JSON.parse(raw);
  } catch {
    console.error('FAIL: worker returned invalid JSON');
    process.exitCode = 1;
    return;
  }

  const maxAgeSeconds = Number(process.argv[2]);
  const evaluation = evaluateOutboxResponse(result, maxAgeSeconds);
  if (evaluation.summary) console.log(JSON.stringify(evaluation.summary));
  if (!evaluation.ok) {
    console.error('FAIL: ' + evaluation.problems.join('; '));
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error('FAIL: outbox response evaluation failed');
    process.exitCode = 1;
  });
}
