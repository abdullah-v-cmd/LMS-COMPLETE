# School LMS — Complete User Roles & Permissions Manual

This document provides a comprehensive operational and security guide for all **16 discrete roles** in the School Learning Management System (LMS) and Management Portal. It details their system identifier, hierarchy, daily workflows, permissions, and security boundaries.

---

## 1. Role Hierarchy & Scope Architecture

The LMS uses a **Strict Hierarchical Role-Based Access Control (RBAC)** architecture combined with **Multi-Tenant Scoping**:

```
                       ┌─────────────────────────┐
                       │    ROLE_SUPER_ADMIN     │  (Platform Level - Multi-Tenant)
                       └────────────┬────────────┘
                                    │
                       ┌────────────┴────────────┐
                       │ ROLE_INSTITUTION_ADMIN  │  (School Level - Single Tenant)
                       └────────────┬────────────┘
                                    │
       ┌────────────────────────────┼────────────────────────────┐
       │ Academic Faculty           │ Financial Operations       │ Auxiliary & Welfare
       ├────────────────────────────┼────────────────────────────┼────────────────────────────┐
       │ • ROLE_ACADEMIC_HEAD       │ • ROLE_FINANCE_HEAD        │ • ROLE_LIBRARIAN           │
       │ • ROLE_CLASS_TEACHER       │ • ROLE_FEE_CLERK           │ • ROLE_TRANSPORT_COORDINATOR
       │ • ROLE_SUBJECT_TEACHER     │                            │ • ROLE_HOSTEL_WARDEN       │
       │ • ROLE_TEACHING_ASSISTANT  │                            │ • ROLE_COUNSELOR           │
       │ • ROLE_EXAM_CONTROLLER     │                            │                            │
       └────────────────────────────┴────────────────────────────┴────────────────────────────┘
                                    │
       ┌────────────────────────────┴────────────────────────────┐
       │ End Users (Beneficiaries)                               │ Governance & Compliance
       ├─────────────────────────────────────────────────────────┼─────────────────────────┤
       │ • ROLE_PARENT                                           │ • ROLE_AUDITOR          │
       │ • ROLE_STUDENT                                          │                         │
       └─────────────────────────────────────────────────────────┴─────────────────────────┘
```

---

## 2. Role Summary Table

| # | Role Display Name | System Identifier (`UserRole`) | Operational Domain | Scoping Level |
| :-: | :--- | :--- | :--- | :--- |
| **1** | **Super Administrator** | `ROLE_SUPER_ADMIN` | Platform Management & SaaS Ops | Multi-Tenant (All Schools) |
| **2** | **Institution Admin (Principal)** | `ROLE_INSTITUTION_ADMIN` | Overall School Operations | Single Institution |
| **3** | **Academic Head (Dean/VP)** | `ROLE_ACADEMIC_HEAD` | Curriculum & Academic Structure | Single Institution |
| **4** | **Class Teacher** | `ROLE_CLASS_TEACHER` | Section-level Student Oversight | Assigned Section |
| **5** | **Subject Teacher** | `ROLE_SUBJECT_TEACHER` | Course Delivery, Exams, Grading | Assigned Subjects/Sections |
| **6** | **Teaching Assistant (TA)** | `ROLE_TEACHING_ASSISTANT` | Assignment Review & Class Support| Assigned Courses |
| **7** | **Exam Controller** | `ROLE_EXAM_CONTROLLER` | Examination Sessions & Report Cards | Single Institution |
| **8** | **Finance Head** | `ROLE_FINANCE_HEAD` | Fee Structures, Refunds, Approvals| Single Institution |
| **9** | **Fee Clerk** | `ROLE_FEE_CLERK` | Offline Counter Collections | Single Institution |
| **10**| **Librarian** | `ROLE_LIBRARIAN` | Books, Catalog, Loans, Penalties| Single Institution |
| **11**| **Transport Coordinator** | `ROLE_TRANSPORT_COORDINATOR` | Routes, Buses, Driver Logs, Stays| Single Institution |
| **12**| **Hostel Warden** | `ROLE_HOSTEL_WARDEN` | Rooms, Check-Ins, Gate Passes | Single Institution |
| **13**| **Student Counselor** | `ROLE_COUNSELOR` | Confidential Mental Health/Cases| Encrypted Case Records |
| **14**| **Parent / Guardian** | `ROLE_PARENT` | Fee Payments, Child Performance | Linked Wards Only |
| **15**| **Student** | `ROLE_STUDENT` | Learning, Quizzes, Attendance | Enrolled Courses Only |
| **16**| **Internal / External Auditor** | `ROLE_AUDITOR` | Compliance, Financial & Ledger Logs| Read-Only Inspection |

