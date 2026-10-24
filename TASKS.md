# Live Development Tracker (TASKS.md)

## Project Summary
- **Current Phase**: Phases 0–7 VERIFIED; Phases 8–9 in progress (acceptance criteria remain across external/hosted infrastructure)
- **Overall Task Counts by Status**:
  - NOT_STARTED: 0
  - IN_PROGRESS: 2 (TASK-P8-01, TASK-P9-01)
  - BLOCKED: 0
  - IMPLEMENTED: 0
  - TESTING: 0
  - VERIFIED: 13 (TASK-P0-01, TASK-P1-01 through P1-05, TASK-P2-01, TASK-P2-02, TASK-P3-01, TASK-P4-01, TASK-P5-01, TASK-P6-01, TASK-P7-01)
  - FAILED: 0
- **Verified Features**:
  - Phase 0: Workspace inspection, runtime confirmation, 6 master documentation files.
  - Phase 1: PostgreSQL 16 schema, Prisma migrations, Argon2id/bcrypt auth, JWT access/refresh token rotation, RBAC permission matrix for all 16 roles, multi-tenant row-level isolation, seed data for 2 institutions and 16 roles, React 18 + Vite + Tailwind + TanStack Query client build, and responsive 16-role dashboard shell.
  - Phase 2: Academic years/terms, Grade 10 classes and sections, subjects, teacher allocations, transactional student profile provisioning, and parent-student relationship linking.
  - Phase 3: Course workspaces, modules, rich text lessons, assignment creation with late rules, student submission portal, teacher grading workflow with feedback, and immutable audit event trails.
  - Phase 4: Daily homeroom attendance, subject-period attendance, guardian absence explanations, staff leave request and review, attendance correction requests with Maker-Checker dual governance, and parent absence alert notifications. Verified against PostgreSQL (`tests/attendance-communication.test.ts` 9/9 passing).
  - Phase 5: Examination cycles, schedules, invigilator rosters with time-conflict prevention, section marks roster and marks entry, Maker-Checker grade-change queue, institution grade bands, publication controls, and HMAC-SHA256 cryptographically verifiable student report cards. Verified against PostgreSQL (`tests/exams-workflow.test.ts` 1/1 passing).
  - Phase 6: Student fee invoices, offline payment collection, Maker-Checker waivers and refunds, transport monthly route billing, and balanced double-entry accounting ledgers (Total Debits === Total Credits). Verified against PostgreSQL (`tests/finance-refund-workflow.test.ts` 1/1 passing, `tests/billing-ledger-invariants.test.ts` 20/20 passing).
  - Phase 7: Auxiliary modules verified on PostgreSQL:
    - Transport: Routes, stops, vehicles, vehicle documents, driver assignments, tracking logs, incident reports, seat allocations, daily attendance, idempotent monthly route billing with linked invoices, and balanced ledger entries (`tests/transport-workflow.test.ts` 1/1 passing).
    - Library: Book catalog, barcode tracking (`BookCopy`), queue reservations, copy checkout/check-in, lost-book reporting/recovery, and inventory shelf reconciliation audits (`tests/library-workflow.test.ts` 1/1 passing).
    - Hostel: Blocks, rooms, beds, serializable capacity-aware bed allocations, resident gate passes, visitor logs, monthly mess charges, resident stays check-in/checkout, and room occupancy management (`tests/hostel-workflow.test.ts` 1/1 passing).
    - Counseling: Confidential referrals, AES-256-GCM encrypted titles/reasons/notes/action plans, audit redaction, support plans, and at-risk student threshold rules (`tests/counseling-workflow.test.ts` 1/1 passing).
    - HR & Payroll: Effective-dated compensations, monthly payroll run snapshots, principal access, and auditor restriction (`tests/payroll-workflow.test.ts` 1/1 passing).
    - Analytics: Persisted, role-scoped cross-module analytics API and UI covering dashboard summaries, attendance rates, exam GPAs, fee collections, LMS submissions, transport attendance, library copies, hostel occupancy, and HR metrics (`tests/analytics-workflow.test.ts` 1/1 passing).
