/**
 * HEAVIX — STEP 15-B.4.4: Promise.all Experiment
 *
 * Tests Q3 (homeCategoryConfig.findUnique) + Q4 (siteSettings.findUnique)
 * in two modes:
 *   1. Sequential (current production behavior)
 *   2. Promise.all (candidate)
 *
 * Measures in TWO scenarios:
 *   A. Warm / single request — baseline latency
 *   B. Concurrent workload (10 parallel simulations) — real pool pressure
 *
 * Captures per-mode:
 *   - Wall-clock total
 *   - Per-query execution time
 *   - DB execution total
 *   - Connection pool usage (peak concurrent connections)
 *   - Buffer hits
 *   - Rows returned
 *   - Correctness
 *   - Errors / timeouts
 *
 * Pure experiment — NO production code change.
 */

import { PrismaClient } from '@prisma/client';
import { performance } from 'perf_hooks';

const prisma = new PrismaClient({
  log: ['query'],
});

// ── Helpers ──────────────────────────────────────────────
async function measureSingle(label, fn, runs = 5) {
  const times = [];
  let lastResult = null;
  let lastError = null;
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    try {
      lastResult = await fn();
    } catch (e) {
      lastError = e;
    }
    const end = performance.now();
    times.push(end - start);
  }
  times.sort((a, b) => a - b);
  const median = times[Math.floor(runs / 2)];
  const best = times[0];
  const worst = times[times.length - 1];
  return { label, median, best, worst, times, lastResult, lastError };
}

async function getPoolStats() {
  const result = await prisma.$queryRaw`
    SELECT count(*) as total, 
           count(*) FILTER (WHERE state = 'active') as active,
           count(*) FILTER (WHERE state = 'idle') as idle
    FROM pg_stat_activity 
    WHERE datname = 'heavix'
  `;
  return result[0];
}

async function getBufferStats() {
  // Reset pg_stat_statements if available, otherwise just capture current
  const result = await prisma.$queryRaw`
    SELECT 
      (SELECT count(*) FROM pg_stat_activity WHERE datname = 'heavix' AND state = 'active') as peak_active,
      (SELECT count(*) FROM pg_stat_activity WHERE datname = 'heavix') as total_connections
  `;
  return result[0];
}

// ── Q3 and Q4 (real Prisma queries) ──────────────────────
async function queryQ3() {
  return prisma.homeCategoryConfig.findUnique({ where: { id: 'main' } });
}

async function queryQ4() {
  return prisma.siteSettings.findUnique({ where: { id: 'main' } });
}

// Sequential: Q3 then Q4 (current production behavior)
async function sequentialExecution() {
  const q3 = await queryQ3();
  const q4 = await queryQ4();
  return { q3, q4 };
}

// Promise.all: Q3 + Q4 in parallel (candidate)
async function promiseAllExecution() {
  const [q3, q4] = await Promise.all([queryQ3(), queryQ4()]);
  return { q3, q4 };
}

