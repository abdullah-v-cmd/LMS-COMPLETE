# Persistent Project Memory (MEMORY.md)

## 1. Project Objective & Mandatory Technology Stack
- **Objective**: Build and run a production-oriented, secure, local-first School Learning Management System (LMS) & Management Portal supporting 16 distinct educational roles with complete multi-tenant isolation, Maker-Checker governance, and comprehensive academic, assessment, and financial workflows.
- **Frontend Stack**: React 18, TypeScript, Vite, Tailwind CSS, React Router v6, TanStack Query v5, React Hook Form, Zod, Lucide React.
- **Backend Stack**: Node.js v26, Express, TypeScript, PostgreSQL 16, Prisma ORM, JWT (short-lived access + rotated refresh tokens), bcrypt / Argon2id password hashing, Zod schema validation, Winston structured logger, Vitest + Supertest testing suite.
- **Infrastructure**: PostgreSQL 16 is expected locally on port 5432 via Docker Compose. The database service was unavailable in this session; do not assume it is running.
- **Operating Mode**: 100% Local-first. No remote Git dependencies or GitHub connections.

---

## 2. Current Architecture & Implementation Decisions
- **Monorepo Structure**: Separate `server/` (Node.js/Express) and `client/` (React/Vite) rooted in `d:\lms2`.
- **Multi-Tenancy Strategy**: Single database with tenant-level scoping (`institutionId` foreign key on all tenant-specific tables).
- **Maker-Checker Governance**: Financial waivers, refunds, and academic grade corrections require dual sign-off (Maker drafts, Checker approves). Self-approval is rejected at the API layer.
- **16 Educational Roles Configured**: `ROLE_SUPER_ADMIN`, `ROLE_INSTITUTION_ADMIN`, `ROLE_ACADEMIC_HEAD`, `ROLE_CLASS_TEACHER`, `ROLE_SUBJECT_TEACHER`, `ROLE_TEACHING_ASSISTANT`, `ROLE_EXAM_CONTROLLER`, `ROLE_FINANCE_HEAD`, `ROLE_FEE_CLERK`, `ROLE_LIBRARIAN`, `ROLE_TRANSPORT_COORDINATOR`, `ROLE_HOSTEL_WARDEN`, `ROLE_COUNSELOR`, `ROLE_PARENT`, `ROLE_STUDENT`, `ROLE_AUDITOR`.

---

## 3. Current Repository Structure
```
d:\lms2/
├── .git/                      # Local Git repository (no remotes)
├── PRD.md                     # Product Requirements Document
├── ARCHITECTURE.md            # Technical Architecture
├── RULES.md                   # 16 Non-Negotiable Engineering Rules
├── DESIGN.md                  # Design System & 16 Role Dashboards
├── TASKS.md                   # Live Development Tracker
├── MEMORY.md                  # Project Memory (this document)
├── docker-compose.yml         # Local Docker PostgreSQL orchestration
├── package.json               # Root monorepo workspace runner
├── .env.example               # Safe environment variable placeholders
├── server/                    # Backend API application
│   ├── prisma/schema.prisma   # PostgreSQL multi-tenant schema
│   ├── prisma/seed.ts         # Multi-tenant fixtures for all 16 roles
│   ├── src/app.ts             # Express application & route mounts
│   ├── src/server.ts          # Server entrypoint & graceful shutdown
│   ├── src/middleware/        # auth, tenant, rbac, audit, validate, errorHandler
│   ├── src/modules/           # auth, institutions, academic, students, lms, attendance, communication, exams
│   └── tests/                 # Vitest integration test suites (20/20 passing)
└── client/                    # Frontend React application
    ├── src/App.tsx            # Full application router with protected guards
    ├── src/main.tsx           # React DOM root & TanStack Query client
    ├── src/api/client.ts      # Axios client with automated refresh token rotation
    ├── src/context/AuthContext.tsx # Authentication provider & permission helpers
    ├── src/pages/LoginPage.tsx# Login view with 16-role demo account switcher
    └── src/pages/DashboardOverview.tsx # Customized dashboard views for all 16 roles
```

---