- **Incomplete Features**:
  - Phase 8: Hosted CI execution evidence, external load/stress testing, full WCAG accessibility certification with assistive technology, and witnessed disaster recovery restoration remain (TASK-P8-01).
  - Phase 9: Hosted cloud staging deployment, external secret manager integration, external uptime monitoring/alerting, and production backup schedule automation remain (TASK-P9-01).
- **Test Summary**:
  - 28 test files passed (28/28).
  - 116 tests passed (116/116).
  - 0 failed, 0 skipped.
- **Database Status**:
  - PostgreSQL 16 running on `localhost:5432` in Docker container `lms-postgres-1`.
  - Target database: `lms2` (fully migrated with all 17 Prisma migrations applied).
  - Pre-migration backup secured at `/var/lib/postgresql/data/lms2_backup_before_migrate.sql`.
- **Last Verified Tasks**: TASK-P4-01, TASK-P5-01, TASK-P6-01, TASK-P7-01.

---

## Detailed Task Checklist

### Phase 0: Repository Inspection and Planning
- [x] **TASK-P0-01**
  - **Requirement IDs**: N/A
  - **Feature**: Project Governance & Initial Documentation
  - **Implementation Scope**: Inspect workspace, detect runtime environment, create PRD.md, ARCHITECTURE.md, RULES.md, DESIGN.md, TASKS.md, MEMORY.md.
  - **Relevant Files**: `PRD.md`, `ARCHITECTURE.md`, `RULES.md`, `DESIGN.md`, `TASKS.md`, `MEMORY.md`.
  - **Status**: VERIFIED
  - **Actual Verification Evidence**: All 6 master documentation files created and aligned with codebase requirements.

---

### Phase 1: Foundation (Auth, Multi-Tenancy, RBAC, Core Infra)
- [x] **TASK-P1-01**
  - **Requirement IDs**: AUTH-001, AUTH-002, INST-004
  - **Feature**: Backend Infrastructure & Prisma Database Setup
  - **Implementation Scope**: Prisma PostgreSQL schema with models for multi-tenancy, users, academic structure, LMS, exams, finance, and audit events. Initial migration `20261021191751_init`.
  - **Relevant Files**: `server/prisma/schema.prisma`, `server/src/server.ts`, `server/src/app.ts`.
  - **Status**: VERIFIED
  - **Actual Verification Evidence**: `npx prisma migrate dev` executed successfully; database synced.

- [x] **TASK-P1-02**
  - **Requirement IDs**: AUTH-001, AUTH-002, AUTH-003, AUTH-006, AUTH-007
  - **Feature**: Authentication Engine & JWT Token Lifecycle
  - **Implementation Scope**: Login with bcrypt password verification, short-lived 15m JWT access tokens, 7d refresh token rotation and revocation, `/auth/me`, `/auth/logout`.
  - **Relevant Files**: `server/src/modules/auth/*`, `server/src/utils/jwt.ts`, `server/src/utils/password.ts`.
  - **Status**: VERIFIED
  - **Actual Verification Evidence**: `tests/auth.test.ts` (6 tests passing).

- [x] **TASK-P1-03**
  - **Requirement IDs**: AUTH-003, INST-004, AUD-001
  - **Feature**: RBAC, ABAC Engine & Multi-Tenancy Middleware
  - **Implementation Scope**: Central permission catalog for all 16 roles (`PERMISSIONS`, `DEFAULT_ROLE_PERMISSIONS`), `requireTenant` and `requirePermission` middlewares, automated `AuditEvent` capture.
  - **Relevant Files**: `server/src/constants/permissions.ts`, `server/src/middleware/tenant.ts`, `server/src/middleware/rbac.ts`, `server/src/middleware/audit.ts`.
  - **Status**: VERIFIED
  - **Actual Verification Evidence**: `tests/rbac-tenant.test.ts` (5 tests passing cross-tenant denial and RBAC checks).

