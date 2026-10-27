import http from 'http';
import { createApp } from '../src/app';
import { prisma } from '../src/utils/prisma';

interface ScenarioResult {
  scenario: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  errorRatePercent: number;
  durationMs: number;
  throughputRps: number;
  minLatencyMs: number;
  avgLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  maxLatencyMs: number;
}

const calculatePercentiles = (latencies: number[]) => {
  if (latencies.length === 0) return { min: 0, avg: 0, p50: 0, p95: 0, p99: 0, max: 0 };
  const sorted = [...latencies].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const avg = sum / sorted.length;
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const p50 = sorted[Math.floor(sorted.length * 0.5)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const p99 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.99))];
  return { min, avg: Math.round(avg * 10) / 10, p50, p95, p99, max };
};

async function executeConcurrentWorkload(
  name: string,
  totalRequests: number,
  concurrency: number,
  workerFn: (index: number) => Promise<boolean>
): Promise<ScenarioResult> {
  const latencies: number[] = [];
  let successCount = 0;
  let failureCount = 0;
  let currentIndex = 0;

  const startTime = Date.now();

  const worker = async () => {
    while (true) {
      const idx = currentIndex++;
      if (idx >= totalRequests) break;

      const t0 = performance.now();
      try {
        const ok = await workerFn(idx);
        const t1 = performance.now();
        latencies.push(Math.round(t1 - t0));
        if (ok) successCount++;
        else failureCount++;
      } catch {
        const t1 = performance.now();
        latencies.push(Math.round(t1 - t0));
        failureCount++;
      }
    }
  };

  const pool = Array.from({ length: concurrency }, () => worker());
  await Promise.all(pool);

  const durationMs = Date.now() - startTime;
  const throughputRps = Math.round((totalRequests / (durationMs / 1000)) * 10) / 10;
  const percentiles = calculatePercentiles(latencies);

  return {
    scenario: name,
    totalRequests,
    successfulRequests: successCount,
    failedRequests: failureCount,
    errorRatePercent: Math.round((failureCount / totalRequests) * 1000) / 10,
    durationMs,
    throughputRps,
    minLatencyMs: percentiles.min,
    avgLatencyMs: percentiles.avg,
    p50LatencyMs: percentiles.p50,
    p95LatencyMs: percentiles.p95,
    p99LatencyMs: percentiles.p99,
    maxLatencyMs: percentiles.max,
  };
}

async function runLoadBenchmark() {
  console.log('====================================================');
  console.log('   LMS PERFORMANCE & LOAD BENCHMARK (LOCAL ENGINE)  ');
  console.log('====================================================');

  await prisma.$connect();
  const app = createApp();
  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address() as any;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  console.log(`Server ephemeral test port: ${baseUrl}`);

  // Authenticate fixtures
  const loginRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usernameOrEmail: 'principal@alpha.edu', password: 'Password123!' }),
  });
  const loginData = await loginRes.json();
  const principalToken = loginData.data?.accessToken;
  const institutionId = loginData.data?.user?.institutionId;

  if (!principalToken) {
    throw new Error('Failed to obtain principal authentication token for load test');
  }

  const results: ScenarioResult[] = [];

  // Scenario 1: Health & Readiness Check
  console.log('\n[1/5] Benchmarking Health & DB-Aware Readiness (100 reqs, concurrency 10)...');
  results.push(
    await executeConcurrentWorkload('Health & Readiness', 100, 10, async (idx) => {
      const endpoint = idx % 2 === 0 ? '/api/v1/health' : '/api/v1/health/ready';
      const res = await fetch(`${baseUrl}${endpoint}`);
      return res.status === 200;
    })
  );

  // Scenario 2: Academic & Student SIS retrieval
  console.log('[2/5] Benchmarking Academic SIS Structure (100 reqs, concurrency 10)...');
  results.push(
    await executeConcurrentWorkload('Academic Structure & SIS', 100, 10, async () => {
      const res = await fetch(`${baseUrl}/api/v1/academic/classes`, {
        headers: { Authorization: `Bearer ${principalToken}` },
      });
      return res.status === 200;
    })
  );

  // Scenario 3: Course & LMS Catalog
  console.log('[3/5] Benchmarking Courses & LMS Workspaces (100 reqs, concurrency 10)...');
  results.push(
    await executeConcurrentWorkload('Course Workspaces & LMS', 100, 10, async () => {
      const res = await fetch(`${baseUrl}/api/v1/lms/courses`, {
        headers: { Authorization: `Bearer ${principalToken}` },
      });
      return res.status === 200;
    })
  );

  // Scenario 4: Cross-Module Persisted Analytics Aggregations
  console.log('[4/5] Benchmarking Persisted Analytics Aggregations (50 reqs, concurrency 5)...');
  results.push(
    await executeConcurrentWorkload('Analytics Dashboard Engine', 50, 5, async (idx) => {
      const subpath = idx % 2 === 0 ? 'dashboard' : 'attendance';
      const res = await fetch(`${baseUrl}/api/v1/analytics/${subpath}`, {
        headers: { Authorization: `Bearer ${principalToken}` },
      });
      return res.status === 200;
    })
  );

  // Scenario 5: Financial Ledger Consistency Verification Under Concurrency
  console.log('[5/5] Benchmarking Ledger Invariant Balance Audits (50 reqs, concurrency 5)...');
  results.push(
    await executeConcurrentWorkload('Ledger Balance Audit', 50, 5, async () => {
      const entries = await prisma.generalLedgerEntry.findMany({
        where: { institutionId },
        select: { debitAmount: true, creditAmount: true },
      });
      const debits = entries.reduce((s: number, e: { debitAmount: any; }) => s + Number(e.debitAmount), 0);
      const credits = entries.reduce((s: number, e: { creditAmount: any; }) => s + Number(e.creditAmount), 0);
      return Math.abs(debits - credits) < 0.001;
    })
  );

  // Close server and disconnect
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await prisma.$disconnect();

  console.log('\n====================================================');
  console.log('              LOAD BENCHMARK SUMMARY               ');
  console.log('====================================================');
  console.table(
    results.map((r) => ({
      Scenario: r.scenario,
      Reqs: r.totalRequests,
      'Success%': `${Math.round(((r.successfulRequests / r.totalRequests) * 100) * 10) / 10}%`,
      'RPS': r.throughputRps,
      'p50 (ms)': r.p50LatencyMs,
      'p95 (ms)': r.p95LatencyMs,
      'p99 (ms)': r.p99LatencyMs,
      'Max (ms)': r.maxLatencyMs,
    }))
  );

  // Write results JSON for reporting
  const fs = await import('fs');
  fs.writeFileSync('load-test-results.json', JSON.stringify(results, null, 2), 'utf-8');
  console.log('\nResults written to load-test-results.json');
}

runLoadBenchmark().catch((err) => {
  console.error('Load benchmark failed:', err);
  process.exit(1);
});
