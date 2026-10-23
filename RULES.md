# Non-Negotiable Engineering Rules (RULES.md)

This project strictly adheres to the following 16 core engineering laws and operational rules. Every engineer and automated agent must comply without exception.

---

### Rule 1: No Secrets in Source Code or Version Control
Never hardcode passwords, JWT secrets, database connection strings, or encryption keys in source code, documentation, Git history, or console logs. All configuration must be supplied via typed environment variables (`.env`) with safe, non-sensitive defaults in `.env.example`.

### Rule 2: No Production Use of Hardcoded Demo Users or Fake API Responses
Demo fixtures and seed accounts must be isolated strictly to development and testing environments (`prisma/seed.ts`). Production execution paths must never contain synthetic bypasses, dummy data overrides, or mock responses.

### Rule 3: No Authorization Based Solely on Frontend Visibility
Hiding a navigation link or button in the React UI is a convenience feature, NEVER a security control. Every single API route must enforce authenticated identity, role verification, and granular permission checking on the server.

### Rule 4: Validate Identity, Permission, Scope, and Resource Ownership on Every Protected API
Every protected request must pass through:
1. Token validation (JWT integrity, expiry, revocation check).
2. Tenant scope validation (`tenant_id` matches user's institution).
3. RBAC/Permission check (user has necessary granular capability).
4. Resource ownership check (prevent Insecure Direct Object Reference / IDOR).

### Rule 5: Every Database Schema Change Must Have a Migration
No ad-hoc SQL modifications or untracked schema mutations. Every alteration to PostgreSQL models, fields, relations, indexes, or constraints must be executed through Prisma Migrate and committed to the repository with migration history.

### Rule 6: All Inputs Must Be Validated on the Server
Never trust incoming client data. Every payload (request body, query parameters, URL route parameters, and headers) must be validated with Zod schemas before being passed to business logic or database queries.

### Rule 7: All Sensitive Actions Must Be Audited
Financial transactions, grade modifications, user role elevations, student status changes, deletions, and administrative overrides must record an immutable `AuditEvent` capturing the acting user, entity, entity ID, previous state, new state, IP address, and timestamp.

### Rule 8: Financial and Examination Approvals Must Follow Maker-Checker Rules
A single individual cannot both initiate and approve sensitive operations.
- Fee waivers and refunds must be drafted by a Fee Clerk (Maker) and approved by a Finance Head (Checker).
- Grade modifications and exam score moderation must be drafted by a Subject Teacher (Maker) and approved by an Academic Head or Exam Controller (Checker).
- Self-approval is strictly forbidden and rejected at the API layer.

### Rule 9: Destructive Actions Must Follow Explicit Authorization and Confirmation Workflows
Destructive operations (institution deactivation, student expulsion/drop, fee record cancellation) must require explicit role privileges, confirmation payload tokens, and must prefer soft-deletion with audit history where data retention laws require.

### Rule 10: No Silent Swallowing of Exceptions
Catch blocks must never be empty or merely log and continue as if an operation succeeded. Exceptions must be logged with contextual structured metadata and converted into appropriate RFC-compliant error responses.

### Rule 11: No Placeholder Buttons for Features Claimed to Be Complete
Do not present UI controls, buttons, or forms that do nothing, console.log only, or display fake success alerts. If a feature is incomplete, mark it clearly as IN_PROGRESS or NOT_STARTED in TASKS.md.

### Rule 12: No Fake Success Notifications When an Operation Fails
Frontend alert banners and toasts must reflect genuine API outcomes. Never show "Saved successfully" when an HTTP request fails, times out, or returns a 4xx/5xx code.

### Rule 13: No Unapproved Changes to Architecture or Business Rules
Preserve the agreed Modular Monolith architecture, technology stack (React + TypeScript + Vite + Tailwind CSS / Node.js + Express + TypeScript + PostgreSQL + Prisma), and multi-tenant schema model.

### Rule 14: No Hard Deletion of Protected Records Outside Authorized Workflows
Financial ledgers, student academic histories, attendance records, and audit events must be immutable or soft-deleted via active/deleted flags with retention trails to satisfy regulatory compliance.

### Rule 15: Automated Tests Must Accompany Critical Functionality
Every business service, authentication flow, authorization boundary, tenant isolation rule, and calculation engine must have automated test suites (Vitest / Supertest). Features are not done until tests pass.

### Rule 16: Never Mark a Task Complete Until Implementation and Verification Pass
A task may only move to `VERIFIED` in `TASKS.md` when:
- Code is implemented.
- Database persistence is proven.
- Authorization and tenant isolation are enforced.
- Automated tests have been executed and passed.
- Truthful verification evidence is documented in `TASKS.md`.