- [x] **TASK-P1-04**
  - **Requirement IDs**: N/A
  - **Feature**: Seed Database with Multi-Tenant Fixtures & All 16 Roles
  - **Implementation Scope**: `server/prisma/seed.ts` seeding Alpha Academy and Beta Institute, 16 user role accounts, Grade 10 academic structure, and Math course.
  - **Relevant Files**: `server/prisma/seed.ts`.
  - **Status**: VERIFIED
  - **Actual Verification Evidence**: `npx tsx prisma/seed.ts` executed cleanly without errors.

- [x] **TASK-P1-05**
  - **Requirement IDs**: N/A
  - **Feature**: Frontend Client Foundation (Vite, React, Tailwind, TanStack Query, Auth Store)
  - **Implementation Scope**: React 18 SPA with Vite, Tailwind CSS, TanStack Query, Axios with automatic token refresh interceptor, AuthProvider, role-aware Sidebar, Header, LoginPage with quick 16-role switcher, and 16 distinct role dashboard layouts.
  - **Relevant Files**: `client/src/*`.
  - **Status**: VERIFIED
  - **Actual Verification Evidence**: `npm run build` in `client/` succeeded with zero errors (`dist/index.html` and bundles built in 18s).

---

### Phase 2: Institution & Academic Structure
- [x] **TASK-P2-01**
  - **Requirement IDs**: INST-001, INST-002, INST-003, ACAD-001, ACAD-002, ACAD-003
  - **Feature**: Academic Setup (Programs, Classes, Sections, Subjects, Teacher Assignments)
  - **Implementation Scope**: Endpoints for academic years, class grades, sections, subjects, and teacher allocations.
  - **Relevant Files**: `server/src/modules/academic/*`.
  - **Status**: VERIFIED
  - **Actual Verification Evidence**: Verified in `tests/academic-sis.test.ts`.

- [x] **TASK-P2-02**
  - **Requirement IDs**: STU-001, STU-002, STU-003, STU-004, STU-005
  - **Feature**: Student Information System (SIS) & Parent Linking
  - **Implementation Scope**: Student roster querying, transactional student account creation, and parent-student relationship linking.
  - **Relevant Files**: `server/src/modules/students/*`.
  - **Status**: VERIFIED
  - **Actual Verification Evidence**: Verified in `tests/academic-sis.test.ts`.

---

### Phase 3: Core LMS
- [x] **TASK-P3-01**
  - **Requirement IDs**: LMS-001, LMS-002, LMS-003, LMS-004, LMS-005
  - **Feature**: Courses, Modules, Lessons & Assignments
  - **Implementation Scope**: Role-scoped course listings, hierarchical lesson explorer, assignment submissions, rubric grading with feedback, and audit logs.
  - **Relevant Files**: `server/src/modules/lms/*`.
  - **Status**: VERIFIED
  - **Actual Verification Evidence**: `tests/lms.test.ts` (4 tests passing).

---

### Phase 4: Attendance & Communications
- [x] **TASK-P4-01**
  - **Requirement IDs**: ATT-001 to ATT-006, COMM-001, COMM-002
  - **Feature**: Attendance Management & Communication System
  - **Implementation Scope**: Daily/subject attendance marking, locking, correction requests, absence alerts, notifications, and secure teacher-parent messaging.
  - **Relevant Files**: `server/src/modules/attendance/*`, `server/src/modules/communication/*`.
  - **Status**: VERIFIED
  - **Implementation update**: Daily and subject-period attendance validate tenant/section/active roster, duplicate students, assigned subject teachers, period bounds, and lock records after submission. Homeroom and subject-period corrections use pending review, maker-checker, tenant scoping, and atomic claims; correction queues are restricted to admin scope or the class teacher's assigned sections. Parent explanations are pending EXCUSED corrections, create in-app alerts for assigned teachers, and require authorized class teacher/admin review. Attendance UI includes daily marking, subject rosters, linked guardian/student history, corrections, and a 90-day summary (10% absence of at least 10 records; excused days excluded). Staff leave requests/reviews are tenant-scoped and audited. Communication pages are connected to announcements, messaging, and notifications APIs. Zod validation covers dates, period and batch bounds, leave ranges, bodies, and route parameters.
  - **Relevant Files**: `server/prisma/schema.prisma`, `server/prisma/migrations/20261024120000_subject_period_attendance/migration.sql`, `server/src/modules/attendance/*`, `server/src/modules/communication/*`, `server/src/modules/hr/leave.*`, `client/src/pages/AttendancePage.tsx`, `client/src/pages/CommunicationPage.tsx`, `client/src/pages/LeavePage.tsx`, `server/tests/attendance-communication.test.ts`.
  - **Actual Verification Evidence**: `npx prisma migrate deploy` applied `20261024120000_subject_period_attendance`. Full database-backed integration test suite passed: `tests/attendance-communication.test.ts` (9/9 tests passed). Verified daily attendance marking, parent absence alerts, parent child-attendance viewing, teacher correction requests, Maker-Checker self-approval rejection for both teacher and principal, principal review approval, subject-period attendance, guardian absence justification, and staff leave request & review.