---

## 3. In-Depth Role Profiles

---

### 1. Super Administrator (`ROLE_SUPER_ADMIN`)
* **Who it is**: The system owner, SaaS platform administrator, or central IT DevOps director.
* **Scope**: Global (Across all schools/campuses).
* **Core Responsibilities**:
  - Provisions new institutions, campuses, and tenant databases.
  - Suspends or reactivates delinquent institutions.
  - Configures global SaaS billing, system feature flags, and security rules.
* **What they can do**:
  - `POST /api/v1/institutions` — Create new educational institutions.
  - `PATCH /api/v1/institutions/:id/status` — Suspend or reactivate any school.
  - Access system health metrics (`/api/v1/health/ready`), global audit logs, and diagnostic dumps.
* **Strict Security Boundaries**:
  - Does not manage day-to-day student homework or grade individual quizzes unless performing an administrative override.

---

### 2. Institution Administrator / Principal (`ROLE_INSTITUTION_ADMIN`)
* **Who it is**: School Principal, Headmaster, Director, or Chief Administrator of an individual campus.
* **Scope**: Institution-Wide.
* **Core Responsibilities**:
  - Onboards teachers, coordinators, and non-teaching staff.
  - Defines academic years, terms, departments, and class grades (Grade 1 to 12).
  - Approves fee waivers, major student expulsions, or campus emergency broadcasts.
* **What they can do**:
  - Full management of teachers, staff profiles, and student admissions.
  - View school-wide analytics (attendance rates, fee collection totals, academic distributions).
  - Approve salary structures, leave requests, and academic term transitions.
* **Strict Security Boundaries**:
  - Strictly forbidden from viewing or modifying records of any other school/institution.

---

### 3. Academic Head (`ROLE_ACADEMIC_HEAD`)
* **Who it is**: Vice Principal (Academics), Dean of Studies, or Curriculum Director.
* **Scope**: Academic Department & Curriculum across the school.
* **Core Responsibilities**:
  - Designs curriculum, syllabus standards, and course catalogs.
  - Assigns teachers to subjects and schedules weekly section timetables.
  - Monitors syllabus coverage and teacher attendance.
* **What they can do**:
  - Create and update courses, syllabus modules, and subject master records.
  - Assign Class Teachers to sections and Subject Teachers to courses.
  - Approve mark moderation requests submitted by teachers.
* **Strict Security Boundaries**:
  - Cannot collect fee payments, post refunds, or alter financial ledgers.

---

### 4. Class Teacher (`ROLE_CLASS_TEACHER`)
* **Who it is**: The primary mentor/homeroom teacher assigned to a specific section (e.g., Grade 10-A).
* **Scope**: Their assigned class section.
* **Core Responsibilities**:
  - Takes daily section attendance (Present, Absent, Late, Excused).
  - Monitors overall student conduct, behavioral notices, and parent communications.
  - Reviews and justifies student absence notes submitted by parents.
* **What they can do**:
  - Mark and modify daily roll call for their designated section.
  - View report cards, contact details, and attendance history of their students.
  - Submit counseling referrals for at-risk students.
* **Strict Security Boundaries**:
  - Cannot take attendance for or view disciplinary records of other teachers' sections.

---

### 5. Subject Teacher (`ROLE_SUBJECT_TEACHER`)
* **Who it is**: Specialized instructors teaching specific subjects (e.g., Physics, Mathematics, History).
* **Scope**: Courses and sections they are assigned to teach.
* **Core Responsibilities**:
  - Creates course lessons, assignments, homework, and online quizzes.
  - Enters examination marks and grades student homework submissions.
  - Initiates grade correction requests when errors occur.
* **What they can do**:
  - `POST /api/v1/lms/courses/:id/assignments` — Publish homework.
  - `POST /api/v1/lms/submissions/:id/grade` — Grade and give feedback.
  - `POST /api/v1/exams/marks` — Enter exam session marks.
* **Strict Security Boundaries**:
  - Cannot publish final report cards (only Exam Controller can release results).
  - Cannot view or edit courses taught by other faculty members.

---

### 6. Teaching Assistant (`ROLE_TEACHING_ASSISTANT`)
* **Who it is**: Assistant teachers, lab demonstrators, or junior academic aides.
* **Scope**: Courses where they have been explicitly linked as an assistant.
* **Core Responsibilities**:
  - Helps grade preliminary homework, quizzes, and lab reports.
  - Uploads supplemental course materials, lecture notes, and study guides.
