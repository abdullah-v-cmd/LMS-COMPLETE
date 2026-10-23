# Product Requirements Document (PRD) — School Learning Management System & Management Portal

## 1. Executive Summary & Product Vision
The **School LMS & Management Portal** is a production-grade, multi-tenant educational administration and digital learning platform designed to streamline operations, pedagogy, assessments, governance, and institutional finance. It unifies 16 distinct educational roles within a single secure, role-scoped, accessible, and performant application.

The platform provides complete tenant isolation for institutions, robust Maker-Checker workflows for financial and examination integrity, automated attendance, dynamic timetabling, curriculum and gradebook management, granular auditing, and parental engagement.

---

## 2. Target Users & The 16 System Roles
The system enforces strict Role-Based Access Control (RBAC) augmented with Attribute-Based Access Control (ABAC) across 16 user roles:

1. **Super Admin / Platform Owner (`ROLE_SUPER_ADMIN`)**: Platform governance, multi-institution tenant provisioning, global security configurations, system audit logs, billing plans.
2. **Institution Admin / Principal (`ROLE_INSTITUTION_ADMIN`)**: Campus oversight, admissions, staff assignments, grade override authorizations, fee structures, academic terms, and institutional announcements.
3. **Academic Head / HOD (`ROLE_ACADEMIC_HEAD`)**: Departmental curriculum, syllabus tracking, lesson plan approval, teacher allocations, grade review, and departmental performance analytics.
4. **Class Teacher / Homeroom Teacher (`ROLE_CLASS_TEACHER`)**: Assigned class/section roster, daily homeroom attendance, student welfare/behavior flags, parent communication, and class gradebooks.
5. **Subject Teacher (`ROLE_SUBJECT_TEACHER`)**: Course curriculum, multimedia lesson resources, assignment creation/grading, quizzes, subject attendance, and grade correction requests.
6. **Teaching Assistant / Co-teacher (`ROLE_TEACHING_ASSISTANT`)**: Assigned section co-teaching, grading assistance under supervision, student discussion moderation, attendance marking.
7. **Exam Controller / Examination Staff (`ROLE_EXAM_CONTROLLER`)**: Exam cycle management, invigilation rosters, seating charts, marks ingestion, moderation rules, and final result publication approval.
8. **Finance Head / Senior Accountant (`ROLE_FINANCE_HEAD`)**: Fee structure approvals, scholarship/waiver approvals (Maker-Checker checker), ledger audits, payment gateway reconciliation, expense approvals.
9. **Junior Accountant / Fee Clerk (`ROLE_FEE_CLERK`)**: Fee collection receipts (Maker), cash/cheque vouchers, invoice generation, defaulter tracking, and daily counter collection reconciliation.
10. **Librarian (`ROLE_LIBRARIAN`)**: Book and digital asset cataloging, circulation (check-in/check-out/reservations), barcode/identifier lookups, fine management, inventory audits.
11. **Transport Coordinator (`ROLE_TRANSPORT_COORDINATOR`)**: Route planning, vehicle tracking logs, driver allocations, student stop assignments, bus fee generation, and transport incident logs.
12. **Hostel Warden (`ROLE_HOSTEL_WARDEN`)**: Building/room/bed allocations, student check-in/out, mess billing management, visitor logs, gate passes, disciplinary incident tracking.
13. **Counselor / Student Support (`ROLE_COUNSELOR`)**: Confidential counseling case notes, mental health & academic intervention plans, referral records, at-risk student monitoring.
14. **Parent / Guardian (`ROLE_PARENT`)**: Linked student performance, live attendance feeds, fee invoices, online payment, teacher messaging, and absence notice submissions.
15. **Student (`ROLE_STUDENT`)**: Enrolled course content, interactive lessons, assignment submissions, automated/timed quizzes, progress tracking, report card downloads.
16. **Auditor / Compliance Officer (`ROLE_AUDITOR`)**: Read-only institution-wide and platform-wide audit access, tamper-evident log inspection, financial export verification, grade-change trails.

---

## 3. Scope & Traceable Functional Requirements