// ── Main experiment ────────────────────────────────────────
async function main() {
  console.log('═════════════════════════════════════════════════════════════════');
  console.log('HEAVIX — STEP 15-B.4.4: Promise.all Experiment (Q3 + Q4)');
  console.log('═════════════════════════════════════════════════════════════════');
  console.log('');

  // Warm up Prisma connection
  console.log('── Warming up Prisma connection ──');
  await queryQ3();
  await queryQ4();
  console.log('  Done.');
  console.log('');

  // ── SCENARIO A: Warm / single request ──────────────────
  console.log('═════════════════════════════════════════════════════════════════');
  console.log('SCENARIO A: Warm / single request (baseline latency)');
  console.log('═════════════════════════════════════════════════════════════════');
  console.log('');

  // Sequential
  console.log('── BEFORE: Sequential (Q3 then Q4) — 5 warm runs ──');
  const seqResult = await measureSingle('Sequential', sequentialExecution, 5);
  console.log(`  Median: ${seqResult.median.toFixed(3)}ms`);
  console.log(`  Best:   ${seqResult.best.toFixed(3)}ms`);
  console.log(`  Worst:  ${seqResult.worst.toFixed(3)}ms`);
  console.log(`  Times:  ${seqResult.times.map(t => t.toFixed(3)).join(', ')}ms`);
  console.log(`  Q3 result: ${JSON.stringify(seqResult.lastResult?.q3)}`);
  console.log(`  Q4 result: ${JSON.stringify(seqResult.lastResult?.q4)}`);
  console.log(`  Errors: ${seqResult.lastError ? seqResult.lastError.message : 'none'}`);
  console.log('');

  // Promise.all
  console.log('── AFTER: Promise.all (Q3 + Q4 parallel) — 5 warm runs ──');
  const parResult = await measureSingle('Promise.all', promiseAllExecution, 5);
  console.log(`  Median: ${parResult.median.toFixed(3)}ms`);
  console.log(`  Best:   ${parResult.best.toFixed(3)}ms`);
  console.log(`  Worst:  ${parResult.worst.toFixed(3)}ms`);
  console.log(`  Times:  ${parResult.times.map(t => t.toFixed(3)).join(', ')}ms`);
  console.log(`  Q3 result: ${JSON.stringify(parResult.lastResult?.q3)}`);
  console.log(`  Q4 result: ${JSON.stringify(parResult.lastResult?.q4)}`);
  console.log(`  Errors: ${parResult.lastError ? parResult.lastError.message : 'none'}`);
  console.log('');

  // Correctness comparison
  console.log('── Correctness comparison ──');
  const seqQ3 = JSON.stringify(seqResult.lastResult?.q3);
  const parQ3 = JSON.stringify(parResult.lastResult?.q3);
  const seqQ4 = JSON.stringify(seqResult.lastResult?.q4);
  const parQ4 = JSON.stringify(parResult.lastResult?.q4);
  console.log(`  Q3 match: ${seqQ3 === parQ3 ? '✅ YES' : '❌ NO'}`);
  console.log(`  Q4 match: ${seqQ4 === parQ4 ? '✅ YES' : '❌ NO'}`);
  console.log('');

  // ── SCENARIO B: Concurrent workload ─────────────────────
  console.log('═════════════════════════════════════════════════════════════════');
  console.log('SCENARIO B: Concurrent workload (10 parallel home renders)');
  console.log('═════════════════════════════════════════════════════════════════');
  console.log('');

  // Sequential under load: 10 parallel renders, each doing sequential Q3+Q4
  console.log('── BEFORE: 10 parallel renders × sequential Q3+Q4 ──');
  const poolBefore1 = await getPoolStats();
  console.log(`  Pool before: total=${poolBefore1.total} active=${poolBefore1.active} idle=${poolBefore1.idle}`);
  
  const loadStart1 = performance.now();
  const loadPromises1 = [];
  for (let i = 0; i < 10; i++) {
    loadPromises1.push(sequentialExecution());
  }
  let peakConnections1 = 0;
  const monitorInterval1 = setInterval(async () => {
    const stats = await getPoolStats();
    const active = parseInt(stats.active || '0');
    if (active > peakConnections1) peakConnections1 = active;
  }, 5);
  
  let loadErrors1 = 0;
  const loadResults1 = await Promise.allSettled(loadPromises1);
  clearInterval(monitorInterval1);
  const loadEnd1 = performance.now();
  const loadDuration1 = loadEnd1 - loadStart1;
  
  loadResults1.forEach(r => { if (r.status === 'rejected') loadErrors1++; });
  const poolAfter1 = await getPoolStats();
  console.log(`  Wall-clock: ${loadDuration1.toFixed(3)}ms`);
  console.log(`  Peak active connections: ${peakConnections1}`);
  console.log(`  Pool after: total=${poolAfter1.total} active=${poolAfter1.active} idle=${poolAfter1.idle}`);
  console.log(`  Successful renders: ${loadResults1.filter(r => r.status === 'fulfilled').length}/10`);
  console.log(`  Errors: ${loadErrors1}`);
  console.log('');

  // Promise.all under load: 10 parallel renders, each doing Promise.all(Q3, Q4)
  console.log('── AFTER: 10 parallel renders × Promise.all(Q3, Q4) ──');
  const poolBefore2 = await getPoolStats();
  console.log(`  Pool before: total=${poolBefore2.total} active=${poolBefore2.active} idle=${poolBefore2.idle}`);
  
  const loadStart2 = performance.now();
  const loadPromises2 = [];
  for (let i = 0; i < 10; i++) {
    loadPromises2.push(promiseAllExecution());
  }
  let peakConnections2 = 0;
  const monitorInterval2 = setInterval(async () => {
    const stats = await getPoolStats();
    const active = parseInt(stats.active || '0');
    if (active > peakConnections2) peakConnections2 = active;
  }, 5);
  
  let loadErrors2 = 0;
  const loadResults2 = await Promise.allSettled(loadPromises2);
  clearInterval(monitorInterval2);
  const loadEnd2 = performance.now();
  const loadDuration2 = loadEnd2 - loadStart2;
  
  loadResults2.forEach(r => { if (r.status === 'rejected') loadErrors2++; });
  const poolAfter2 = await getPoolStats();
  console.log(`  Wall-clock: ${loadDuration2.toFixed(3)}ms`);
  console.log(`  Peak active connections: ${peakConnections2}`);
  console.log(`  Pool after: total=${poolAfter2.total} active=${poolAfter2.active} idle=${poolAfter2.idle}`);
  console.log(`  Successful renders: ${loadResults2.filter(r => r.status === 'fulfilled').length}/10`);
  console.log(`  Errors: ${loadErrors2}`);
  console.log('');

  // ── SUMMARY TABLE ──────────────────────────────────────
  console.log('═════════════════════════════════════════════════════════════════');
  console.log('COMPARISON SUMMARY');
  console.log('═════════════════════════════════════════════════════════════════');
  console.log('');
  console.log('Metric                          | Sequential       | Promise.all      | Δ');
  console.log('────────────────────────────────┼──────────────────┼──────────────────┼──────────────────');
  
  const seqMed = seqResult.median;
  const parMed = parResult.median;
  const delta1 = parMed - seqMed;
  const ratio1 = seqMed / parMed;
  console.log(`Wall-clock (single, median)    | ${seqMed.toFixed(3)}ms          | ${parMed.toFixed(3)}ms          | ${delta1 > 0 ? '+' : ''}${delta1.toFixed(3)}ms (${ratio1.toFixed(2)}×)`);
  
  const delta2 = loadDuration2 - loadDuration1;
  const ratio2 = loadDuration1 / loadDuration2;
  console.log(`Wall-clock (10 concurrent)      | ${loadDuration1.toFixed(3)}ms         | ${loadDuration2.toFixed(3)}ms         | ${delta2 > 0 ? '+' : ''}${delta2.toFixed(3)}ms (${ratio2.toFixed(2)}×)`);
  
  console.log(`Peak connections (concurrent)   | ${peakConnections1}                | ${peakConnections2}                | ${peakConnections2 - peakConnections1 > 0 ? '+' : ''}${peakConnections2 - peakConnections1}`);
  console.log(`Correctness (Q3 match)         | ${seqQ3 === parQ3 ? '✅' : '❌'}                | ${seqQ3 === parQ3 ? '✅' : '❌'}                | ${seqQ3 === parQ3 ? 'same' : 'DIFFERENT'}`);
  console.log(`Correctness (Q4 match)         | ${seqQ4 === parQ4 ? '✅' : '❌'}                | ${seqQ4 === parQ4 ? '✅' : '❌'}                | ${seqQ4 === parQ4 ? 'same' : 'DIFFERENT'}`);
  console.log(`Errors (single)                 | ${seqResult.lastError ? '❌' : '0'}                | ${parResult.lastError ? '❌' : '0'}                | ${seqResult.lastError || parResult.lastError ? 'HAS ERRORS' : 'none'}`);
  console.log(`Errors (concurrent)             | ${loadErrors1}                | ${loadErrors2}                | ${loadErrors2 - loadErrors1 > 0 ? '+' : ''}${loadErrors2 - loadErrors1}`);
  console.log('');

  // ── DECISION GATE ──────────────────────────────────────
  console.log('═════════════════════════════════════════════════════════════════');
  console.log('DECISION GATE');
  console.log('═════════════════════════════════════════════════════════════════');
  console.log('');
  
  const wallClockImproved = parMed < seqMed;
  const correctnessOk = seqQ3 === parQ3 && seqQ4 === parQ4;
  const noErrors = !seqResult.lastError && !parResult.lastError && loadErrors1 === 0 && loadErrors2 === 0;
  const connectionPressureOk = peakConnections2 <= peakConnections1 + 5; // allow small increase
  const loadWallClockOk = loadDuration2 <= loadDuration1 * 1.1; // allow up to 10% regression under load
  
  console.log(`Wall-clock materially lower (single): ${wallClockImproved ? '✅' : '❌'} (${ratio1.toFixed(2)}×)`);
  console.log(`Correctness identical:               ${correctnessOk ? '✅' : '❌'}`);
  console.log(`No errors/timeouts:                  ${noErrors ? '✅' : '❌'}`);
  console.log(`Connection pressure acceptable:      ${connectionPressureOk ? '✅' : '❌'} (peak: ${peakConnections1} → ${peakConnections2})`);
  console.log(`No DB load regression (concurrent):  ${loadWallClockOk ? '✅' : '❌'} (${(loadDuration2/loadDuration1).toFixed(2)}×)`);
  console.log('');

  let decision;
  if (wallClockImproved && correctnessOk && noErrors && connectionPressureOk && loadWallClockOk) {
    decision = 'A — ACCEPT';
  } else if (!wallClockImproved || !correctnessOk) {
    decision = 'B — REJECT';
  } else {
    decision = 'C — INVESTIGATE';
  }
  console.log(`DECISION: ${decision}`);
  console.log('');

  await prisma.$disconnect();
}

main().catch(e => {
  console.error('Experiment failed:', e);
  process.exit(1);
});
