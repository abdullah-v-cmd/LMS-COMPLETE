# Security & Quality Assurance Audit Report (SECURITY_QA_REPORT.md)

- **Date**: October 2026
- **Target Repository**: `D:\lms2`
- **Scope**: Local backend API (`server/`), database schema (`prisma/schema.prisma`), frontend (`client/`), Redis layer, payment integration, and authentication/authorization controls.
- **Audit Tooling**: Vitest test runner, static AST & regex code inspection, npm audit, and PostgreSQL integrity checks.

---

## 1. Executive Summary

A comprehensive, code-level security and quality assurance audit was conducted across the School Learning Management System (LMS) and Management Portal. The codebase enforces strict multi-tenancy, granular Role-Based Access Control (RBAC) across 16 educational roles, Maker-Checker dual control separation of duties, double-entry general ledger invariants, and cryptographic safeguards for student report cards and confidential counseling records.

During the audit, the following vulnerabilities and security hardening opportunities were identified and remediated with comprehensive automated regression tests:
1. **SEC-01 (Rate Limiting on Authentication & API)**: Implemented sliding-window rate limiting middleware for `/api/v1/auth/login` (15 req/min) and general API (300 req/min) with `Retry-After` header emission.
2. **SEC-02 (Cross-Tenant Scope Validation in LMS)**: Added institution checks to course module creation, lesson creation, assignment submission, and grading to prevent cross-tenant parameter manipulation.
3. **SEC-03 (Academic SIS Foreign-Key Institution Scoping)**: Enforced institution validation when linking sections, student enrollments, and parent relations.
4. **SEC-04 (Redis Token Blacklisting)**: Added Redis 7 integration for distributed token revocation upon logout, rejecting blacklisted access tokens immediately with HTTP 401 `TOKEN_REVOKED`.
5. **SEC-05 (Endpoint Credential Projection Hardening)**: Replaced broad `include: { user: true }` projections in `lms.service.ts`, `students.service.ts`, `academic.service.ts`, and `system.service.ts` with explicit `SAFE_USER_SELECT` objects, preventing any potential exposure of `passwordHash` or `mfaSecret` in API JSON payloads.
6. **SEC-06 (Payment Gateway Credential Protection & Masking)**: Enhanced `BankService` and `FinanceController` so that `gatewayApiKey` is completely omitted for public/student/parent views, and masked (`••••••••••••${last4}`) for administrator views.
7. **SEC-07 (Audit Log API Key & Secret Redaction)**: Upgraded `redactAuditPayload` to systematically sanitize `gatewayApiKey`, `apiKey`, and keys containing `secret`, `token`, or `password` before persisting audit events to PostgreSQL.
8. **SEC-08 (Client-Side Online Payment Assertion Rejection)**: Restricted `recordPaymentSchema` to allow only `CASH`, `CHEQUE`, and `BANK_TRANSFER` for manual payments, preventing client-side forgery of `ONLINE` payments without verified payment provider webhooks.

---

## 2. Findings Matrix

| Finding ID | Severity | Category | Affected Files | Status | Remediation & Evidence |
|---|---|---|---|---|---|
| **SEC-01** | Medium | Brute-Force / DoS | `server/src/middleware/rateLimit.ts`, `app.ts`, `auth.routes.ts` | **VERIFIED** | Added `authRateLimiter` and `apiRateLimiter` returning HTTP 429 `TOO_MANY_REQUESTS`. Tested in `tests/security-audit.test.ts`. |
| **SEC-02** | High | Authorization / Tenant Scoping | `server/src/modules/lms/lms.service.ts`, `lms.controller.ts` | **VERIFIED** | Added `institutionId` parameter and database ownership checks on `createModule`, `createLesson`, `createAssignment`, `submitAssignment`, and `gradeSubmission`. Verified in `tests/security-audit.test.ts`. |
| **SEC-03** | Medium | Tenant Isolation | `server/src/modules/academic/academic.service.ts`, `students.service.ts` | **VERIFIED** | Enforced that referenced `classGradeId`, `sectionId`, and `parentId` belong to the user's institution. Verified in `tests/security-audit.test.ts`. |
| **SEC-04** | Medium | Session Management | `server/src/utils/redis.ts`, `middleware/auth.ts`, `auth.service.ts` | **VERIFIED** | Added Redis token blacklist on logout with automatic in-memory fallback. Verified in `tests/redis.test.ts`. |
| **SEC-05** | High | Credential Leak / Projection | `lms.service.ts`, `students.service.ts`, `academic.service.ts`, `system.service.ts` | **VERIFIED** | Replaced `user: true` with `user: { select: SAFE_USER_SELECT }` across course, student, teacher, and backup queries. Verified in `tests/frontend-leak-and-injection-defense.test.ts`. |
| **SEC-06** | High | Gateway Secret Protection | `bank.service.ts`, `finance.controller.ts` | **VERIFIED** | Non-admins receive bank details without `gatewayApiKey`; admins receive masked key (`••••••••••••${last4}`). Verified in `tests/frontend-leak-and-injection-defense.test.ts`. |
| **SEC-07** | Medium | Audit Log Data Leak | `server/src/middleware/audit.ts` | **VERIFIED** | Sanitizes `gatewayApiKey` and API key patterns to `[REDACTED]` prior to audit logging. Verified in `tests/frontend-leak-and-injection-defense.test.ts`. |
| **SEC-08** | High | Payment Forgery Defense | `server/src/modules/finance/finance.schemas.ts`, `finance.service.ts` | **VERIFIED** | `recordPaymentSchema` strictly rejects `ONLINE` payments. Verified in `tests/finance-schemas.test.ts`. |