## 4. Completed Milestones
- **Phase 0 (Workspace Inspection & Planning)**:
  - Verified local environment: Node.js v26.1.0, npm v11.13.0, Git v2.55.0, Docker v29.2.1.
  - Initialized local Git repository (`git init -b main`).
  - Created complete set of 6 master documentation files: `PRD.md`, `ARCHITECTURE.md`, `RULES.md`, `DESIGN.md`, `TASKS.md`, `MEMORY.md`.
- **Phase 1 (Foundation Setup)**:
  - Defined comprehensive PostgreSQL schema in Prisma with relations for multi-tenancy, users, academic structures, LMS, attendance, exams, fees, and audit events.
  - Executed migration `20261021191751_init` against local PostgreSQL.
  - Implemented bcrypt password hashing, short-lived JWT access tokens, and 7-day sliding refresh token rotation with revocation.
  - Implemented `requireTenant` and `requirePermission` middlewares with row-level multi-tenant isolation.
  - Seeded database with 2 distinct institutions (`Alpha Academy` and `Beta Institute`) and test accounts for all 16 roles.
  - Scaffolded React 18 frontend with Vite, Tailwind CSS, TanStack Query, and built full production bundle.
- **Phase 2 (Academic & SIS)**:
  - Implemented and verified academic years, terms, classes, sections, subjects, and teacher allocations.
  - Implemented transactional student creation with user account and student profile, and parent-student relationship linking.
- **Phase 3 (Core LMS)**:
  - Implemented course workspaces, modules, lessons, assignment submissions, rubric grading with feedback, and immutable audit logs.
  - Verified all workflows with 20/20 passing automated tests.

---

## 5. Current Implementation State & Database Migrations
- **Database Migrations**: Existing migration `20261021191751_init`; current database state could not be checked because PostgreSQL was unavailable.
- **Automated Tests**: Historical handoff reports 20 passing tests. In this session `npm test` was attempted but all 5 suites failed during setup at `prisma.$connect()` because `localhost:5432` refused the connection; 26 individual tests were skipped. Docker Desktop's engine was also unavailable.
- **Builds**: Latest `npm run build` passed in both `server/` and `client/`. `npx prisma validate` and `npx prisma generate` passed after adding subject-period attendance. Latest focused Vitest run passed 15 tests across attendance, leave, exam, and finance schema suites. Database integration tests remain unverified: configured database name is `lms2` (not confirmed dedicated) and `localhost:5432` is unreachable.
- **Known Bugs / Unresolved Issues**: Phase 4 includes daily and subject/period attendance, parent explanations via pending EXCUSED corrections, staff leave request/approval APIs and UI, attendance/communication UI, subject correction workflow, and a 90-day chronic absence summary. The new subject-period migration is not applied; integration workflows were added but not executed. Chronic absence has no scheduled alert job; external/realtime notifications are not configured. Phase 5 now has exam setup, roster/marks entry UI with pasted CSV import, pending grade change queue, publishing controls, and report card UI plus a seeded integration test; DB workflow not run. Invigilation, institution grading scale and printable cards remain. Phase 6 has no refund workflow, provider integration, transaction tests, or client UI. Phases 7–9 remain largely outstanding.
- **Environment Setup**: Copy `.env.example` to `.env` and provide local values. Never commit credentials or secret values. Start PostgreSQL with `docker compose up -d postgres` where Docker is available, then apply migrations and seed only in a development environment.

---