---

### Phase 5: Examinations & Results
- [x] **TASK-P5-01**
  - **Requirement IDs**: EXAM-001 to EXAM-006
  - **Feature**: Examination Cycles, Marks Entry, Grade Changes & Report Cards
  - **Implementation Scope**: Exam timetables, marks entry with validation, Maker-Checker grade change workflow, automated GPA/rank calculation, published report cards.
  - **Status**: VERIFIED
  - **Implemented**: Mounted the exams module at `/api/v1/exams`; added Zod-validated session, schedule, marks, grade-change, review, publication, and report-card routes. Added tenant-scoped schedule roster and pending grade-change endpoints. Teachers can view only eligible assigned-subject rosters; submitted marks cannot be directly overwritten; grade corrections are reasoned, pre-publication only, maker-checker approved, atomically claimed, and protected from stale updates. Publication requires schedules, complete assigned rosters, and no pending corrections, then creates report cards with GPA, letter grade, and rank. Added a role-aware exam setup, schedule, marks (single entry and validated pasted CSV), correction, publication, and report-card client page.
  - **Relevant Files**: `server/src/modules/exams/*`, `server/src/app.ts`, `server/tests/exam-schemas.test.ts`, `server/tests/exams-workflow.test.ts`, `client/src/pages/ExamsPage.tsx`, `ARCHITECTURE.md`.
  - **Acceptance Criteria**: Only tenant sessions and schedules are visible/mutable; assigned teachers may enter marks once; out-of-range marks are rejected; grade correction cannot be self-approved or applied after publication; publication refuses incomplete marks or pending changes; students/parents see only authorized published report cards.
  - **Actual Verification Evidence**: Migrations applied (`20261024180000_exam_invigilators`, `20261024190000_institution_grade_bands`, `20261024200000_report_card_signatures`). `tests/exams-workflow.test.ts` passed (1/1 suite, all assertions passing). Verified exam session creation, timetable schedule, invigilator assignments, schedule overlap conflict rejection, section marks roster, complete marks entry, duplicate rejection, grade change request, principal approval, institution grading scale configuration, results publication, and HMAC-SHA256 signature verification.

---

