# Technical Architecture Document — School LMS & Management Portal

## 1. High-Level Architecture Overview
The platform follows a clean, modular monolith architecture designed for high maintainability, strict security boundaries, robust multi-tenancy, and high developer velocity.

```
+-------------------------------------------------------------------------------+
|                               FRONTEND CLIENT                                 |
|  React 18 + TypeScript + Vite + Tailwind CSS + React Router + TanStack Query  |
|  - Role-specific Dashboard Shells                                             |
|  - Dynamic Navigation based on RBAC + Granular Permissions                    |
|  - Accessible Forms (React Hook Form + Zod) & Interactive Data Tables          |
+---------------------------------------+---------------------------------------+
                                        | HTTPS / REST JSON (JWT Bearer)
                                        v
+-------------------------------------------------------------------------------+
|                            BACKEND API SERVICE                                |
|  Node.js + Express + TypeScript                                               |
|  - Security Middlewares: Helmet, CORS, RateLimiting, Request ID               |
|  - Auth Middleware: JWT Verification, Refresh Token Rotation, Session Store   |
|  - Tenant Middleware: Institution Scoping, Subdomain/Header Resolution       |
|  - Authorization Engine: RBAC + Attribute-Based (ABAC) Access Evaluator       |
|  - Controllers / Routes: /api/v1/auth, /institutions, /academic, /lms, etc.   |
|  - Business Services & Domain Logic (Maker-Checker, Ledger, Grading Engines)  |
|  - Immutable Audit Logger (Async Queue / Database Event Sink)                 |
+---------------------------------------+---------------------------------------+
                                        | Prisma ORM (Type-Safe Queries)
                                        v
+-------------------------------------------------------------------------------+
|                          PERSISTENCE & STORAGE LAYER                          |
|  PostgreSQL 16 (Relational Database)                                          |
|  - Multi-tenant shared database with tenant_id foreign key on all entities    |
|  - Strict Foreign Keys, Unique Indexes, Check Constraints, Decimal Math       |
|  Local File Storage (Configurable S3 / Object Store Ready)                    |
|  - Uploads directory with randomized UUID filenames & MIME type verification |
+-------------------------------------------------------------------------------+
```

---

## 2. Directory & Package Structure
The repository is structured as a clear, organized monorepo/workspace layout:
```
d:\lms2/
├── package.json               # Root scripts and workspace orchestration
├── docker-compose.yml         # Local PostgreSQL and optional services
├── PRD.md                     # Product Requirements Document
├── ARCHITECTURE.md            # Technical Architecture
├── RULES.md                   # Engineering non-negotiables
├── DESIGN.md                  # UI/UX & Design System guidelines
├── TASKS.md                   # Live development tracker
├── MEMORY.md                  # Project memory handoff record
├── server/                    # Backend Node.js / Express / TypeScript / Prisma
│   ├── package.json
│   ├── tsconfig.json
│   ├── prisma/
│   │   ├── schema.prisma      # Comprehensive PostgreSQL relational schema
│   │   ├── migrations/        # Version-controlled database migrations
│   │   └── seed.ts            # Development fixtures for all 16 roles & multi-tenancy
│   ├── src/
│   │   ├── app.ts             # Express application setup and middleware pipeline
│   │   ├── server.ts          # Server entrypoint and lifecycle hooks
│   │   ├── config/            # Typed environment variables (Zod validated)
│   │   ├── middleware/        # auth, tenantScope, rbac, errorHandler, auditLog
│   │   ├── modules/           # Domain modules (auth, users, institutions, academic, lms, etc.)
│   │   │   ├── auth/          # controllers, services, routes, schemas
│   │   │   ├── institutions/
│   │   │   ├── users/
│   │   │   ├── academic/
│   │   │   ├── lms/
│   │   │   ├── attendance/
│   │   │   ├── exams/
│   │   │   ├── finance/
│   │   │   ├── hr/
│   │   │   ├── aux/           # Library, transport, hostel
│   │   │   ├── counseling/
│   │   │   ├── communication/
│   │   │   └── audit/
│   │   ├── utils/             # Password hash, JWT helpers, API response wrappers, logger
│   │   └── types/             # Shared TypeScript types and express augmentations
│   └── tests/                 # Unit, integration, authorization & tenant-isolation test suites
└── client/                    # Frontend React / TypeScript / Vite / Tailwind
    ├── package.json
    ├── tsconfig.json
    ├── vite.config.ts
    ├── tailwind.config.js
    ├── index.html
    └── src/
        ├── App.tsx            # Main router with protected route guards
        ├── main.tsx           # Application entrypoint & TanStack Query Provider
        ├── api/               # Axios/Fetch client with automatic token refresh
        ├── components/        # Reusable UI components (buttons, modals, tables, forms)
        ├── hooks/             # Custom React hooks (useAuth, useTenant, usePermission)
        ├── layouts/           # Role-based dashboard layouts with responsive sidebars
        ├── pages/             # Route views organized by module and role
        ├── context/           # Minimal context / Zustand store for auth & theme
        └── types/             # Frontend TypeScript interfaces
```