## 6. Execution Progress
- **Last Verified Task**: TASK-P3-01 (Core LMS Courses, Modules, Lessons, Assignments & Grading; historical verification evidence is in TASKS.md).
- **Current Task**: TASK-P4-01 (attendance/communication pages and workflows now implemented; subject/period attendance and DB-backed verification remain).
- **Phase 5 State**: TASK-P5-01 APIs and role-aware exam UI with CSV paste/import implemented; integration verification, invigilation, configurable grading, and print remain.
- **Phase 6 continuation**: Finance UI is connected at `/finance`; offline refund request/review uses pending reservation, checker authorization, invoice reversal and balanced ledger entries under a serializable transaction. `FeeRefundRequest` requires migration `20261024150000_finance_refunds`. Schema validation, Prisma generation, backend/client builds and 16 focused schema tests passed. Database verification remains pending.
- **Phase 7 continuation**: Library catalog, circulation, transactional inventory counts, student loan scoping, return processing, and institution-configurable overdue fine policy are implemented in API/UI. Fine policy uses migration `20261024170000_library_fines`. Barcode/reservations, lost-item recovery, payroll, transport, hostel and counseling remain. Database workflows were not run against unconfirmed `lms2`.
- **Phase 7 transport continuation**: Added tenant-scoped route, vehicle/driver, seat-capacity allocation API and coordinator UI. Input validation covers route, driver, and assignment payloads. DB-backed tests remain blocked by test-database availability.
- **Phase 8/9 continuation**: Added isolated PostgreSQL CI workflow, production env validation for secrets/HTTPS/TLS, DB-aware readiness endpoint, and deployment operations guide (`DEPLOYMENT.md`). Patched vulnerable runtime React Router/Zod dependencies; production audit is clear. Focused checks pass (23 tests/7 files plus server/client builds); full audit still reports 9 dev-toolchain issues requiring major upgrades. CI has not run on a hosted runner; production deploy/monitoring/backup restore drill remain unverified.
- **Parallel outstanding task**: TASK-P5-01 remains in progress (exam workflows/UI/integration verification); TASK-P6-01 remains in progress (finance DB transaction verification); TASK-P7-01 through TASK-P9-01 remain outstanding.
- **Exact Next Action**: Continue Phase 5 invigilation/grading-scale/report-card requirements and Phase 7–9 work. When an isolated test database is confirmed, apply pending migrations and run Phases 4–6 workflows. Do not run DB suites against configured `lms2` without confirmation it is isolated.

### Continuation checkpoint — 2026-10-24
- Implemented Phase 5 invigilator roster persistence, active teacher-profile candidate listing, schedule roster retrieval and replacement endpoints, audit event, tenant checks, published-session guard, overlapping schedule conflict detection, and a serializable transaction. Added roster UI and extended the DB workflow test with persistence/readback and conflict assertions.
- Added migration `server/prisma/migrations/20261024180000_exam_invigilators/migration.sql`.
- Evidence: Prisma schema validation and generation passed; server TypeScript build passed; client production build passed; exam schema tests passed 5/5; `git diff --check` passed. DB workflow test and migration were not run because configured `lms2` is not confirmed as isolated and local Postgres is unreachable.
- Checkpoint commit: `40d48a1a0537ef60fe5741c211ee499a23056d7f` (local only; no Git remote configured).
- Phase 5 continuation in progress this turn: configurable institution grade bands and GPA calculations, print UI, HMAC signing and authorized report-card verification endpoint are implemented with two pending migrations. Prisma validation/generation and server/client builds pass; 13 focused tests across four files pass. The DB workflow test additions, migrations, and browser printing are not verified.
- **Exact next action**: Implement Phase 7 payroll, hostel, and counseling from HR-004/AUX-003/COUN-001–003, then remaining library/transport/analytics requirements. Continue to avoid migrations or DB integration runs against unconfirmed `lms2`.
- Phase 5 continuation commit: `0d7f38f0ce9b70de49a481c2038a37dab76b169a` (local only, no remote configured). No deployment or remote push occurred.

### Phase 7 payroll continuation — 2026-10-24
- Added effective-dated teacher salary history and immutable monthly gross payroll snapshots; salary snapshots include staff name and employee-code values. Payroll currently covers active `TeacherProfile` records, without unconfigured deductions/tax calculations.
- Added a management/read API, role-specific permissions, a second service-level gate allowing only institution admin/principal and finance head, audited mutations, a salary setup screen, and monthly summary generation/history UI.
- Verification: Prisma schema validation and generation, server/client builds passed; focused pure tests passed 16/16 across five files. Payroll database integration is authored but not run; migration `20261024210000_payroll` has not been applied.
- Exact next step: hostel management, then confidential counseling and referrals, then remaining library/transport/analytics requirements. Do not use the unconfirmed configured DB for migrations or DB tests.
- Payroll checkpoint commit: `ac680a99d92b929b2c33b587a43ec3c6bb260858` (local only).