### Phase 6: Fees & Financial Management
- [x] **TASK-P6-01**
  - **Requirement IDs**: FIN-001 to FIN-007
  - **Feature**: Invoices, Payments, Maker-Checker Waivers, Refunds, Transport Billing & Double-Entry Ledgers
  - **Implementation Scope**: Fee structure setup, student fee invoicing, counter collection (Cash/Cheque/Bank), receipt generation, dual-approval waivers (Clerk Maker → Finance Head Checker), refund lifecycle, transport monthly route billing, and balanced double-entry accounting ledger entries.
  - **Status**: VERIFIED
  - **Implemented**: Added tenant-scoped fee structures, invoice generation, cash/cheque/bank payment collection, waiver request/review, refund request/review, transport monthly billing integration, finance UI, and ledger API.
    - **Balanced Double-Entry Postings**: Every journal transaction strictly balances Total Debits === Total Credits:
      - Standard Invoice: Debit `1100-ACCOUNTS-RECEIVABLE`, Credit `4000-FEE-REVENUE`.
      - Transport Invoice: Debit `1100-ACCOUNTS-RECEIVABLE`, Credit `4010-TRANSPORT-REVENUE`.
      - Payment: Debit `1000-CASH`/`1010-CHEQUE-CLEARING`/`1020-BANK`, Credit `1100-ACCOUNTS-RECEIVABLE`.
      - Waiver: Debit `5000-FEE-DISCOUNTS`, Credit `1100-ACCOUNTS-RECEIVABLE`.
      - Refund: Debit `1100-ACCOUNTS-RECEIVABLE`, Credit `1000-CASH`/`1010-CHEQUE-CLEARING`/`1020-BANK`.
    - **Billing Idempotency & Race Handling**: Transport charges derive amounts strictly from `TransportRoute.monthlyFee` under serializable transactions, enforce DB unique constraint `(allocationId, period)` and unique invoice link `transportChargeId`, handle concurrent race conditions (`P2002`/`40001`), and self-heal missing invoices.
    - **Maker-Checker Dual Governance**: Self-approval for waivers and refunds is strictly blocked at the service level; authorized checkers are restricted to `ROLE_FINANCE_HEAD`, `ROLE_INSTITUTION_ADMIN`, `ROLE_SUPER_ADMIN`.
  - **Relevant Files**: `server/src/modules/finance/*`, `server/src/modules/transport/transport.service.ts`, `server/src/app.ts`, `server/tests/finance-schemas.test.ts`, `server/tests/billing-ledger-invariants.test.ts`, `server/tests/transport-workflow.test.ts`, `ARCHITECTURE.md`.
  - **Actual Verification Evidence**: Migrations applied (`20261024150000_finance_refunds`, `20261025000300_transport_attendance_billing`). Pure invariant suite `tests/billing-ledger-invariants.test.ts` passed (20/20 tests). Database integration suite `tests/finance-refund-workflow.test.ts` passed (1/1 suite, offline payment collection, refund request, Maker-Checker self-approval rejection (403), Finance Head review approval (200), invoice balance recalculation, and balanced ledger entries Total Debits === Total Credits).

---

### Phase 7: Auxiliary Modules
- [x] **TASK-P7-01**
  - **Requirement IDs**: Master Prompt Phase 7
  - **Feature**: HR, Library, Transport, Hostel, Counseling, and Reporting/Analytics Modules
  - **Implementation Scope**: Functional HR, Library, Transport, Hostel, Counseling, and cross-module persisted analytics modules; documented permissions and scope. Master-prompt acceptance includes staff leaves/payroll, catalog/circulation/barcode/reservations/audits, transport routes/stops/allocations/attendance/billing, hostel beds/gate passes/mess charges/incidents/stays, restricted counseling records, and role-scoped analytics.
  - **Status**: VERIFIED
  - **Implemented**:
    - **Library**: Catalog and copy barcode tracking (`BookCopy`), checkout/check-in, reservation queues (`LibraryReservation`), renewals and eligibility rules, lost-book reporting/recovery, inventory audits (`LibraryInventoryAudit`), fine policies, and circulation reporting.
    - **Hostel**: Blocks, rooms, beds, serializable capacity-aware allocations (`HostelBedAllocation`), gate passes, visitor logs, mess charges, incidents, and residency check-in/out stays.
    - **Transport**: Routes, stops, vehicles, documents, driver assignments, GPS tracking, incidents, seat allocations, daily transport attendance (`TransportAttendance`), and monthly route billing (`TransportMonthlyCharge`) generating linked finance invoices and balanced ledger entries.
    - **HR & Payroll**: Staff leave requests/reviews, effective-dated compensations (`StaffCompensation`), and immutable monthly gross payroll runs (`PayrollRun`).
    - **Counseling**: Section/parent referrals, AES-256-GCM encrypted notes and support plans, audit redaction, and at-risk rule thresholds.
    - **Analytics & Reporting**: Persisted, role-scoped aggregation endpoints (`/api/v1/analytics/*`) covering dashboard summary, attendance rates and 90-day daily series, exam results and GPAs, financial collections and defaulters, LMS course submissions, transport attendance and billing, library copy status and audits, hostel occupancy and mess charges, and HR teacher counts and leave metrics. Connected to client `AnalyticsPage` and sidebar.
  - **Relevant Files**: `server/src/modules/analytics/*`, `server/src/modules/library/*`, `server/src/modules/transport/*`, `server/src/modules/hostel/*`, `server/src/modules/payroll/*`, `server/src/modules/counseling/*`, `server/src/app.ts`, `server/prisma/schema.prisma`, `client/src/pages/AnalyticsPage.tsx`, `client/src/App.tsx`, `client/src/components/Sidebar.tsx`, `server/tests/analytics-schemas.test.ts`, `server/tests/analytics-workflow.test.ts`.
  - **Actual Verification Evidence**: All Phase 7 migrations applied cleanly via `npx prisma migrate deploy`. Database workflow test suites all passing against PostgreSQL:
    - Transport: `tests/transport-workflow.test.ts` (1/1 passed)
    - Library: `tests/library-workflow.test.ts` (1/1 passed)
    - Hostel: `tests/hostel-workflow.test.ts` (1/1 passed)
    - Counseling: `tests/counseling-workflow.test.ts` (1/1 passed)
    - Payroll: `tests/payroll-workflow.test.ts` (1/1 passed)
    - Analytics: `tests/analytics-workflow.test.ts` (1/1 passed)
    - Schemas: `library-schemas.test.ts` (7/7), `transport-schemas.test.ts` (4/4), `hostel-schemas.test.ts` (3/3), `counseling-schemas.test.ts` (2/2), `payroll-schemas.test.ts` (3/3), `analytics-schemas.test.ts` (13/13) all passed.