---

## 3. Database Schema & Entity Relationships
The relational schema leverages PostgreSQL 16 with Prisma ORM. Key entity domains include:

1. **Multi-Tenancy & Institutions**:
   - `Institution`: id, name, code, slug, logoUrl, status (ACTIVE, SUSPENDED), address, phone, email, currency.
   - `Campus`: id, institutionId, name, code, address, isMainCampus.
   - `AcademicYear`: id, institutionId, name, startDate, endDate, isCurrent.
   - `AcademicTerm`: id, academicYearId, name, startDate, endDate, isCurrent.

2. **Identity, Roles & Permissions**:
   - `User`: id, institutionId (nullable for SuperAdmin), email, username, passwordHash, firstName, lastName, phone, role (Enum of 16 roles), isActive, mfaEnabled, mfaSecret, lastLoginAt.
   - `RefreshToken`: id, userId, tokenHash, expiresAt, revokedAt, replacedByToken.
   - `RolePermission`: id, role, permission (e.g. `student:read`, `fee:waiver:approve`), institutionId (optional custom overrides).

3. **Academic Structure & Roster**:
   - `Program`: id, institutionId, name, code.
   - `ClassGrade`: id, institutionId, programId, name, level (1..12).
   - `Section`: id, classGradeId, name, roomNumber, maxCapacity.
   - `Subject`: id, institutionId, name, code, creditUnits.
   - `StudentProfile`: id, userId, institutionId, admissionNumber, rollNumber, currentSectionId, dateOfBirth, gender, bloodGroup, medicalNotes.
   - `ParentProfile`: id, userId, institutionId, occupation, emergencyContact.
   - `StudentParentRelation`: id, studentId, parentId, relationshipType (FATHER, MOTHER, GUARDIAN), isPrimaryContact.
   - `TeacherProfile`: id, userId, institutionId, employeeCode, qualification, joiningDate, department.
   - `TeacherAssignment`: id, teacherId, subjectId, sectionId, academicTermId, isPrimaryTeacher.

4. **Learning Management System (LMS)**:
   - `Course`: id, institutionId, subjectId, sectionId, teacherId, academicTermId, title, code, description, isPublished.
   - `CourseModule`: id, courseId, title, sequenceOrder, isPublished.
   - `Lesson`: id, moduleId, title, contentRichText, videoUrl, sequenceOrder, isPublished.
   - `LessonAttachment`: id, lessonId, fileName, fileUrl, fileType, fileSize.
   - `Assignment`: id, courseId, title, instructions, maxPoints, dueDate, allowLateSubmissions, latePenaltyPercent.
   - `AssignmentSubmission`: id, assignmentId, studentId, submittedAt, contentText, attachmentUrl, status (SUBMITTED, GRADED, LATE), grade, feedback, gradedByUserId, gradedAt.
   - `Quiz`: id, courseId, title, description, timeLimitMinutes, passingScore, isPublished.
   - `QuizQuestion`: id, quizId, questionText, questionType (MULTIPLE_CHOICE, TRUE_FALSE, SHORT_ANSWER), optionsJson, correctAnswer, points, sequenceOrder.
   - `QuizAttempt`: id, quizId, studentId, startedAt, submittedAt, scoreObtained, passed.