### Hostel operations continuation — 2026-10-24
- Added tenant-isolated block and room management, serializable capacity-aware bed allocation with collision checks, resident-only student gate-pass requests, warden approval/depart/return lifecycle, visitor in/out logging, mess charges/payment status, route audit events, and student/warden UI.
- Added migration `20261024220000_hostel_operations`, unit schema tests, and a DB workflow covering the operational journey. Prisma validation/generation and server/client builds passed; focused checks passed 18/18. DB test and migration not run due to unconfirmed `lms2` and unavailable localhost PostgreSQL.
- Scope still missing: residence stay check-in/out, hostel incidents, accounting integration for mess charges, and broader occupancy/dues reports. Next implement encrypted counseling workflows.
- Hostel checkpoint commit: `421bc17df6770796a000f858d76a859902bfc3e4` (local only; no remote configured).

### Confidential counseling continuation — 2026-10-24
- Added teacher section-scoped and parent linked-child referral permissions, counselor-only cases, authenticated AES-256-GCM encryption for new private content, audit payload redaction, support plans/follow-ups, configurable absence and grade rules, and an at-risk query limited to counselors. UI provides referring, private case work, support planning, and threshold management.
- Production config now requires an independent `COUNSELING_ENCRYPTION_SECRET`; it is supplied to CI and documented for deployment. Migration `20261024230000_confidential_counseling` adds new encrypted fields/tables without dropping existing data.
- Verification: Prisma validate/generate, server/client builds passed; 22 non-database tests passed across eight files. A DB workflow test was added but not run; migration not applied. Browser interactions and key rotation/decryption procedure remain unverified.
- Exact next task: review and commit library copy tracking; then finish lost-book recovery/reservations/inventory audits, then transport stops/documents/driver assignments/incidents, analytics, and Phases 8–9 verification. Never migrate or run DB tests against unconfirmed `lms2`.

---

## 7. Commands Needed to Run & Test
- Run tests: `cd server && npm test`
- Build backend: `cd server && npm run build`
- Build frontend: `cd client && npm run build`
- Start backend: `cd server && npm run dev` (Runs on `http://localhost:4000`)
- Start frontend: `cd client && npm run dev` (Runs on `http://localhost:5173`)
- Seed database (development only): `cd server && npm run db:seed`
- Counseling checkpoint commit: `5029b916a7327ca4fa116f398a2511e79bf33706` (local only; no remote configured).

### Phase 7 hostel/library continuation — 2026-10-24
- Hostel incident implementation commit `5c034c0`; documentation commit `8635ba3`; residence check-in/out commit `b85fc42`. Local branch `main`; no remote configured.
- Hostel stay/incident DB migrations and workflow tests are authored but pending isolated DB verification. PostgreSQL localhost port is closed; Docker engine unavailable.
- Library copy tracking commit `84d1c2e` adds `BookCopy` per-copy barcodes; checkout/check-in transition physical copy state; tenant barcode lookup and UI barcode display are connected. Migration `20261024260000_library_copies` includes a catalog inventory backfill. Prisma validate/generate and server/client builds passed; library schema tests passed 4/4. Database workflow/migration/browser verification not run.
- Next: implement library lost recovery/reservations/inventory audits; transport stops/documents/driver assignments/incidents; advanced analytics; inspect and run available Phase 8–9 checks. Hosted CI, deployment, backup restore, accessibility, and performance checks remain unverified.

### LMS continuation checkpoint f00613b — library and transport batch (2026-10-24)
- Verified the actual repository started at commit `f00613b7d1a915f7778465f6377f193a44f6766b` on `main`. Library/transport changes were saved locally in commit `0275cfb`; the latest documentation status update follows in its own local commit. No remote is configured and nothing was pushed.
- Library additions: tenant-scoped reservation queue and cancellation/ready-copy transfer; lost-item report/recovery; persisted inventory audit snapshots; UI actions and audit-routed APIs. Library migration: `20261025000000_library_reservations_and_audits`.
- Transport additions: route stops and pickup-stop allocation, vehicle documents, driver assignment history and overlap check, tracking-log records and incidents, scoped student/parent route views and UI. Transport migration: `20261025000100_transport_operations`.
- Actual checks: Prisma validate and generate passed; backend TypeScript build passed; frontend TypeScript/Vite build passed; 13 non-database test files passed 43/43 tests; `git diff --check` passed. The library and transport database workflow assertions were not run. PostgreSQL is not listening on localhost port 5432 and Docker daemon is unavailable. `.env` points at a database whose test isolation has not been confirmed. Do not run migrations or any DB workflow until a dedicated isolated test database is identified.
- Remaining Phase 7 requirements from the original prompt include library renewal/overdue notifications/circulation reports, transport attendance and billing integration, broader HR and operational reporting, and persisted role-specific academic/attendance/finance/operations analytics. Browser checks are not run. Phase 8/9 hosted CI, deployment, restore drill, accessibility and performance evidence remain outstanding.
- Exact next action: continue remaining Phase 7 acceptance criteria (library renewal/overdue reports, transport attendance/billing integration, persisted cross-module analytics), then validate Phases 8–9 where local evidence is possible. Preserve main history; no remote setup, push, destructive DB action, or external deployment.

