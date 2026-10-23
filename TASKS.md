# Live Development Tracker (TASKS.md)

## Project Summary
- **Current Phase**: Phases 4–9 in progress; acceptance criteria remain across every in-progress phase
- **Overall Task Counts by Status**:
  - NOT_STARTED: 0
  - IN_PROGRESS: 6
  - BLOCKED: 0
  - IMPLEMENTED: 0
  - TESTING: 0
  - VERIFIED: 9 (TASK-P0-01, TASK-P1-01, TASK-P1-02, TASK-P1-03, TASK-P1-04, TASK-P1-05, TASK-P2-01, TASK-P2-02, TASK-P3-01)
  - FAILED: 0
- **Verified Features**:
  - Phase 0: Workspace inspection, runtime confirmation, 6 master documentation files.
  - Phase 1: PostgreSQL 16 schema, Prisma migrations, Argon2id/bcrypt auth, JWT access/refresh token rotation, RBAC permission matrix for all 16 roles, multi-tenant row-level isolation, seed data for 2 institutions and 16 roles, React 18 + Vite + Tailwind + TanStack Query client build, and responsive 16-role dashboard shell.
  - Phase 2: Academic years/terms, Grade 10 classes and sections, subjects, teacher allocations, transactional student profile provisioning, and parent-student relationship linking.
  - Phase 3: Course workspaces, modules, rich text lessons, assignment creation with late rules, student submission portal, teacher grading workflow with feedback, and immutable audit event trails.
- **Incomplete Features**:
  - Phase 4: Daily and subject/period attendance, guardian explanation, staff leave, correction approvals, communication UI/API, and basic chronic-absence summary are implemented. Migration application and database-backed verification are pending (TASK-P4-01).
  - Phase 5: Exam setup, schedule roster/marks entry (including pasted CSV import), grade-change queue, publication controls, invigilator rosters, institution grade thresholds, and a printable report-card summary with HMAC verification are implemented. Database workflow verification and visual/browser print verification remain (TASK-P5-01).
  - Phase 6: Fee structure, invoice, collection, waiver, refund-request/review, ledger APIs and finance UI are implemented; provider integration and DB workflow verification remain (TASK-P6-01).
  - Phase 7: Staff leave, library catalog/circulation, and transport routes/vehicles/seat allocations are implemented. Payroll adds effective-dated salary history and monthly gross snapshots restricted to principal and finance head. Hostel now adds blocks/rooms/beds, gate pass lifecycle, visitor in/out logs, and mess charge status. Counseling, hostel residence check-in/out and incident management, finance-ledger integration for mess bills, broader HR, library barcode/copy management, transport stops/documents/incidents, analytics, and DB verification remain (TASK-P7-01).
  - Phase 8: Disposable-PostgreSQL CI workflow now covers migrations, seed, builds and server suite; hosted CI evidence, full security matrix, accessibility, performance and restore tests remain (TASK-P8-01).
  - Phase 9: Production env validation, DB readiness endpoint, CI workflow and operations guide implemented; hosted deployment, monitoring integration and restore drill remain (TASK-P9-01).