### Module A: Authentication & Security (AUTH)
- **AUTH-001**: User login with email/username and password using Argon2id hashing.
- **AUTH-002**: JWT session issuance with short-lived Access Tokens (15m) and sliding-window Refresh Tokens (7d) stored securely with rotation.
- **AUTH-003**: Tenant context validation; user credentials must resolve within active institution tenant context.
- **AUTH-004**: Multi-Factor Authentication (MFA) TOTP setup, verification, and backup recovery codes.
- **AUTH-005**: Password reset workflow via cryptographically secure single-use expiring tokens.
- **AUTH-006**: Session revocation & concurrent session limits per user.
- **AUTH-007**: Security event audit logging for all authentication actions (logins, failures, lockouts, token revocations).

### Module B: Institution & Multi-Tenancy (INST)
- **INST-001**: Institution tenant creation, onboarding, domain/slug mapping, branding configuration.
- **INST-002**: Campus hierarchy (Headquarters, Branch Campuses, Facilities).
- **INST-003**: Academic Year and Term lifecycle management with active term indicators.
- **INST-004**: Tenant data isolation; strict query-level tenant scoping to prevent cross-institution leakage.
- **INST-005**: Institution deactivation/suspension with cascading tenant lockouts.

### Module C: Admissions & Student Information (STU)
- **STU-001**: Online applicant intake, registration form validation, document attachments.
- **STU-002**: Admission workflow states: Submitted → Under Review → Interview/Test → Approved → Enrolled → Rejected.
- **STU-003**: Student profile master record (personal info, medical notes, emergency contacts, previous schooling).
- **STU-004**: Parent-Student relational linking with verification checks.
- **STU-005**: Academic promotion, section re-assignment, and student transfer certificate (TC) generation.

### Module D: Academic & Class Management (ACAD)
- **ACAD-001**: Academic Program, Grade/Class, and Section hierarchy setup.
- **ACAD-002**: Course / Subject catalog with syllabus breakdown and credits.
- **ACAD-003**: Teacher-to-subject-section assignments with workload quota validation.
- **ACAD-004**: Timetable scheduling with algorithmic conflict detection for teachers, rooms, and student cohorts.
- **ACAD-005**: Curriculum and lesson plan submission, review, and approval by HOD.

### Module E: Learning Management System (LMS)
- **LMS-001**: Course workspace with hierarchical modules, lessons, and multimedia attachments.
- **LMS-002**: Rich text content, video embedding, downloadable resources, and external links.
- **LMS-003**: Assignment authoring with deadlines, late penalty rules, and file attachment limits.
- **LMS-004**: Student assignment submission portal supporting document uploads and text responses.
- **LMS-005**: Rubric-based grading workflow with instructor comments and grade release flags.
- **LMS-006**: Automated Quizzes with multiple question types (MCQ, Short Answer, True/False), timed attempts, and instant scoring.
- **LMS-007**: Course announcements, Q&A discussion forums, and progress tracking indicators.

### Module F: Attendance Management (ATT)
- **ATT-001**: Daily homeroom and period/subject-based attendance marking.
- **ATT-002**: Statuses: Present, Absent, Late, Excused, Half-Day.
- **ATT-003**: Attendance locking after submission; edits require administrative approval and audit trail.
- **ATT-004**: Automated absence alerts triggered to parents via notification center.
- **ATT-005**: Parent absence justification submissions and homeroom teacher review.
- **ATT-006**: Aggregate attendance calculations, chronic absenteeism threshold monitoring.

### Module G: Examination & Grading (EXAM)
- **EXAM-001**: Exam term configuration, exam timetable scheduling, room and invigilator rosters.
- **EXAM-002**: Standardized marks entry portal by subject teachers with range validation.
- **EXAM-003**: Grade moderation and mark change requests requiring HOD/Exam Controller Maker-Checker approval.
- **EXAM-004**: Automated GPA, rank, and grading scale computation based on institutional schemas.
- **EXAM-005**: Controlled result publication with parent/student visibility gating.
- **EXAM-006**: Official digital report card generation with printable layouts and security verification QR/hashes.