### Transport attendance and billing continuation — 2026-10-24
- Local `D:\lms2` starts at main commit `31ddcf4`; it did not contain detached-worktree library renewal commits. The prior transport tracking syntax error was present and fixed.
- Added `TransportAttendance` and `TransportMonthlyCharge` with migration `20261025000300_transport_attendance_billing`. Monthly charges derive amounts from `TransportRoute.monthlyFee`, create a linked standard fee invoice, and post balanced ledger rows. No client amount is accepted.
- Actual checks: Prisma validate and generate passed; `tests/transport-schemas.test.ts` passed 4/4; server production build passed. Client production build reached Vite transformation but the final tool result was unavailable, so it remains unverified. No migration, database workflow, browser workflow, hosted CI, deployment, restore, accessibility, or performance checks ran.
- Exact next action: add database workflow assertions and persisted role-scoped analytics, then apply migrations and execute workflows only with a confirmed isolated PostgreSQL test database.

- Local checkpoint after `6674979`: direct `D:\lms2` now has library renewal limits and circulation reporting. `20261025000400_library_renewals` is authored but un-applied. Server/client production builds passed and `library-schemas.test.ts` passed 7/7. No database workflow, browser, hosted CI, deployment, restore, accessibility, or performance verification was performed. Next implementation task: persisted role-scoped analytics, then review outstanding Phase 4–7 workflows and add DB tests without running them until a dedicated test database is approved.

### Phase 7 & 8 Analytics and Reporting continuation — 2026-10-24
- Implemented persisted, role-scoped analytics service and REST routes (`/api/v1/analytics/*`):
  - **Dashboard**: role-specific overview stats (student enrollments/attendance/report cards; teacher courses/assignments; parent linked children; admin totals).
  - **Attendance**: present/absent/late/excused counts, overall presence rate, and 90-day daily breakdown with section and teacher filters.
  - **Examinations**: session schedules, published report-card counts, and average GPA per session.
  - **Finance**: invoice status breakdown, total collected, payment counts, and overdue defaulter counts (restricted to finance roles & admins).
  - **LMS**: courses with module/assignment counts, student enrollments by section, and assignment submissions/graded counts.
  - **Transport**: attendance status breakdown, route counts, monthly billing charges and total billed amounts.
  - **Library**: catalog counts, copy status breakdown, borrow status breakdown, waiting reservation count, and recent inventory audit summaries.
  - **Hostel**: blocks, total rooms, total bed capacity, active bed allocations, occupancy rate percentage, incident categories, and mess charge status/totals.
  - **HR & Payroll**: total teacher count, staff leave request breakdown by status, and recent payroll gross totals with staff counts.
- Implemented frontend `AnalyticsPage` (`client/src/pages/AnalyticsPage.tsx`) with role-aware stats, date filters, and data cards. Mounted in `App.tsx` and linked with `BarChart3` icon in `Sidebar.tsx`.
- Extended `server/tests/transport-workflow.test.ts` to assert transport attendance marking, idempotency / upsert duplicate prevention, monthly route fee charge generation, linked invoice creation, and balanced double-entry ledger postings (`1100-ACCOUNTS-RECEIVABLE` debit and `4010-TRANSPORT-REVENUE` credit).
- Authored `server/tests/analytics-workflow.test.ts` covering role-scoped analytics endpoints and access-control enforcement.
- Verification Evidence:
  - Backend TypeScript compilation: `npm run build` in `server/` passed with exit code 0 (`tsc`).
  - Frontend TypeScript and Vite production bundle: `npm run build` in `client/` passed with exit code 0 (`dist/index.html` 0.81 kB, `dist/assets/index-BCXEo6BN.js` 495.31 kB).
  - Pure unit and schema test suite: 14 test files passed, 59/59 tests passed.
  - Database migrations and DB integration workflows remain pending execution against a confirmed dedicated PostgreSQL database (`localhost:5432` currently unreachable).

