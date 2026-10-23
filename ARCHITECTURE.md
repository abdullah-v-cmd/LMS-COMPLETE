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
| `POST /exams/sessions` | `exam:create` | Creates a session only for a term in the tenant |
| `POST /exams/schedules` | `exam:create` | Adds a subject schedule to a tenant session, within session dates |
| `POST /exams/marks` | `exam:marks:entry` | Validates tenant roster, teacher subject/section assignment, bounds, and one-time mark entry |
| `POST /exams/grade-changes` | `grade:update` | Assigned subject teacher requests a reasoned correction before publication |
| `POST /exams/grade-changes/:id/review` | `grade:approve` | Tenant-scoped, maker-checker review with atomic request claim and stale-mark detection |
| `POST /exams/results/publish` | `result:release` | Requires schedules, complete assigned rosters, and no pending correction requests; calculates report-card GPA, grade, and rank |
| `GET /exams/report-cards` | `exam:read` | Students and parents see only published cards for themselves or linked children |

The current grading scale is a fixed 0–4 GPA mapping in code; institution-configurable grading scales, weighted subjects, exam seating/invigilation, and printable signed/QR report cards remain future work.

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
| `GET /finance/ledger` | `ledger:read` | Tenant financial ledger, most recent 500 entries |

Current finance exclusions: refund workflow and payment-provider integration/reconciliation. Serializable database transactions are used for invoice generation, payment posting, and waiver approval; concurrency behavior still needs PostgreSQL integration verification.

---

## 6. Docker & Infrastructure Design
- Development runs seamlessly locally:
  - PostgreSQL 16 on port 5432.
  - Backend Express API on port 4000.
  - Frontend Vite React Dev Server on port 5173.
- `docker-compose.yml` provides a one-click database container provisioning script with health checks and volume persistence.