- **Failed Tests**: The last focused validation run passed. The full database-backed suite has not been run in this checkpoint because the configured database is not confirmed as isolated and `localhost:5432` is unreachable.
- **Active Blockers**: Database `lms2` from `server/.env` is not confirmed as a dedicated test database; the local PostgreSQL endpoint is unreachable. No migrations or DB tests were run.
- **Phase 5 continuation `0d7f38f` (2026-10-24)**: Added tenant-persisted grade bands with a zero baseline, unique threshold/letter validation, GPA range checks, edit UI, and lower-bound inclusive grade calculation used at publish time; existing grades remain the fallback until a tenant saves a scale. Added signed official printable report card summaries and tenant/ownership-authorized verification; database workflow test now covers configured grades and valid/tampered codes. Evidence: `npx prisma validate`, Prisma generate, server and client production builds passed; four focused files passed 13/13 tests (exam schema, grading boundaries, HMAC alteration checks, production environment validation). Migrations and database workflow assertions were not run; browser print and end-to-end verification not run. Local-only; no remote configured.
- **Phase 7 payroll continuation `ac680a9` (2026-10-24)**: Added effective-dated salary history and month snapshots with decimal totals and staff name/code snapshots, duplicate-period prevention, eligibility by effective date, RBAC plus service role gate limited to institution admin/principal and finance head, audit middleware, and payroll UI. No tax/deduction assumptions are made. Evidence this checkpoint: Prisma validation/generation and backend/client builds passed; five focused test files passed 16/16 tests, including validation and permissions. Payroll DB integration test is added but not run; migration not applied. Local-only; no remote configured.
- **Phase 7 hostel continuation (2026-10-24; commit pending)**: Added unique tenant block/room bed constraints; block/room creation; serializable bed allocation with room capacity and bed collision checks; student resident-only gate-pass requests and warden approve/reject/depart/return; tenant visitor arrival/checkout logs; monthly mess charges with payment-state handling; a connected warden/student UI; RBAC and audited mutations. Added DB workflow assertions for all workflows and pure validation tests. Checks: Prisma validate/generate, server/client builds passed; 18 focused tests across six files passed (includes hostel schema validations). Database workflow was not run and migration was not applied. Mess charges are not posted into the finance ledger, and permanent residence check-in/out/hostel incident management remain outstanding.
- **Latest checkpoint `40d48a1` (2026-10-24)**: Added `ExamInvigilator` persistence/migration, tenant-scoped candidates and schedule roster endpoints, RBAC, audit event middleware, serializable assignment replacement, active-staff validation, and conflicting-time rejection. Exams UI can retrieve and save a schedule's staff roster. Evidence this checkpoint: `npx prisma validate` passed; `npx prisma generate` passed; server TypeScript build passed; client production build passed after fixing target-library compatibility; `npx vitest run tests/exam-schemas.test.ts` passed 5/5. Added database workflow assertions for saved/retrieved invigilators and overlapping assignment rejection to `tests/exams-workflow.test.ts`; not run because PostgreSQL isolation/access remains unverified. Migration not applied. No remote is configured; not pushed.
- **Last Verified Task**: TASK-P3-01 (Core LMS Courses, Modules, Lessons, Assignments & Grading).
- **Exact Next Task to Execute**: Implement confidential counseling cases, encrypted notes, support plans/follow-ups, referrals, and configurable at-risk rules. Then finish hostel check-in/out/incidents, remaining library/transport, and analytics. Once a dedicated isolated PostgreSQL test database is confirmed, apply migrations and run database workflows for Phases 5–7. Do not run DB suites against unidentified database `lms2`.

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
- [ ] **TASK-P4-01**
  - **Requirement IDs**: ATT-001 to ATT-006, COMM-001, COMM-002
  - **Feature**: Attendance Management & Communication System
  - **Implementation Scope**: Daily/subject attendance marking, locking, correction requests, absence alerts, notifications, and secure teacher-parent messaging.
  - **Relevant Files**: `server/src/modules/attendance/*`, `server/src/modules/communication/*`.
  - **Status**: IN_PROGRESS
  - **Implementation update**: Daily and subject-period attendance validate tenant/section/active roster, duplicate students, assigned subject teachers, period bounds, and lock records after submission. Homeroom and subject-period corrections use pending review, maker-checker, tenant scoping, and atomic claims; correction queues are restricted to admin scope or the class teacher's assigned sections. Parent explanations are pending EXCUSED corrections, create in-app alerts for assigned teachers, and require authorized class teacher/admin review. Attendance UI includes daily marking, subject rosters, linked guardian/student history, corrections, and a 90-day summary (10% absence of at least 10 records; excused days excluded). Staff leave requests/reviews are tenant-scoped and audited. Communication pages are connected to announcements, messaging, and notifications APIs. Zod validation covers dates, period and batch bounds, leave ranges, bodies, and route parameters.
  - **Remaining acceptance criteria**: Apply the subject-period migration only to a confirmed isolated test database; database-backed persistence, cross-tenant, role, and full UI workflow verification have not run. Scheduled threshold alerts and external/realtime notification delivery are not configured.
  - **Relevant Files**: `server/prisma/schema.prisma`, `server/prisma/migrations/20261024120000_subject_period_attendance/migration.sql`, `server/src/modules/attendance/*`, `server/src/modules/communication/*`, `server/src/modules/hr/leave.*`, `client/src/pages/AttendancePage.tsx`, `client/src/pages/CommunicationPage.tsx`, `client/src/pages/LeavePage.tsx`, `server/tests/attendance-communication.test.ts`.
  - **Actual Verification Evidence**: `npx prisma validate` passed and Prisma Client generation succeeded. Backend and frontend builds passed. Focused pure validation suite passed 15 tests across 4 files. TypeScript compile-only checks passed for attendance and exam integration test files. Database integration tests were not run: `.env` identifies database `lms2`, not confirmed isolated, and `localhost:5432` is unreachable. Integration cases for subject-period persistence/correction, guardian explanations, and leave approval were added but not executed.
  - **Blocker or Next Action**: After confirming a dedicated test database is available, apply the migration and run Phase 4 API persistence, role, tenant-isolation, and UI workflows; fix any resulting failures.