5. **Attendance System**:
   - `AttendanceRecord`: id, institutionId, studentId, sectionId, date, status (PRESENT, ABSENT, LATE, EXCUSED, HALF_DAY), remarks, markedByUserId, lockedAt.
   - `AttendanceCorrection`: id, attendanceRecordId, requestedStatus, reason, requestedByUserId, approvedByUserId, status (PENDING, APPROVED, REJECTED).
   - Homeroom records retain one row per student per date (`@@unique([studentId, date])`). Subject-period attendance uses separate `SubjectAttendanceRecord` rows keyed by student/date/subject/period, with assignment checks and locked correction workflow.

6. **Examinations & Results**:
   - `ExamSession`: id, institutionId, academicTermId, name, startDate, endDate, status (SCHEDULED, IN_PROGRESS, MODERATION, PUBLISHED).
   - `ExamSchedule`: id, examSessionId, subjectId, classGradeId, examDate, startTime, endTime, maxMarks, passMarks.
   - `ExamMark`: id, examScheduleId, studentId, marksObtained, isAbsent, enteredByUserId, approvedByUserId, remarks.
   - `GradeChangeRequest`: id, examMarkId, originalMarks, proposedMarks, reason, requestedByUserId, approvedByUserId, status (PENDING, APPROVED, REJECTED).
   - `StudentReportCard`: id, institutionId, studentId, examSessionId, totalMarks, percentage, gpa, rank, remarks, publishedAt.

7. **Finance & Fees (Maker-Checker & Double Entry)**:
   - `FeeStructure`: id, institutionId, academicYearId, classGradeId, name, amount (Decimal 12,2), dueDate, frequency.
   - `StudentFeeInvoice`: id, institutionId, studentId, feeStructureId, invoiceNumber, totalAmount, discountAmount, paidAmount, balanceAmount, status (UNPAID, PARTIAL, PAID, CANCELLED), dueDate.
   - `FeePayment`: id, institutionId, invoiceNumber, studentId, amountPaid (Decimal 12,2), paymentMethod (CASH, CHEQUE, BANK_TRANSFER, ONLINE), transactionRef, receiptNumber, collectedByUserId, paidAt.
   - `FeeWaiverRequest`: id, institutionId, invoiceId, studentId, waiverAmount, reason, requestedByUserId (Maker), approvedByUserId (Checker), status (PENDING, APPROVED, REJECTED), reviewedAt.
   - `FinancialLedgerEntry`: id, institutionId, transactionDate, accountCode, debitAmount, creditAmount, referenceType, referenceId, description, createdByUserId.

8. **Auxiliary & Operations**:
   - `BookCatalog`, `BookCopy`, `BookBorrowRecord`: Library inventory and circulation tracking.
   - `TransportRoute`, `TransportVehicle`, `StudentTransportAllocation`: Logistics and stops.
   - `HostelBlock`, `HostelRoom`, `HostelBedAllocation`: Housing and occupancy.
   - `CounselingCase`, `CounselingNote`: Encrypted/restricted welfare files.
   - `Announcement`, `Notification`, `DirectMessage`: Communication center.
   - `AuditEvent`: id, institutionId, userId, action, entity, entityId, oldValuesJson, newValuesJson, ipAddress, userAgent, timestamp.

---

## 4. Authentication, Authorization & Multi-Tenancy Architecture
1. **Multi-Tenancy Isolation**:
   - Shared database, discrete tenant isolation. Every business query MUST include `institutionId: req.user.institutionId` unless the user has `ROLE_SUPER_ADMIN`.
   - Middleware extracts the tenant from authenticated JWT payload and cross-verifies with route resource params.
   - Insecure Direct Object Reference (IDOR) attacks are neutralized at the repository layer: updates and queries condition on both `id` and `institutionId`.

2. **Token Strategy**:
   - **Access Token**: JWT containing `{ sub: userId, role: userRole, institutionId, permissions: [...] }`. Valid for 15 minutes. Signed with HMAC SHA-256.
   - **Refresh Token**: Opaque cryptographically random 256-bit token stored hashed in PostgreSQL with user reference and expiry. Revoked on rotation.

3. **RBAC & ABAC Engine**:
   - Roles possess default permissions defined in a comprehensive permission matrix.
   - Dynamic evaluation handles attribute conditions:
     - e.g., A Subject Teacher may only grade assignments for sections they are assigned to in `TeacherAssignment`.
     - e.g., A Parent may only view student profiles linked via `StudentParentRelation`.

---