* **What they can do**:
  - View assignment submissions and suggest preliminary marks.
  - Post comments and responses in class discussion forums.
* **Strict Security Boundaries**:
  - Cannot finalize exam marks, change official session grades, or delete courses.

---

### 7. Exam Controller (`ROLE_EXAM_CONTROLLER`)
* **Who it is**: Registrar of Examinations or Head of the Examination Board.
* **Scope**: Institution examination sessions and grade governance.
* **Core Responsibilities**:
  - Creates exam sessions (Midterms, Finals, Mock Tests).
  - Generates exam schedules, room seating arrangements, and printable Admit Cards.
  - Locks marks entry, calculates GPAs/rankings, and publishes official student report cards.
* **What they can do**:
  - Schedule exams, configure grading curves (A+, A, B, C, F), and set pass/fail criteria.
  - Review and approve/reject teacher grade correction requests.
  - Officially release report cards to the Parent and Student portals.
* **Strict Security Boundaries**:
  - Cannot collect cash fees or modify ledger accounting entries.

---

### 8. Finance Head (`ROLE_FINANCE_HEAD`)
* **Who it is**: Chief Financial Officer (CFO), Bursar, or Senior School Accountant.
* **Scope**: Institution financial accounts, billing, and payroll.
* **Core Responsibilities**:
  - Defines annual and monthly fee structures (Tuition, Lab, Transport, Hostel).
  - Generates bulk monthly invoices for all enrolled students.
  - Audits the double-entry accounting ledger and reviews payment reconciliations.
  - Approves offline refund requests and fee concession waivers.
* **What they can do**:
  - Access double-entry ledger summaries, bank reconciliations, and cash book reports.
  - Generate and lock monthly staff payroll compensation snapshots.
  - Approve or decline fee waiver requests.
* **Strict Security Boundaries**:
  - Cannot alter exam marks or tamper with academic credentials.

---

### 9. Fee Clerk (`ROLE_FEE_CLERK`)
* **Who it is**: Accounts cashier or front-desk fee collection officer.
* **Scope**: Counter collection and payment receipts.
* **Core Responsibilities**:
  - Collects fee payments at the cash counter (Cash, Cheque, Bank Draft).
  - Verifies parent-uploaded bank deposit slips and marks them approved.
  - Issues official stamped payment receipts with idempotency validation.
* **What they can do**:
  - `POST /api/v1/finance/payments` — Record offline payment against an invoice.
  - Print fee challans and payment duplicate receipts.
* **Strict Security Boundaries**:
  - Cannot approve refunds or delete posted transactions from the financial ledger.

---

### 10. Librarian (`ROLE_LIBRARIAN`)
* **Who it is**: Head of School Library and Resource Center.
* **Scope**: Library catalog, book physical copies, and borrowing circulation.
* **Core Responsibilities**:
  - Catalogs books (ISBN, Title, Author, Category, Rack/Shelf location).
  - Issues books to students and staff; tracks due dates and return conditions.
  - Assesses overdue fines and logs lost or damaged book replacement penalties.
  - Conducts annual physical inventory reconciliations.
* **What they can do**:
  - Issue, renew, and check-in books; manage reservations queue.
  - Report books as damaged/lost and auto-generate student penalty invoices.
* **Strict Security Boundaries**:
  - Cannot access student medical records or confidential counseling notes.

---

### 11. Transport Coordinator (`ROLE_TRANSPORT_COORDINATOR`)
* **Who it is**: Logistics Manager, Fleet Supervisor, or Transport Head.
* **Scope**: School buses, vans, drivers, route stops, and transit safety.
* **Core Responsibilities**:
  - Configures bus routes, pickup/drop-off stops, and scheduled timings.
  - Registers school vehicles, insurance expiry dates, and driver licenses.
  - Allocates enrolled students to specific routes and stops.
  - Logs transit incidents (breakdowns, delays, accidents).
* **What they can do**:
  - Manage routes, vehicle maintenance logs, and live transport tracking logs.
  - Auto-generate monthly transport fee invoices for assigned riders.
* **Strict Security Boundaries**:
  - Cannot access classroom academic records or post grade changes.

---

### 12. Hostel Warden (`ROLE_HOSTEL_WARDEN`)
* **Who it is**: Residential Hall Warden, Dormitory Supervisor, or Matron.
* **Scope**: Boarding houses, residential rooms, and student welfare.
* **Core Responsibilities**:
  - Allocates dorm rooms and beds (Room Number, Capacity, Bed Identifier).
  - Manages student check-ins, check-outs, and room transfers.
  - Approves weekend residential Gate Passes with parent emergency contacts.
  - Logs visitor registers and manages hostel mess/cafeteria charges.