### Module H: Fees & Financial Management (FIN)
- **FIN-001**: Dynamic fee structures (Tuition, Transport, Hostel, Lab, Examination) tied to classes/terms.
- **FIN-002**: Automated student fee invoicing, installments, and payment schedules.
- **FIN-003**: Fee concessions, scholarships, and waiver requests with mandatory dual approval (Fee Clerk Maker → Finance Head Checker).
- **FIN-004**: Payment recording (Cash, Cheque, Bank Transfer, Online Gateway mock/integration) with immutable receipt numbering.
- **FIN-005**: Double-entry ledger postings: Accounts Receivable, Cash/Bank, Revenue, Discounts.
- **FIN-006**: Refund and reversal workflows with justification and dual approval.
- **FIN-007**: Aging analysis, defaulter list generation, and daily collection reports.

### Module I: Staff & Human Resources (HR)
- **HR-001**: Staff directory, employment contracts, qualifications, and department designations.
- **HR-002**: Staff leave policy configuration, leave application submission, and approval hierarchy.
- **HR-003**: Staff attendance logging and workload analysis.
- **HR-004**: Authorized salary structure and monthly payroll summary generation (viewable by Finance Head and Principal only).

### Module J: Auxiliary Operations (AUX - Library, Transport, Hostel)
- **AUX-001 (Library)**: ISBN/Barcode catalog, copy tracking, check-out/check-in, overdue fines.
- **AUX-002 (Transport)**: Bus routes, stops, vehicle documents, driver assignments, and student seat allocations.
- **AUX-003 (Hostel)**: Hostel blocks, room configurations, bed allocation, gate passes, visitor logs, mess billing.

### Module K: Student Support & Counseling (COUN)
- **COUN-001**: Confidential counseling incident logging with restricted role access.
- **COUN-002**: Academic & behavioral at-risk detection rules and intervention plans.
- **COUN-003**: Student referral tracking between teachers, counselors, and parents.

### Module L: Communication & Notifications (COMM)
- **COMM-001**: Institution-wide, campus-wide, and section-specific announcements.
- **COMM-002**: Secure in-app role-scoped messaging between teachers and parents/students.
- **COMM-003**: In-app notification center with read/unread tracking and real-time alerts.

### Module M: Audit & Compliance (AUD)
- **AUD-001**: Immutable audit logging for all mutations (User, Action, Entity, EntityId, Before/After Diff, IP, Timestamp, TenantId).
- **AUD-002**: Tamper-evident read-only audit log viewer for Auditors and Super Admins.
- **AUD-003**: Compliance export capabilities (CSV/JSON) with cryptographic verification summary.

---

## 4. Business Workflows & Maker-Checker Chains
1. **Admissions Workflow**: Applicant submits online → Registrar validates documents → Entrance exam/interview scored → Principal approves enrollment → System provisions student & parent accounts.
2. **Fee Waiver / Refund Workflow**: Fee clerk drafts waiver/refund with justification → System checks financial limits → Finance Head reviews and approves/rejects → Ledger adjusted → Receipt/Voucher generated → Audited.
3. **Examination Marks & Grade Change Workflow**: Subject teacher enters raw marks → Verification check against limits → Teacher submits mark correction request if past window → HOD reviews → Exam Controller authorizes → Recalculation triggers → Final publication published.
4. **Student Transfer Workflow**: Request initiated → Clearance verification (Library, Fees, Hostel) → Principal sign-off → Transfer Certificate (TC) generated → Student record archived as Transferred.

---

## 5. Non-Functional Requirements
- **Security**: OWASP Top 10 compliance, input validation on every endpoint via Zod, Argon2id password hashing, parameterized database queries via Prisma, strict CORS, rate limiting.
- **Performance**: Sub-100ms API response times for 95% of standard read queries, sub-250ms for complex analytical queries.
- **Reliability & Data Integrity**: Foreign keys, unique constraints, ACID transactions for financial and exam updates.
- **Accessibility**: WCAG 2.1 AA compliance, high contrast, ARIA landmarks, keyboard navigable dialogs and forms.
- **Maintainability**: Clean Modular Monolith architecture, strict TypeScript types across backend and frontend, comprehensive unit and integration tests.