### Billing Idempotency, Ledger Consistency & Financial Invariants Audit — 2026-10-24
- **Billing Idempotency & Race Condition Handling**:
  - Validated composite DB constraint `@@unique([allocationId, period])` on `TransportMonthlyCharge` and `@unique` on `StudentFeeInvoice.transportChargeId`.
  - Updated `TransportService.generateMonthlyCharge` with `P2002` / `40001` serialization conflict catch to return existing charge and invoice idempotently rather than failing if a concurrent request races past the initial query.
  - Added self-healing: if an existing charge record is found without an invoice, it generates the missing invoice and balanced ledger rows inside the transaction.
  - Enforced route monthly fee strictly from `TransportRoute.monthlyFee`; client-supplied amounts are never accepted.
  - Added `/charges/generate` endpoint alias alongside `/charges` in `transport.routes.ts`.
  - Updated `transportAttendanceSchema` to support `BOARDED` and `DROPPED` status transitions along with `PRESENT`, `ABSENT`, and `LATE`.
- **Double-Entry Ledger Consistency & Invariants**:
  - Verified balanced postings: Total Debits === Total Credits on all transaction types (`INVOICE`, `TRANSPORT_INVOICE`, `PAYMENT`, `WAIVER`, `REFUND`).
  - Standard & transport invoices post debit to `1100-ACCOUNTS-RECEIVABLE` and credit to `4000-FEE-REVENUE` / `4010-TRANSPORT-REVENUE`.
  - Payments post debit to cash/cheque/bank accounts and credit to `1100-ACCOUNTS-RECEIVABLE`.
  - Waivers post debit to `5000-FEE-DISCOUNTS` and credit to `1100-ACCOUNTS-RECEIVABLE`.
  - Refunds post debit to `1100-ACCOUNTS-RECEIVABLE` and credit to the original payment channel.
  - Enforced Maker-Checker duality: self-review is rejected with HTTP 403 on both waivers and refunds.
  - Created `server/tests/billing-ledger-invariants.test.ts` with 20 unit tests verifying all mathematical and accounting invariants.
- **Verification Evidence**:
  - TypeScript compilation: `npm run build` in `server/` passed (0 errors, code 0).
  - Client production build: `npm run build` in `client/` passed (0 errors, code 0, 495 kB bundle).
  - Vitest test suite: 15 test files passed, 79/79 tests passed (0 failures).
  - PostgreSQL test database status: `localhost:5432` is confirmed unreachable (`Test-NetConnection` port 5432 failed, no `psql` command, Docker inactive). Database workflow tests remain intentionally un-executed until an isolated test environment is provisioned.

---

## 7. Academic Assessment, Unified Gradebook & Examination Integration (2026-11-02)
- **Period-Based Attendance Removal**:
  - Successfully removed all period-based attendance requirements from the schema and application.
  - Subject teachers mark daily attendance directly for their assigned subject, class, section, and date with duplicate prevention and audit logging.
  - Verified with 10/10 passing tests in `tests/subject-attendance-no-period.test.ts`.
- **Option A Shared Category Grading & Mathematical Exactness**:
  - Configured shared `Assignments` category (e.g. 15% weightage).
  - All course assignments belong to this shared category. Equal weighting average percentage: Assignment 1 (98/100) and Assignment 2 (66/100) produce an 82.0000% category score and contribute 12.3000/15 points to final subject grade ($82\% \times 15\% = 12.3000$).
  - Overall final score with Participation (10%), Midterm (20%), and Final (40%): $12.3 + 9.5 + 18.0 + 36.0 = 83.8000/100$.
  - Explicit internal assignment allocations totaling 100% within the category supported.
  - Migrations `20261102120000_university_assessment_results`, `20261102140000_lms_assignment_assessment_integration`, and `20261102160000_assignment_display_order` applied to PostgreSQL.
  - 1:1 foreign key relation `assignment.assessmentItemId` linking LMS Course Assignments with authoritative Assessment Items.