---

### Phase 8: Security & Quality Assurance
- [ ] **TASK-P8-01**
  - **Requirement IDs**: Master Prompt Phase 8
  - **Feature**: Security and quality assurance
  - **Implementation Scope**: Cross-tenant access testing; role-permission matrix verification; business workflow tests; performance checks; accessibility review; dependency checks; backup/restoration tests; error handling/recovery tests; documented verification report with unresolved issues.
  - **Status**: IN_PROGRESS
  - **Implemented**: Added `.github/workflows/ci.yml` with a job-scoped disposable PostgreSQL 16 service, migrations, seed, server/client builds, and the full server test suite. Upgraded React Router and Zod to the patched versions found by npm audit. CI does not access local or production databases.
  - **Remaining**: Hosted CI execution evidence; comprehensive role/tenant matrix; performance/load checks; WCAG audit; backup/restore drill; and recovery verification. Full audit still reports 9 development-toolchain vulnerabilities (including 2 critical and 1 high); audit fix requires major Vitest/Vite/Tailwind upgrades. Production dependency audit is clear.
  - **Evidence**: Workflow committed locally; no hosted runner was available to execute it during this checkpoint. Focused non-database schemas/env validation ran locally: 23 passing tests across 7 files. Server and client builds passed after patched runtime dependencies. `npm audit --omit=dev --registry=https://registry.npmjs.org` reported 0 vulnerabilities. Database-backed RBAC, tenant, and workflow suites were not run against local `lms2`.

### Phase 9: Deployment Readiness
- [ ] **TASK-P9-01**
  - **Requirement IDs**: Master Prompt Phase 9
  - **Feature**: Production and deployment readiness
  - **Implementation Scope**: Production configuration; secure environment setup; CI/CD; database migration strategy; backup/restoration instructions; monitoring/health checks; deployment and rollback instructions; administrator/user documentation; documented remaining prerequisites.
  - **Status**: IN_PROGRESS
  - **Implemented**: Production env validation requires unique 32-character non-default JWT secrets, HTTPS client origin, and PostgreSQL URL with TLS. Added DB-aware readiness check and `DEPLOYMENT.md` for release, migration, backup/restore, monitoring, rollback and limitations.
  - **Remaining**: Hosting/container release configuration, secret manager, production monitoring/alerts, backup schedule and witnessed restore drill. No deployment has been performed.
  - **Verification**: Server/client production builds pass after readiness, environment, and patched runtime dependency changes; Prisma schema validation passes. `tests/env-schema.test.ts` passes production security validation cases. Production dependency audit is clear. No hosted deployment or CI execution is claimed.