## 5. API Conventions & Error Handling
- Base route prefix: `/api/v1`
- Standard envelope for success:
  ```json
  {
    "success": true,
    "data": { ... },
    "meta": { "page": 1, "limit": 20, "total": 100 } // when paginated
  }
  ```
- Standard envelope for errors:
  ```json
  {
    "success": false,
    "error": {
      "code": "VALIDATION_FAILED",
      "message": "Human-readable summary",
      "details": [ { "field": "email", "issue": "Invalid email address format" } ]
    }
  }
  ```
- HTTP status codes: 200 OK, 201 Created, 400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found, 409 Conflict, 422 Unprocessable Entity, 500 Internal Server Error.

### Implemented Attendance & Communication Routes
All routes are mounted under `/api/v1`, require authentication and tenant context. Sensitive mutations use server permissions and audit middleware where mounted.

| Method and path | Permission / scope | Behavior |
| --- | --- | --- |
| `GET /attendance` | `attendance:read`; own student, linked children, assigned teaching sections, or institution scope | Optional section, student, and date filters |
| `GET /attendance/subjects` | `attendance:read`; own student, linked children, assigned teaching sections, or institution scope | Subject-period attendance history with date and roster filters |
| `GET /attendance/reports/summary` | `attendance:read`; same role-based scope as attendance history | Aggregates homeroom records; excludes excused days and flags threshold rules |
| `POST /attendance/mark` | `attendance:mark`; section assignment or institution administrator | Validates active enrolled roster, persists and locks records, creates absence alerts |
| `GET /attendance/subject-assignments` | `attendance:mark`; assigned teacher or administrator | Lists subjects and sections a user can mark |
| `GET /attendance/sections/:sectionId/subject-roster` | `attendance:mark`; assigned subject teacher or administrator | Returns active roster and period-specific subject attendance state |
| `POST /attendance/subjects/mark` | `attendance:mark`; assigned subject/section or institution administrator | Validates roster, writes and locks attendance for a date and period, emits parent absence alerts |
| `POST /attendance/corrections` | `attendance:update`; institution record and assigned section/subject/admin | Creates pending correction request for exactly one homeroom or subject-period record |
| `POST /attendance/corrections/:id/review` | `attendance:approve`; tenant-scoped record, maker cannot review | Atomically claims pending request and applies approved status |
| `GET /attendance/sections` | `attendance:mark`; institution admin or assigned teaching staff | Lists sections available for marking |
| `GET /attendance/sections/:sectionId/roster` | `attendance:mark`; institution admin or assigned section teacher | Returns active roster and the requested day's attendance state |
| `GET /attendance/corrections` | `attendance:approve`; tenant scoped | Lists pending correction and guardian explanation requests for review |
| `POST /attendance/justifications` | `attendance:justify`; linked parent only | Submits a reasoned explanation for a locked absence as a pending EXCUSED correction |
| `GET /communication/announcements` | Authenticated tenant member | Lists announcements visible to the user's role |
| `POST /communication/announcements` | `communication:announce` | Creates a tenant announcement |
| `GET /communication/messages` | Authenticated tenant member | Lists only messages sent or received by current user within tenant |
| `POST /communication/messages` | `communication:message`; tenant membership and assigned teacher-family relation (institution admin can message) | Sends a message and creates recipient notification |
| `GET /communication/notifications` | Authenticated tenant member | Lists current user's notifications |
| `PATCH /communication/notifications/:id/read` | Authenticated tenant member; current user and tenant scope | Marks owned notification read; returns not found for another user's record |
| `GET /hr/requests` | `leave:request`; own staff history or institution requests for approvers | Lists tenant staff leave requests |
| `POST /hr/requests` | `leave:request`; staff profile in tenant | Creates a validated pending leave request |
| `POST /hr/requests/:id/review` | `leave:approve`; institution admin; maker cannot self-approve | Atomically approves/rejects tenant leave request and creates an in-app notification |

Current exclusions: guardian explanations reuse attendance correction workflow and are not a separately persisted entity. Attendance and communication UI workflows and new subject-period endpoints have not been exercised against a database. The subject-period migration is authored and Prisma schema/client validation pass, but the migration has not been applied. Aggregate monitoring currently uses homeroom daily records, with a UI default of 10% across 10 recorded days; no scheduled alert job or external/realtime notification delivery is implemented. Notifications are persisted in-app.