---

### Phase 5: Examinations & Results
- [ ] **TASK-P5-01**
  - **Requirement IDs**: EXAM-001 to EXAM-006
  - **Feature**: Examination Cycles, Marks Entry, Grade Changes & Report Cards
  - **Implementation Scope**: Exam timetables, marks entry with validation, Maker-Checker grade change workflow, automated GPA/rank calculation, published report cards.
  - **Status**: IN_PROGRESS
  - **Implemented**: Mounted the exams module at `/api/v1/exams`; added Zod-validated session, schedule, marks, grade-change, review, publication, and report-card routes. Added tenant-scoped schedule roster and pending grade-change endpoints. Teachers can view only eligible assigned-subject rosters; submitted marks cannot be directly overwritten; grade corrections are reasoned, pre-publication only, maker-checker approved, atomically claimed, and protected from stale updates. Publication requires schedules, complete assigned rosters, and no pending corrections, then creates report cards with GPA, letter grade, and rank. Added a role-aware exam setup, schedule, marks (single entry and validated pasted CSV), correction, publication, and report-card client page. Added a seeded end-to-end API workflow test, not yet executed because the database is unavailable/unconfirmed isolated.
  - **Relevant Files**: `server/src/modules/exams/*`, `server/src/app.ts`, `server/tests/exam-schemas.test.ts`, `server/tests/exams-workflow.test.ts`, `client/src/pages/ExamsPage.tsx`, `ARCHITECTURE.md`.
  - **Database Changes**: None in this iteration; existing examination schema reused.
  - **Dependencies**: TASK-P1 schema and roles; PostgreSQL required for workflow verification.
  - **Acceptance Criteria**: Only tenant sessions and schedules are visible/mutable; assigned teachers may enter marks once; out-of-range marks are rejected; grade correction cannot be self-approved or applied after publication; publication refuses incomplete marks or pending changes; students/parents see only authorized published report cards.
  - **Required Tests**: Existing integration tests for tenant isolation, mark entry, grade correction, self-approval, and publication; pure schema tests.
  - **Actual Verification Evidence**: `npx vitest run tests/exam-schemas.test.ts` passed (4 tests) as part of the latest 15-test focused run. Backend and frontend builds passed with exam roster endpoints and page. TypeScript compile-only check passed for the exam integration test. Database integration test is written but not run because `localhost:5432` is unreachable and configured DB `lms2` is not confirmed as isolated.
  - **Blocker or Next Action**: Run exam integration workflow on an approved isolated test database. Add invigilator assignment, institution grading scales, and printable report cards per the master requirements.

---