* **What they can do**:
  - Issue electronic gate passes; verify student biometric/roll call at curfew.
  - Generate hostel boarding fee charges linked to the student invoice.
* **Strict Security Boundaries**:
  - Cannot modify student tuition fees or academic curricula.

---

### 13. Student Counselor (`ROLE_COUNSELOR`)
* **Who it is**: School Psychologist, Mental Health Counselor, or Student Welfare Specialist.
* **Scope**: Confidential counseling case files and mental health evaluations.
* **Core Responsibilities**:
  - Receives confidential referrals from teachers concerning student behavioral changes.
  - Schedules private one-on-one counseling therapy sessions.
  - Evaluates institutional at-risk scoring rules (absenteeism + GPA drops).
* **What they can do**:
  - Maintain encrypted case notes (protected with **AES-256-GCM** cryptography).
  - Schedule follow-up appointments and mark case status (Open, In-Progress, Resolved).
* **Strict Security Boundaries**:
  - **Highest Privacy Barrier**: Counseling notes are cryptographically shielded. Even the School Principal or Super Admin cannot read raw counseling case contents.

---

### 14. Parent / Guardian (`ROLE_PARENT`)
* **Who it is**: Mother, Father, or Legal Guardian of enrolled students.
* **Scope**: Strictly limited to their legally linked wards/children.
* **Core Responsibilities**:
  - Reviews child's academic progress, exam results, and daily attendance roll call.
  - Submits absence justification notes and medical excuse letters.
  - Pays school fee invoices online via Stripe, Card, or uploaded Bank Challans.
  - Requests hostel gate passes and tracks school bus arrival.
* **What they can do**:
  - View invoices, receipts, assignments, and report cards for their children.
  - Message teachers directly through the communication portal.
* **Strict Security Boundaries**:
  - **Zero Cross-Ward Access**: Completely prohibited from seeing other parents' children, phone numbers, addresses, or academic records.

---

### 15. Student (`ROLE_STUDENT`)
* **Who it is**: Enrolled pupil or scholar.
* **Scope**: Their personal enrolled classes and profile.
* **Core Responsibilities**:
  - Attends online courses, reads lesson materials, and downloads resources.
  - Submits homework assignments (PDF, Word, Code) before deadlines.
  - Takes online multiple-choice and subjective quizzes.
  - Views personal exam schedules, timetable, admit cards, and report cards.
* **What they can do**:
  - Check out library books and submit hostel leave requests.
  - View attendance records and personal financial billing status.
* **Strict Security Boundaries**:
  - Read-only access to published curriculum; strictly blocked from viewing unpublished exams, other students' grades, or financial audit ledgers.

---

### 16. Auditor (`ROLE_AUDITOR`)
* **Who it is**: Internal School Inspector, External Board Examiner, or Financial Auditor.
* **Scope**: Institutional records in **Strict Read-Only Mode**.
* **Core Responsibilities**:
  - Inspects financial journals, ledgers, and payment allocation trails.
  - Audits examination moderation logs to verify that marks were not altered fraudulently.
  - Reviews student attendance percentages for accreditation compliance.
* **What they can do**:
  - `GET /api/v1/finance/ledger` — Inspect double-entry audit balance sheets.
  - `GET /api/v1/analytics/dashboard` — Review school-wide KPI dashboards.
  - Export audit logs to CSV/Excel for regulatory boards.
* **Strict Security Boundaries**:
  - **Zero Write Access**: Strictly blocked from creating, updating, or deleting any record (`POST`, `PUT`, `DELETE` operations return HTTP 403 Forbidden).

---

## 4. Multi-Tenant Scoping Guarantee

Every request to the LMS API passes through the `tenantMiddleware` and `rbacMiddleware`:

1. **Authentication**: The JWT is validated; user role and `institutionId` are extracted.
2. **Tenant Verification**: If an `institutionId` is in the URL route (e.g., `/api/v1/students?institutionId=XYZ`), the middleware validates that `user.institutionId === req.institutionId`.
3. **Role Authorization**: The route checks `requireRoles([UserRole.ROLE_...])`. If the user lacks the role, an immediate HTTP 403 Forbidden is returned.
4. **Prisma Query Isolation**: The service layer injects `where: { institutionId: user.institutionId }` into every database operation.

This multi-tiered security pattern ensures complete isolation between campuses and roles.

---

## 5. Authorized Entity Operations & Recovery Manual