### Examination & Results Routes
All examination routes are mounted under `/api/v1/exams` and require authentication, tenant context, and the listed permission. Creation and mark changes are audited.

| Method and path | Permission | Behavior |
| --- | --- | --- |
| `GET /exams/sessions` | `exam:read` | Lists sessions in the request institution |
| `GET /exams/schedules/:id/roster` | `exam:marks:entry`; assigned subject/section for teachers, institution scope for exam controllers | Returns the active eligible roster and existing marks for one schedule |
| `GET /exams/grade-changes` | `grade:approve` | Lists pending grade correction requests in the request institution |
| `POST /exams/sessions` | `exam:create` | Creates a session only for a term in the tenant |
| `POST /exams/schedules` | `exam:create` | Adds a subject schedule to a tenant session, within session dates |
| `POST /exams/marks` | `exam:marks:entry` | Validates tenant roster, teacher subject/section assignment, bounds, and one-time mark entry |
| `POST /exams/grade-changes` | `grade:update` | Assigned subject teacher requests a reasoned correction before publication |
| `POST /exams/grade-changes/:id/review` | `grade:approve` | Tenant-scoped, maker-checker review with atomic request claim and stale-mark detection |
| `POST /exams/results/publish` | `result:release` | Requires schedules, complete assigned rosters, and no pending correction requests; calculates report-card GPA, grade, and rank |
| `GET /exams/report-cards` | `exam:read` | Students and parents see only published cards for themselves or linked children |

Institution grade bands are stored in `InstitutionGradeBand`; each percentage threshold is a lower-bound inclusive cutoff and must include 0%. A saved scale is used for subsequent result publication; existing published report cards are not silently recalculated when the scale changes. When no scale has been saved, the prior default mapping is retained. Scale writes use `exam:create`, tenant scoping, request validation, transaction, and an audit event.

`StudentReportCard.verificationSignature` stores an HMAC-SHA256 signature over the immutable published result fields, using `REPORT_CARD_SIGNING_SECRET` (with the access-token secret as a development/test fallback). The production environment requires a distinct 32-character signing secret. `GET /exams/report-cards/:id/verify?signature=...` requires exam-read permission and confirms tenant scope plus student/guardian ownership before returning a validity result. Report cards can be printed from the Exams UI with summary grades and the integrity code. The printable layout and API signatures have unit/build coverage; browser print and DB-backed workflows remain unverified. Rotating the report-card signing secret invalidates old codes unless cards are re-signed through a controlled migration.

### Implemented Finance Routes
All finance routes are mounted under `/api/v1/finance` with tenant context, fine-grained permissions, server validation, and mutation audit middleware.

| Method and path | Permission | Behavior |
| --- | --- | --- |
| `GET /finance/structures` | `fee:read` | Tenant fee structures |
| `POST /finance/structures` | `fee:structure:manage` | Creates a fee structure using tenant academic year and class |
| `POST /finance/invoices/generate` | `fee:structure:manage` | Generates missing invoices for enrolled students in the fee structure's class and posts balanced receivable/revenue ledger entries |
| `GET /finance/invoices` | `fee:read` | Tenant invoices; student and parent views are restricted to self/linked children |
| `POST /finance/payments` | `fee:collect` | Records cash, cheque, or bank payment transactionally, updates invoice and posts balanced ledger entries; client-asserted online payments are rejected |
| `POST /finance/waivers` | `fee:waiver:request` | Fee clerk requests a reasoned waiver within outstanding balance |
| `POST /finance/waivers/:id/review` | `fee:waiver:approve` | Tenant-scoped maker-checker approval/rejection; approval adjusts balance and posts balanced discount ledger entries |
| `GET /finance/waivers` | waiver request or approve | Tenant-scoped waiver queue for finance UI |
| `GET /finance/refunds` | refund request or approve | Tenant-scoped refund queue |
| `POST /finance/refunds` | `fee:refund:request` | Requests a refund against an offline payment; pending and approved amounts reserve the refundable payment balance |
| `POST /finance/refunds/:id/review` | `fee:refund:approve` | Maker-checker review; approval reverses invoice paid/balance values and posts balanced receivable/cash ledger rows in one serializable transaction |
| `GET /finance/ledger` | `ledger:read` | Returns the latest 500 tenant-scoped ledger entries |