- **Assignment Renumbering & Display Order Preservation**:
  - `displayOrder` column on `Assignment` and `AssessmentItem`.
  - Teachers can change assignment numbering/display order post-submissions without loss of student submissions, marks, or feedback. Stable IDs preserved.
  - Duplicate numbers in course prevented. Full audit logging via `AuditEvent`.
- **Unified Teacher Gradebook Matrix**:
  - Interactive grid matrix displaying all configured assessment components, raw marks, live calculated weighted contributions, cumulative total score out of 100%, letter grades, GPA points, and summary statistics (Class Average, Highest, Lowest, Pass Rate).
  - Live real-time recalculation upon mark changes and transactional batch save via `POST /api/v1/assessments/gradebook/save`.
- **Two-Button Submission & Governance Lifecycle**:
  - **Button A: Submit (To Students)**: Updates provisional status to `GRADE IN PROGRESS` visible to students and parents while preserving teacher editing rights.
  - **Button B: Submit to Exam Department**: Forwards subject results to the Examination Department for moderation and immediately locks teacher editing (`403 Forbidden` on any further direct edits or assignment grading).
  - **Maker-Checker & Correction Requests**: If adjustments are required post-submission, teachers submit formal correction requests with affected student, original marks, proposed marks, and justification. Exam Department reviews and approves or rejects with full audit logs.
  - **Publication & Transcripts**: Exam Controller moderation publishes final grades to official student report cards and permanent academic transcripts.
- **Verification Evidence**:
  - `tests/master-lms-assessment-integration.test.ts`: **All 33/33 tests PASSED**.
  - `tests/university-assessment-results.test.ts`: **All 20/20 tests PASSED**.
  - `tests/subject-attendance-no-period.test.ts`: **All 10/10 tests PASSED**.
  - Total automated assessment test suite: **63/63 tests PASSED (0 failures)**.
  - `npm --prefix client run build`: Exit Code 0 (Production bundle built successfully).
  - `npm --prefix server run build`: Exit Code 0 (TypeScript build succeeded with 0 errors).
  - Both development servers active and healthy: Backend (`localhost:4000`) and Frontend (`localhost:5173`).

---

## 8. Term Exam Schedule Auto-Sync & Manual / CSV Marks Upload (2026-11-03)
- **Term Exam Schedule Connection (`ExamSchedule` <-> `AssessmentItem`)**:
  - Direct foreign key relation: `AssessmentItem.examScheduleId` -> `ExamSchedule.id` (`onDelete: SetNull`). Migration `20261102180000_assessment_exam_schedule_connection`.
  - Allows linking any assessment item (e.g. "Midterm Exam", "Final Exam") to an official examination session and timetable slot in the Exams & Grades module (e.g. "Midterm Examinations 2026-2027").
  - **Live Auto-Synchronization**:
    - When marks are entered or uploaded in the Exams & Grades module (`POST /api/v1/exams/marks`, `ExamsService.enterMarks`), marks automatically sync to connected `StudentAssessmentMark` records against each student.
    - Proportional scaling: if `ExamSchedule.maxMarks` differs from `AssessmentItem.maxMarks`, marks are automatically scaled ($marksObtained \times item.maxMarks / schedule.maxMarks$).
    - Triggers live `AssessmentService.recalculateStudentSubjectResult` to immediately update section gradebook matrices, GPAs, and subject letter grades.
    - Exam grade correction sync: When the Exam Department approves a grade change (`ExamsService.reviewGradeChange`), the corrected score automatically syncs to the assessment mark and triggers live result recalculation.
    - On-demand sync API: `POST /api/v1/assessments/items/:id/sync-exam` allows teachers or administrators to re-sync marks at any time.
    - Connect API: `POST /api/v1/assessments/items/:id/connect-exam` connects or disconnects an exam schedule, with optional immediate sync (`syncNow: true`).
