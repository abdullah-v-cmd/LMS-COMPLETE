# Deployment Readiness Checklist (DEPLOYMENT_READINESS_CHECKLIST.md)

- **Application**: Enterprise School Learning Management System & Portal
- **Local Workspace**: `D:\lms2`
- **Target Environments**: Local Development / Staging / Production
- **Database Engine**: PostgreSQL 16 (target database: `lms2`)
- **Cache / Distributed Session Engine**: Redis 7
- **Runtime**: Node.js v20+ / v22 LTS

---

## 1. Readiness Verification Matrix

| Category | Item | Required Criteria | Status | Evidence / Notes |
|---|---|---|---|---|
| **Runtime & Tooling** | Node.js Runtime | Node.js v20.x or v22.x LTS | **VERIFIED** | Local environment running Node 22.10.x. |
| **Runtime & Tooling** | Database Engine | PostgreSQL 16 with TLS support | **VERIFIED** | PostgreSQL 16 running in `lms-postgres-1`. |
| **Runtime & Tooling** | Cache Engine | Redis 7 with alpine footprint | **VERIFIED** | Redis 7 running in `lms-redis-1`. |
| **Environment & Secrets**| Production Validation | Min 32-char unique secrets, no placeholders, HTTPS client URL, TLS DB URL | **VERIFIED** | `server/src/config/env.ts` superRefine validator enforces all constraints. |
| **Database Migrations** | Prisma Migrations | All 17 migrations applied cleanly in order | **VERIFIED** | `npx prisma migrate status` reports schema up to date. |
| **Disaster Recovery** | Database Backup Drill | Witnessed restoration into isolated test database | **VERIFIED** | Successfully restored `/var/lib/postgresql/data/lms2_backup_before_migrate.sql` into temporary `lms2_restore_drill` (53 tables verified, clean cleanup). |
| **Health Checks** | Liveness Endpoint | `GET /api/v1/health` returns 200 UP | **VERIFIED** | Tested and verified in `tests/auth.test.ts`. |
| **Health Checks** | Readiness Endpoint | `GET /api/v1/health/ready` verifies DB and Redis | **VERIFIED** | Returns 200 with DB reachable and Redis connected; returns 503 if DB is down. |
| **Security Controls** | Rate Limiting | Anti-brute-force on `/auth/login` and API | **VERIFIED** | `server/src/middleware/rateLimit.ts` active. |
| **Security Controls** | Token Blacklist | Access token revocation upon logout | **VERIFIED** | Redis token blacklist verified in `tests/redis.test.ts`. |
| **Security Controls** | Multi-Tenancy & RBAC | Zero cross-tenant data leakage | **VERIFIED** | Tested across all 16 roles in `tests/rbac-tenant.test.ts` and `tests/security-audit.test.ts`. |
| **Security Controls** | Invariant Balance | Double-entry debits === credits | **VERIFIED** | Verified in `tests/billing-ledger-invariants.test.ts` and `tests/finance-refund-workflow.test.ts`. |
| **Build Artifacts** | Backend TypeScript | Zero compilation errors | **VERIFIED** | `npm run build:server` emitted clean `dist/`. |
| **Build Artifacts** | Frontend Client | Zero compilation errors | **VERIFIED** | `npm run build:client` built production bundle in 8.5s. |
| **CI Automation** | Local Pipeline Verification | Seed, migrations, tests, builds pass locally | **VERIFIED** | 30 test files passed (127/127 tests). |
| **CI Automation** | Hosted GitHub Actions | Automated runner execution on GitHub | **BLOCKED / NOT RUN** | Strict local git policy (no remote repository configured). |
| **Cloud Hosting** | Staging / Prod Cloud | Provisioned cloud host, custom domain, SSL certs | **BLOCKED / NOT RUN** | Pending hosting provider selection and deployment credentials. |
| **Payment Gateway** | Online Processing | Stripe / Razorpay API keys | **BLOCKED / NOT RUN** | Gateway keys unconfigured; offline payment workflow active and verified. |

---

## 2. Disaster Recovery & Backup Evidence

During Phase 9 readiness verification, a full disaster recovery drill was executed against the local Docker PostgreSQL instance:

1. **Source Backup**: `/var/lib/postgresql/data/lms2_backup_before_migrate.sql` (132.6 KB pre-migration snapshot).
2. **Drill Database**: Created isolated database `lms2_restore_drill`.
3. **Restoration Command**:
   ```bash
   docker exec lms-postgres-1 psql -U lms -d lms2_restore_drill -f /var/lib/postgresql/data/lms2_backup_before_migrate.sql
   ```
4. **Validation Query & Result**:
   ```sql
   SELECT count(*) as total_tables FROM information_schema.tables WHERE table_schema = current_schema();
   -- Output: 53 tables successfully restored
   ```
5. **Teardown**: Isolated drill database dropped cleanly without touching production/development `lms2`.

---

## 3. Production Release Procedure

When production hosting credentials and infrastructure are ready:

1. **Step 1 — Secret Provisioning**:
   Configure environment variables in the cloud secret manager:
   - `NODE_ENV=production`
   - `DATABASE_URL=postgresql://user:pass@host:5432/lms_prod?sslmode=require`
   - `REDIS_URL=redis://default:pass@redis-host:6379`
   - `JWT_ACCESS_SECRET=<random 64-character secret>`
   - `JWT_REFRESH_SECRET=<random 64-character secret>`
   - `REPORT_CARD_SIGNING_SECRET=<random 64-character secret>`
   - `COUNSELING_ENCRYPTION_SECRET=<random 64-character secret>`
   - `CLIENT_URL=https://portal.yourdomain.edu`

2. **Step 2 — Migration Execution**:
   Run database migration release job:
   ```bash
   npm --prefix server run db:deploy
   ```

3. **Step 3 — Application Launch & Readiness Probe**:
   Start container and verify:
   ```bash
   curl -f https://api.yourdomain.edu/api/v1/health/ready
   ```

4. **Step 4 — Client CDN Asset Deployment**:
   Deploy `client/dist/` to high-performance static hosting/CDN configured with HTTPS.
