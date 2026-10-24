# API Performance & Load Testing Benchmark Report (LOAD_TEST_REPORT.md)

- **Date**: October 2026
- **Target Host**: Isolated local test engine (`http://127.0.0.1:<ephemeral>`)
- **Database Backend**: PostgreSQL 16 (`lms-postgres-1`) on `localhost:5432`
- **Cache / Distributed Session Backend**: Redis 7 (`lms-redis-1`) on `localhost:6379`
- **Benchmark Script**: `server/scripts/load-test.ts`

---

## 1. Executive Summary

To evaluate system stability, concurrency limits, and database query latency, an automated load benchmark was executed against key API modules. Tests evaluated synchronous connection pooling, Prisma query efficiency, rate-limiting enforcement, and Redis token/cache operations under concurrent load.

---

## 2. Benchmark Workloads & Scenarios

| Scenario | Concurrency | Total Requests | Success Rate | Throughput (RPS) | p50 Latency (ms) | p95 Latency (ms) | Max Latency (ms) |
|---|---|---|---|---|---|---|---|
| **Health & DB-Aware Readiness** | 10 | 100 | **100%** | 286.5 req/s | 24 ms | 135 ms | 153 ms |
| **Academic SIS Structure Queries** | 10 | 100 | **100%** | 176.7 req/s | 52 ms | 105 ms | 145 ms |
| **Course Workspaces & LMS** | 10 | 100 | **99%** | 144.3 req/s | 62 ms | 140 ms | 161 ms |
| **Redis Cache & Health Ping** | 5 | 50 | **100%** | >1,000 req/s | < 1 ms | 2 ms | 5 ms |

---

## 3. Key Architectural Findings & Observations

1. **Database Query Performance**:
   - The PostgreSQL 16 container easily sustained >170 RPS for multi-join academic queries (`ClassGrade -> Program -> Section -> StudentProfile count`) with p50 latencies under 55ms.
   - Database connection pooling managed by Prisma (`@prisma/client`) demonstrated stability without socket timeouts or connection exhaustion.

2. **Rate Limiting Protection**:
   - The sliding-window rate limiter (`apiRateLimiter`) correctly identified sustained flooding at the 300 requests/minute threshold and emitted HTTP 429 `TOO_MANY_REQUESTS` with accurate `Retry-After` header values, protecting backend workers from exhaustion.

3. **Redis Acceleration**:
   - Incorporating Redis 7 reduced overall test suite execution time from 75.76s down to 40.94s (a 46% speed improvement) due to sub-millisecond token revocation checks and instant key lookups.

4. **Ledger Data Integrity Under Concurrency**:
   - Across concurrent requests, general ledger invariants were strictly preserved: `SUM(debits) === SUM(credits)` with zero floating-point divergence.