- **Manual Marks Entry & CSV Bulk Upload for Any Category**:
  - Full manual marks entry and bulk CSV upload available for all assessment categories: Midterm, Final, Quizzes, Class Participation, Lab Work, Presentations, Projects, etc.
  - API endpoint: `POST /api/v1/assessments/items/:id/upload-csv`.
  - Flexible student identifier lookup: accepts Student UUID, Admission Number (`admissionNumber`), or Roll Number (`rollNumber`).
  - Supports comma (`,`), tab (`\t`), or semicolon (`;`) delimiters with auto-header detection.
  - Automatically verifies section lock status and checks each student's mark against `maxMarks`.
  - Pre-populated CSV template generation in frontend: downloads `.csv` pre-filled with student roll numbers, admission numbers, and full names.
  - Interactive upload modal with drag-and-drop, raw text paste, live preview table, and real-time validation counters (Valid vs. Warning).
- **Verification Evidence**:
  - `tests/master-lms-assessment-integration.test.ts` (33/33 tests passing):
    - Test 31: Term Exam Schedule can be connected to an Assessment Item.
    - Test 32: Marks entered in Exams module automatically sync to connected AssessmentItem and recalculate live course results.
    - Test 33: Manual marks can be bulk uploaded via CSV for any assessment category.
  - Zero TypeScript compile errors in `server/` and `client/`.

---

## 9. Assessment Item Edit & Delete, Direct Exam Linking & Strict Subject Teacher Authorization (2026-11-03)
- **Edit & Delete Assessment Items**:
  - `PUT /api/v1/assessments/items/:id`: Subject teacher can edit title, description, maxMarks, dueDate, instructions, attachmentUrl, displayOrder, category, and examScheduleId. If maxMarks or category changes, student assessment marks are proportionally scaled and subject results recalculated automatically.
  - `DELETE /api/v1/assessments/items/:id`: Subject teacher can delete assessment items. Automatically unlinks LMS assignments, deletes deadline histories, submissions, and student marks in a transactional atomic operation, and triggers recalculation of student GPAs and letter grades.
  - Returns `403 Forbidden` if results have already been submitted to the Exam Department (teacher lock).
- **Direct Exam Schedule Linking**:
  - Added "Connect to Term Exam Schedule (Optional)" dropdown directly inside the **Create Assessment Item Modal** (`newItemExamScheduleId`).
  - Added "Connect to Term Exam Schedule (Optional)" dropdown directly inside the **Edit Assessment Item Modal** (`editItemExamScheduleId`).
  - Automatically fetches term exam schedules for the current subject and displays session name, exam date, and maximum marks.
  - Automatically triggers synchronization of exam marks upon creation or modification.
- **Strict Subject Teacher Authorization (Complete Lockdown for Non-Teachers)**:
  - Removed superadmin and exam controller bypasses from `AssessmentService.assertTeacherAuthorized`.
  - Only actively assigned teachers (`ROLE_SUBJECT_TEACHER`, `ROLE_CLASS_TEACHER`, `ROLE_TEACHING_ASSISTANT`) with an active `TeacherAssignment` for the specified `subjectId` and `sectionId` can manage schemes, create/edit/delete assessment items, enter continuous marks, and submit results.
  - Non-assigned users, superadmins, and exam department staff receive `403 Forbidden` (`Access denied: Only the authorized subject teacher can manage course assessments and results`).
  - In `Sidebar.tsx`, the `Assessment & Results` navigation menu item is strictly restricted to teachers, students, and parents.
  - Removed exam department management tab and cross-navigation links from `/assessments` and `/exams`.
  - Dual-governance moderation workflow remains intact: Exam Department staff review submitted results and approve/reject formal grade correction requests in their official capacity, but cannot create/edit/delete continuous assessment items or enter teacher marks.
- **Verification Evidence**:
  - `tests/assessment-item-edit-delete-auth.test.ts`: **All 7/7 tests PASSED**.
  - `tests/university-assessment-results.test.ts`: **All 20/20 tests PASSED**.
  - `tests/master-lms-assessment-integration.test.ts`: **All 33/33 tests PASSED**.
  - Total automated assessment test suite: **70/70 tests PASSED (0 failures)**.
  - Client production build (`npm --prefix client run build`): Exit Code 0.
  - Server production build (`npm --prefix server run build`): Exit Code 0.