Refund persistence is introduced by migration `20261024150000_finance_refunds`. Payment-provider refunds remain unavailable until a provider is configured and verified; the API rejects refunds for `ONLINE` payments.

### Implemented Library Routes

| Route | Permission | Behavior |
|---|---|---|
| `GET /library/books` | `library:read` | Institution catalog |
| `POST /library/books` | `library:manage` | Creates catalog item and inventory count |
| `GET /library/loans` | `library:read` | Librarian view is institution scoped; students see only their loans |
| `POST /library/loans` | `library:manage` | Checks out to an enrolled institution student and atomically decrements availability |
| `POST /library/loans/:id/checkin` | `library:manage` | Checks in once, restores inventory, computes overdue days using the institution's configured fine policy |
| `GET /library/fine-policy` / `PUT /library/fine-policy` | read / manage | Reads or audits an institution daily fine and currency setting |

Library fine policy storage is introduced by `20261024170000_library_fines`. No configured rate means no fine accrues; lost items require a separate recovery workflow and cannot be checked in through the ordinary return route.

### Implemented Transport Routes

| Route | Permission | Behavior |
|---|---|---|
| `GET /transport/routes` | `transport:read` | Tenant routes, fleet and assigned seat counts |
| `GET /transport/allocations` | `transport:read` | Tenant student assignments |
| `POST /transport/routes` | `transport:manage` | Creates route and monthly fee |
| `POST /transport/vehicles` | `transport:manage` | Adds vehicle/driver to a tenant route |
| `POST /transport/allocations` | `transport:manage` | Assigns/reassigns enrolled students, enforcing available fleet seat capacity transactionally |
| `GET /finance/ledger` | `ledger:read` | Tenant financial ledger, most recent 500 entries |

Current finance exclusions: refund workflow and payment-provider integration/reconciliation. Serializable database transactions are used for invoice generation, payment posting, and waiver approval; concurrency behavior still needs PostgreSQL integration verification.

### Exam invigilation assignments

`ExamInvigilator` persists institution-scoped staff assignments to an exam schedule. `GET /exams/invigilators/candidates` returns active users with a tenant teacher profile; `GET /exams/schedules/:id/invigilators` reads the active roster; `PUT /exams/schedules/:id/invigilators` replaces the roster while retaining deactivated assignment rows. The write requires `exam:create`, is audited, checks active staff membership in the tenant, blocks published sessions, and rejects overlapping assignments for the same person. The transaction uses PostgreSQL serializable isolation. Migration `20261024180000_exam_invigilators` is pending application and therefore has not been database-verified.

### Payroll summaries

`StaffCompensation` keeps effective-dated monthly salary versions for teacher profiles. `POST /payroll/compensations` records salary versions; `/payroll/runs` creates a single monthly snapshot with the staff and gross salary amounts effective at the month's first day. The snapshot is append-only by unique institution/period; deductions/tax are intentionally not calculated because policies are unspecified. Payroll routes require payroll permissions and independently restrict access to `ROLE_INSTITUTION_ADMIN` (principal) and `ROLE_FINANCE_HEAD`; auditor access is excluded. All writes pass through audit middleware. Migration `20261024210000_payroll` is pending database application and workflow verification.

### Hostel operations

Hostel routes support institution-scoped blocks/rooms, bed assignments with capacity and bed-number collision checks, resident gate-pass request/review/departure/return, visitor entry/checkout logs, and monthly mess charge status. Student users only receive the separate own-gate-pass request/read permission; warden operations use hostel management permissions. Writes are audited. Migrations add a unique block name, unique room bed, gate-pass, visitor, and mess-charge persistence. Mess charge status is currently operational tracking and is not double-posted to finance; hostel residence check-in/out residence stays now have warden check-in/out history; check-in requires an allocated in-tenant enrolled student, and checkout frees the bed transactionally. Hostel incident records now support tenant-scoped warden create/list/resolve workflows with audit events. Migrations `20261024220000_hostel_operations`, `20261024240000_hostel_incidents`, and `20261024250000_hostel_stays` are pending application and DB verification.

### Confidential counseling

