# Security & Quality Assurance Audit Report (SECURITY_QA_REPORT.md)

- **Date**: October 2026
- **Target Repository**: `D:\lms2`
- **Scope**: Local backend API (`server/`), database schema (`prisma/schema.prisma`), frontend (`client/`), Redis layer, and authentication/authorization controls.
- **Audit Tooling**: Vitest test runner (30 suites, 127 tests), static code inspection, npm audit, and PostgreSQL integrity checks.

---

## 1. Executive Summary

A comprehensive, code-level security and quality assurance audit was conducted across the School Learning Management System (LMS) and Management Portal. The codebase enforces strict multi-tenancy, granular Role-Based Access Control (RBAC) across 16 educational roles, Maker-Checker dual control separation of duties, double-entry general ledger invariants, and cryptographic safeguards for student report cards and confidential counseling records.

During the audit, three security hardening opportunities were identified and corrected with regression tests:
1. **SEC-01 (Rate Limiting on Authentication & API)**: Implemented sliding-window rate limiting middleware for `/api/v1/auth/login` (15 req/min) and general API (300 req/min) with `Retry-After` header emission.
2. **SEC-02 (Cross-Tenant Scope Validation in LMS)**: Added institution checks to course module creation, lesson creation, assignment submission, and grading to prevent cross-tenant parameter manipulation.
3. **SEC-03 (Academic SIS Foreign-Key Institution Scoping)**: Enforced institution validation when linking sections, student enrollments, and parent relations.
4. **SEC-04 (Redis Token Blacklisting)**: Added Redis 7 integration for distributed token revocation upon logout, rejecting blacklisted access tokens immediately with HTTP 401 `TOKEN_REVOKED`.

---

## 2. Findings Matrix

| Finding ID | Severity | Category | Affected Files | Status | Remediation & Evidence |
|---|---|---|---|---|---|
| **SEC-01** | Medium | Brute-Force / DoS | `server/src/middleware/rateLimit.ts`, `app.ts`, `auth.routes.ts` | **VERIFIED** | Added `authRateLimiter` and `apiRateLimiter` returning HTTP 429 `TOO_MANY_REQUESTS`. Tested in `tests/security-audit.test.ts`. |
| **SEC-02** | High | Authorization / Tenant Scoping | `server/src/modules/lms/lms.service.ts`, `lms.controller.ts` | **VERIFIED** | Added `institutionId` parameter and database ownership checks on `createModule`, `createLesson`, `createAssignment`, `submitAssignment`, and `gradeSubmission`. Verified in `tests/security-audit.test.ts`. |
| **SEC-03** | Medium | Tenant Isolation | `server/src/modules/academic/academic.service.ts`, `students.service.ts` | **VERIFIED** | Enforced that referenced `classGradeId`, `sectionId`, and `parentId` belong to the user's institution. Verified in `tests/security-audit.test.ts`. |
| **SEC-04** | Medium | Session Management | `server/src/utils/redis.ts`, `middleware/auth.ts`, `auth.service.ts` | **VERIFIED** | Added Redis token blacklist on logout with automatic in-memory fallback. Verified in `tests/redis.test.ts`. |

---

## 3. Detailed Security Architecture Review

### 3.1 Authentication & Password Handling
- **Password Hashing**: Bcrypt with 12 salt rounds (`server/src/utils/password.ts`). Tested with regex prefix `/^\$2[aby]\$12\$/`.
- **JWT Lifecycles**: 15-minute access tokens signed with `JWT_ACCESS_SECRET`; 7-day refresh tokens hashed with SHA-256 (`tokenHash`) and stored in PostgreSQL.
- **Token Rotation & Revocation**: Refresh tokens are rotated on each use with `replacedByToken` tracking. Logged out access tokens are blacklisted in Redis.
- **Account Status**: Every authenticated request verifies `user.isActive` in PostgreSQL.

### 3.2 Multi-Tenant Isolation & RBAC
- **Tenant Middleware (`requireTenant`)**: Institutional users are strictly scoped to `req.user.institutionId`. Cross-tenant query parameters or path params attempting access to other institutions trigger HTTP 403 `CROSS_TENANT_ACCESS_DENIED`.
- **RBAC Matrix (`requirePermission`)**: 16 roles mapped to explicit permission sets in `server/src/constants/permissions.ts`.

### 3.3 Cryptographic Controls
- **Counseling Data Encryption**: AES-256-GCM authenticated encryption (`v1:iv:tag:ciphertext`). Detects tampering and key mismatch. Tested in `tests/counseling-encryption.test.ts`.
- **Report Card Tamper-Proofing**: HMAC-SHA256 signatures generated over canonicalized student results. Constant-time comparison using `crypto.timingSafeEqual` prevents timing attacks. Tested in `tests/report-card-integrity.test.ts`.

### 3.4 Maker-Checker Governance & Double-Entry Accounting
- **Attendance Corrections**: Dual-control rule prevents self-review of teacher attendance corrections (`attendance.service.ts`).
- **Grade Moderation**: Teachers cannot moderate their own grade correction requests (`exams.service.ts`).
- **Fee Waivers & Refunds**: Requester cannot approve their own financial waiver or offline refund (`finance.service.ts`).
- **Accounting Ledger**: Every financial transaction posts balanced debits and credits (`Total Debits === Total Credits`). Tested in `tests/billing-ledger-invariants.test.ts` (20/20 passing).

### 3.5 Audit Logging & Data Redaction
- All state mutations trigger `AuditEvent` records in PostgreSQL.
- Sensitive fields (`password`, `passwordHash`, `token`, `secret`, `notes`, `actionPlan`) are systematically redacted to `[REDACTED]` prior to JSON serialization. Tested in `tests/security-audit.test.ts`.

---

## 4. Test Verification Status

- Total Test Suites: **30 passed (30/30)**
- Total Automated Tests: **127 passed (127/127)**
- Test Failures: **0**
- Test Skips: **0**
- Security Regression Suite (`tests/security-audit.test.ts`): **8/8 passed**
- Redis Integration Suite (`tests/redis.test.ts`): **3/3 passed**
