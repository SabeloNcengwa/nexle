#!/usr/bin/env node
/**
 * Lightweight concurrent HTTP baseline (no k6 dependency).
 * Targets public probes only — does not exercise authenticated checkout against production.
 *
 * Usage:
 *   node scripts/load/baseline.mjs
 *   BASE_URL=http://localhost:8080 CONCURRENCY=20 DURATION_MS=15000 node scripts/load/baseline.mjs
 */

const BASE_URL = (process.env.BASE_URL || 'http://127.0.0.1:8080').replace(/\/$/, '');
const CONCURRENCY = Number(process.env.CONCURRENCY || 10);
const DURATION_MS = Number(process.env.DURATION_MS || 10_000);
const PATHS = (process.env.PATHS || '/health,/ready').split(',').map((p) => p.trim());

const stats = {
  ok: 0,
  fail: 0,
  statuses: /** @type {Record<string, number>} */ ({}),
  latencies: /** @type {number[]} */ ([]),
};

async function oneRequest(path) {
  const started = performance.now();
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      headers: { 'x-correlation-id': `load-${Date.now()}` },
    });
    const ms = performance.now() - started;
    stats.latencies.push(ms);
    const key = String(res.status);
    stats.statuses[key] = (stats.statuses[key] || 0) + 1;
    if (res.ok) stats.ok += 1;
    else stats.fail += 1;
  } catch {
    stats.fail += 1;
    stats.statuses.error = (stats.statuses.error || 0) + 1;
    stats.latencies.push(performance.now() - started);
  }
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

async function worker(stopAt) {
  let i = 0;
  while (Date.now() < stopAt) {
    const path = PATHS[i % PATHS.length];
    i += 1;
    await oneRequest(path);
  }
}

const stopAt = Date.now() + DURATION_MS;
const started = Date.now();
await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(stopAt)));
const elapsedMs = Date.now() - started;

const sorted = [...stats.latencies].sort((a, b) => a - b);
const total = stats.ok + stats.fail;
const report = {
  baseUrl: BASE_URL,
  concurrency: CONCURRENCY,
  durationMs: DURATION_MS,
  elapsedMs,
  paths: PATHS,
  total,
  ok: stats.ok,
  fail: stats.fail,
  rps: total / (elapsedMs / 1000),
  latencyMs: {
    p50: Number(percentile(sorted, 50).toFixed(2)),
    p95: Number(percentile(sorted, 95).toFixed(2)),
    p99: Number(percentile(sorted, 99).toFixed(2)),
    max: Number((sorted[sorted.length - 1] || 0).toFixed(2)),
  },
  statuses: stats.statuses,
};

console.log(JSON.stringify(report, null, 2));

if (stats.fail > 0 || total === 0) {
  process.exit(1);
}