### 5.1 Database Backup & Disaster Recovery
* **Authorized Roles**: `ROLE_SUPER_ADMIN`, `ROLE_INSTITUTION_ADMIN`.
* **Access Point**: Navigation `Settings` > `Database Backup` tab.
* **API Route**: `GET /api/v1/system/backup`.
* **Functionality**:
  - Exports a complete, encrypted JSON database snapshot scoped to the institution (or full platform for super admins).
  - Backs up all academic entities: students, teacher profiles, teacher assignments, courses, modules, assignments, submissions, exam marks, report cards, and fee invoices.
  - Automatically triggers browser download with timestamped filename `lms_database_backup_{timestamp}.json`.

### 5.2 Recycle Bin (Trash) with Restore & Permanent Delete
* **Authorized Roles**: `ROLE_SUPER_ADMIN`, `ROLE_INSTITUTION_ADMIN`.
* **Access Point**: Navigation `Settings` > `Recycle Bin (Trash)` tab.
* **Deletion Buttons**: Located on `StudentsPage` (table action "Delete (To Bin)") and `CoursesPage` ("Delete Course (To Bin)").
* **Two Operating Options in Bin**:
  1. **Restore Record** (`POST /api/v1/system/recycle-bin/:id/restore`):
     - Restores soft-deleted student status back to `ENROLLED` or course to `isPublished: true`.
     - Immediately returns the record to active rosters and class directories without data loss.
  2. **Permanent Delete** (`DELETE /api/v1/system/recycle-bin/:id`):
     - Requires explicit confirmation dialog.
     - Permanently removes the record and associated cascade records from PostgreSQL.

### 5.3 Teacher Multi-Subject & Class Assignment Allocation with PDF Instructions
* **Authorized Roles**: `ROLE_SUBJECT_TEACHER`, `ROLE_CLASS_TEACHER`, `ROLE_INSTITUTION_ADMIN`, `ROLE_ACADEMIC_HEAD`.
* **Access Point**: `Courses & LMS` > `+ Post Assignment` modal.
* **Functionality**:
  - **Explicit Subject & Class/Section Picker**: Teachers assigned to multiple subjects (e.g. Biology & Mathematics) or multiple classes (e.g. Class 9-A & Class 10-B) choose the exact target course allocation from an explicit dropdown.
  - **Instruction Worksheet (PDF) Attachment**: Teachers can attach a PDF problem set, question paper, or reading guide directly.
  - **View & Download Capabilities**: Both students and teachers can preview the attached worksheet in the modal or download the raw PDF directly to their computer.

### 5.4 Teacher LMS Course Creation Scope & Subject Assignment Enforcement
* **Authorized Roles**: `ROLE_SUBJECT_TEACHER`, `ROLE_CLASS_TEACHER`.
* **Access Point**: `Courses & LMS` > `+ Create New Course` modal.
* **Security & Invariants**:
  - **Rule 3 & 4 Compliance**: Backend validation via `LmsService.createCourse` strictly verifies that a non-admin teacher has an active `teacherAssignment` record matching the chosen `subjectId` and `sectionId`.
  - **Automatic RBAC Blocking**: Attempting to create a course for an unassigned subject or section returns an immediate `HTTP 403 Forbidden` (`Access Denied: You are not assigned to teach this subject in this class section`).
  - **Dropdown Filtering**: The UI dropdown for `Subject` only displays subjects officially allocated to the teacher (e.g., Mathematics, Chemistry, Biology).
  - **Cascading Target Section Filter**: Selecting a subject automatically restricts the `Target Section` dropdown to the exact classes where the teacher is assigned that subject.
  - **Locked Faculty Field**: The assigned teacher field is locked to the logged-in teacher's verified profile, preventing cross-faculty course spoofing.

### 5.5 Dynamic Faculty Dashboard & Official Teaching Allocations Roster
* **Authorized Roles**: `ROLE_SUBJECT_TEACHER`, `ROLE_CLASS_TEACHER`.
* **Access Point**: `Dashboard Overview` (`/`).
* **Dynamic Analytics Engine**:
  - Fetches real, live academic counts from `GET /api/v1/analytics/dashboard`.
  - **Assigned Subjects Count**: Displays the exact number of distinct curriculum subjects allocated by administration (e.g., Isaac Newton displays 3: Advanced Mathematics, Chemistry, Biology).
  - **Class Allocations**: Total number of distinct class section teaching assignments across terms.
  - **Active LMS Courses**: Total courses currently published and active in the teacher's portfolio.
  - **Pending Grading Queue**: Real-time count of student PDF submissions awaiting teacher grading and rubric evaluation.
  - **Teaching Roster Panel**: An official table displaying Subject Name, Subject Code, Grade/Class, Section, Academic Term, and verified LMS Course Authorization status.