### Phase 6: Fees & Financial Management
- [ ] **TASK-P6-01**
  - **Requirement IDs**: FIN-001 to FIN-007
  - **Feature**: Invoices, Payments, Maker-Checker Waivers & Ledgers
  - **Implementation Scope**: Fee structure setup, student fee invoicing, counter collection (Cash/Cheque/Bank/Online), receipt generation, dual-approval waivers (Clerk Maker → Finance Head Checker), and ledger entries.
  - **Status**: IN_PROGRESS
  - **Implemented**: Added a tenant-scoped fee structure, invoice generation, invoice listing, cash/cheque/bank payment collection, waiver request/review, refund request/review, finance UI, and ledger API. Refund requests reserve remaining payment value, reject unconfigured online-provider refunds, enforce checker roles/maker-checker, and approval reverses invoice balance and posts balanced ledger rows transactionally. Payment and approved waiver posting update invoice balances and create balanced double-entry ledger rows within serializable transactions. Online payments are rejected because provider verification is not integrated. Parent and student invoice lists are limited to linked profiles.
  - **Relevant Files**: `server/src/modules/finance/*`, `server/src/app.ts`, `server/tests/finance-schemas.test.ts`, `ARCHITECTURE.md`.
  - **Database Changes**: Added `FeeRefundRequest` and `RefundStatus` in `server/prisma/schema.prisma`; migration `20261024150000_finance_refunds` must be applied in an approved environment.
  - **Dependencies**: Existing fee and ledger schema; PostgreSQL needed for transaction and concurrency verification.
  - **Acceptance Criteria**: Invoice generation is tenant/class scoped and skips existing invoices; collection cannot exceed balance; online confirmations are rejected; payments and approved waivers update ledger with balanced debits and credits; waiver requester cannot approve own request; parent/student invoice data is scoped.
  - **Required Tests**: Schema tests and DB integration for invoice generation idempotence, partial/full payment, overspend, balanced ledger, refund reservation/reversal, tenant isolation, and maker-checker/concurrency.
  - **Actual Verification Evidence**: `npx prisma validate` passed; Prisma Client generated. `npm run build` passed in `server/` after generation and in `client/`. `npx vitest run tests/finance-schemas.test.ts tests/exam-schemas.test.ts tests/attendance-schemas.test.ts tests/leave-schemas.test.ts` passed (16 tests). `npx tsc --noEmit --pretty false` passed. Added `tests/finance-refund-workflow.test.ts` covering persisted payment/refund, maker-checker rejection, invoice reversal, and balanced ledger; the DB workflow itself was not run because configured DB `lms2` is not confirmed isolated and `localhost:5432` was unreachable at last check.
  - **Blocker or Next Action**: Apply the refund migration and add/run finance transaction integration tests on a confirmed isolated PostgreSQL database. Provider payment/refund integration is not configured and is intentionally rejected.

---

### Phase 7: Auxiliary Modules
- [ ] **TASK-P7-01**
  - **Requirement IDs**: Master Prompt Phase 7
  - **Feature**: HR, Library, Transport, Hostel, Counseling Modules
  - **Implementation Scope**: Functional HR, Library, Transport, Hostel, and Counseling modules; advanced reporting and analytics; documented permissions and scope. Master-prompt acceptance includes staff leaves/payroll, catalog/circulation, transport routes/allocations, hostel beds/gate passes, and restricted counseling records.
  - **Status**: IN_PROGRESS
  - **Implemented**: Activated the library module with tenant-scoped catalog listing/creation, enrolled-student checkout, inventory reservation under serializable transaction, duplicate-loan prevention, student-only own-loan visibility, check-in, and overdue fine calculation using an institution-configured daily rate. Lost-book check-in is rejected. Fine policy is audited and has a dedicated migration. Added tenant-scoped transport route, vehicle/driver, and student seat allocation APIs/UI; allocation verifies enrolled students and route fleet capacity within a serializable transaction, and reassigns existing student allocations without consuming a second seat.
  - **Remaining Acceptance Criteria**: Library barcode lookup/reservations, inventory audits and lost-item recovery; transport stops, vehicle documents, and guardian/student-specific views; payroll; hostel beds/gate passes; confidential counselor workflows; advanced analytics; tenant/RBAC and end-to-end database verification.
  - **Relevant Files**: `server/src/modules/library/*`, `server/src/modules/transport/*`, `server/src/app.ts`, `server/prisma/schema.prisma`, `server/prisma/migrations/20261024170000_library_fines/migration.sql`, `client/src/pages/LibraryPage.tsx`, `client/src/pages/TransportPage.tsx`, `server/tests/library-schemas.test.ts`, `server/tests/transport-schemas.test.ts`.
  - **Verification**: `npx prisma validate` and `npx prisma generate` passed. Server and client production builds passed. `npx vitest run tests/transport-schemas.test.ts tests/library-schemas.test.ts tests/finance-schemas.test.ts tests/exam-schemas.test.ts tests/attendance-schemas.test.ts tests/leave-schemas.test.ts` passed (21 tests). Database-backed checkout/check-in and transport seat-capacity workflows were not run because `lms2` is not confirmed as isolated; integration workflow cases remain to be added/run.
  - **Next Action**: Complete library workflow verification when isolated DB access is available, then implement transport, hostel, payroll, and counseling workflows.

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