---

## 3. Detailed Security Architecture Review

### 3.1 Frontend Isolation & Secret Leak Defense
- **Zero Frontend Secret Leaks**: Verified that `client/src` contains zero database URIs (`postgresql://`), database passwords, JWT secrets, or private API keys.
- **Vite Proxy Architecture**: The client connects to `/api` through a reverse proxy target in development (`vite.config.ts`) and nginx/env routes in production, eliminating client-side exposure of database credentials or server environments.
- **Clean Production Builds**: Frontend builds cleanly (`tsc && vite build`) without bundled environment secrets.

### 3.2 SQL Injection Resistance & Input Sanitization
- **Strict Prisma Parameterization**: Zero instances of `$queryRawUnsafe` or `$executeRawUnsafe` exist in the server codebase. All database interactions utilize prepared statements and Prisma's parameterized engine.
- **Comprehensive Zod Validation**: All route parameters, request bodies, and query strings are validated through strict Zod schemas with UUID, regex, and enum constraints, rejecting SQL injection payloads (`' OR 1=1 --`, `'; DROP TABLE...`) before reaching any database handler.

### 3.3 Payment Gateway & Financial Ledger Security
- **Payment Method Guardrails**: Manual payment collection endpoints require `PERMISSIONS.FEE_COLLECT` (restricted to Finance Head, Fee Clerk, Institution Admin, Super Admin) and only accept verifiable physical/bank instruments (`CASH`, `CHEQUE`, `BANK_TRANSFER`).
- **Client Assertion Rejection**: Direct assertions of `PaymentMethod.ONLINE` by clients are rejected by both Zod schema validation and service-level checks.
- **Double-Entry Ledger Integrity**: Every financial transaction enforces matching debits and credits (`Total Debits === Total Credits`), preventing unbalanced ledger entries.
- **Credential Masking & Omission**: Sensitive gateway credentials (`gatewayApiKey`) are omitted for non-administrative roles and masked for administrators.

### 3.4 Cryptographic & Sensitive Data Controls
- **Password Hashing**: Bcrypt with 12 salt rounds (`server/src/utils/password.ts`).
- **Counseling Note Encryption**: Authenticated AES-256-GCM encryption with tamper detection (`v1:iv:tag:ciphertext`).
- **Report Card Signatures**: HMAC-SHA256 signatures with constant-time verification (`crypto.timingSafeEqual`).

---

## 4. Test Verification Status

- Security & Leak Defense Suite (`tests/frontend-leak-and-injection-defense.test.ts`): **13/13 passed**
- Finance Request Validation Suite (`tests/finance-schemas.test.ts`): **4/4 passed**
- Environment Safeguard Suite (`tests/env-schema.test.ts`): **2/2 passed**
- Report Card Cryptographic Integrity Suite (`tests/report-card-integrity.test.ts`): **2/2 passed**
- Confidential Counseling Encryption Suite (`tests/counseling-encryption.test.ts`): **2/2 passed**
- Frontend Production Build (`npm run build` in `client`): **Clean build (0 errors)**
- Backend TypeScript Compilation (`npm run build` in `server`): **Clean compilation (0 errors)**
