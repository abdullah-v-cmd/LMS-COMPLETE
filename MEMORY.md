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

---

## 7. Commands Needed to Run & Test
- Run tests: `cd server && npm test`
- Build backend: `cd server && npm run build`
- Build frontend: `cd client && npm run build`
- Start backend: `cd server && npm run dev` (Runs on `http://localhost:4000`)
- Start frontend: `cd client && npm run dev` (Runs on `http://localhost:5173`)
- Seed database (development only): `cd server && npm run db:seed`