Counselor-only case APIs are scoped to the creating counselor and tenant. Case titles, session notes, action plans, support-plan text, follow-up notes, and referral reasons are encrypted with AES-256-GCM before persistence; audit snapshots redact sensitive request fields. Production requires `COUNSELING_ENCRYPTION_SECRET`; retain the key to read previously encrypted records. Teachers may refer students only within assigned sections, and parents only linked children; referral list views are limited to the referrer or counselor. Counselors configure lookback/absence and published-grade thresholds; at-risk output returns minimal student data and matching reasons. Migration `20261024230000_confidential_counseling` is pending application and DB workflow verification.

---

## 6. Docker & Infrastructure Design
- Development runs seamlessly locally:
  - PostgreSQL 16 on port 5432.
  - Backend Express API on port 4000.
  - Frontend Vite React Dev Server on port 5173.
- `docker-compose.yml` provides a one-click database container provisioning script with health checks and volume persistence.

### Library copy inventory continuation

`BookCopy` stores each physical item with a unique barcode and availability state. New catalog entries create individual copies; checkout claims one copy transactionally and associates it with a loan; check-in returns the physical item and synchronizes catalog quantity. Existing catalog rows are backfilled with synthetic `LIB-<book-id>-<copy-number>` barcodes. `GET /library/copies/barcode/:barcode` resolves a copy only within the active tenant. Migration `20261024260000_library_copies` is pending application and DB verification.

### Library reservations, lost items and inventory audits (continuation, pending verification)

Migration `20261025000000_library_reservations_and_audits` adds reservation queue rows, partial uniqueness for one active reservation per student/book, and inventory audit snapshots. `POST /library/reservations` either reserves an available physical copy or queues the student; cancellation transfers a ready copy to the next queued borrower or restores availability. Checkout fulfills a ready reservation; check-in and lost-copy recovery offer returned copies to the next queued reservation. Lost reporting and recovery update the loan, copy status, and catalog counts in a serializable transaction. Inventory audit records compare scanned barcodes with copies physically expected in the library (available and reserved); they preserve missing and unexpected barcode lists and do not silently modify catalog stock. `GET/POST /library/inventory-audits`, reservation APIs, lost/recovery routes, and UI actions use the library permissions and audit middleware. The transaction behavior, migration, and UI remain unverified against PostgreSQL/browser.

### Library renewal and circulation reporting (pending verification)

`BookBorrowRecord.renewalCount` is introduced by migration `20261025000400_library_renewals`. `POST /library/loans/:id/renew` requires library-management permission and runs at serializable isolation. It permits at most two renewals for an active, non-overdue, non-lost loan, requires a strictly later due date, and refuses renewal when another student has a queued or ready reservation. `GET /library/reports/circulation` uses the same management permission and returns only tenant data, with optional validated borrowed-date filters. It aggregates issue, return, active, overdue, lost, recorded fine, and most-borrowed catalog data. Database transaction, tenant-boundary, and browser verification remain pending.

### Transport operations continuation (pending verification)

Migration `20261025000100_transport_operations` adds route stops, vehicle document records, driver assignment history, manually/imported tracking log records, incident records, and allocation-to-pickup-stop links. Tenant scoped APIs provide stop/document/driver setup and incident/tracking records. Driver assignment checks license overlap across vehicles in an institution and closes a current assignment when replacing it; route allocation validates configured stops and transactionally enforces summed vehicle capacity. Student and parent read access is limited to the student's or linked children's allocation routes and tracking; incident details are similarly scoped to linked students. Tracking records are explicitly sourced as `MANUAL` or `GPS_IMPORT` and are not presented as live GPS. The tracking writer requires transport-management permission. APIs, UI and schema are implemented, but DB migration, concurrency, authorization workflow, and browser verification are pending.

### Transport attendance and finance invoices (pending verification)

Migration `20261025000300_transport_attendance_billing` stores attendance per allocation and service date, with a unique constraint preventing duplicates. The audited coordinator endpoint corrects status and remarks through an upsert. Monthly billing derives every amount from `TransportRoute.monthlyFee`, creates one linked standard `StudentFeeInvoice`, and posts balanced receivable and transport-revenue ledger rows. Existing finance payment, waiver, refund, and read restrictions apply to the invoice. Student and parent reads are scoped to owned or linked students. Database and browser verification remain pending.
