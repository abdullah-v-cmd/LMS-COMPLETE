# Design System & User Experience Guidelines (DESIGN.md)

## 1. Visual Identity & Brand System
The **School LMS & Management Portal** adheres to an enterprise-grade, clean, academic aesthetic that conveys institutional trust, clarity, accessibility, and high information density.

### Color Tokens
- **Primary / Institutional Blue**:
  - `primary-50`: `#eff6ff`
  - `primary-100`: `#dbeafe`
  - `primary-500`: `#3b82f6`
  - `primary-600`: `#2563eb` (Brand Primary / Main CTAs)
  - `primary-700`: `#1d4ed8`
  - `primary-900`: `#1e3a8a`
- **Neutral / Slate Hierarchy**:
  - `slate-50`: `#f8fafc` (Background / Canvas)
  - `slate-100`: `#f1f5f9` (Subtle Card Background / Borders)
  - `slate-200`: `#e2e8f0` (Borders / Dividers)
  - `slate-500`: `#64748b` (Muted / Secondary text)
  - `slate-700`: `#334155` (Body text)
  - `slate-900`: `#0f172a` (Primary Headings)
- **Semantic Feedback Tokens**:
  - **Success**: Emerald (`emerald-600`: `#059669`, background `emerald-50`: `#ecfdf5`)
  - **Warning**: Amber (`amber-600`: `#d97706`, background `amber-50`: `#fffbeb`)
  - **Danger / Destructive**: Rose (`rose-600`: `#e11d48`, background `rose-50`: `#fff1f2`)
  - **Information**: Sky (`sky-600`: `#0284c7`, background `sky-50`: `#f0f9ff`)

### Typography
- **Font Family**: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif.
- **Scale**:
  - Display: `text-3xl font-bold tracking-tight text-slate-900`
  - Page Title: `text-2xl font-bold text-slate-900`
  - Section Header: `text-lg font-semibold text-slate-800`
  - Body: `text-sm text-slate-700 leading-relaxed`
  - Small / Caption: `text-xs font-medium text-slate-500`

---

## 2. Layout & Role-Specific Navigation
The portal adopts a persistent collapsible sidebar navigation paired with a top header bar containing tenant branding, role badges, notification bell, and user profile switcher.

### Distinct Dashboards for the 16 Roles:
1. **Super Admin**: Tenant overview, system health metrics, global tenant directory, platform audits, license tiers.
2. **Institution Admin**: Campus KPIs (total students, staff count, attendance rate today, fee collection summary), quick admission links, academic term controls.
3. **Academic Head**: Department syllabus progress, teacher workload meters, grade distribution charts, pending lesson plan approvals.
4. **Class Teacher**: Homeroom attendance tracker, student concern cards, weekly timetable view, class announcement board.
5. **Subject Teacher**: My Courses grid, active assignments awaiting grading, upcoming quizzes, quick grade entry shortcut.
6. **Teaching Assistant**: Assisted courses list, pending grading queue, student discussion threads needing replies.
7. **Exam Controller**: Examination schedule calendar, marks submission status by department, grade change requests queue, publication triggers.
8. **Finance Head**: Cashflow & fee revenue graphs, pending scholarship/waiver approvals (Checker queue), aging arrears summary.
9. **Junior Accountant**: Counter receipt generation modal, daily collection tally, defaulter search, receipt reprint tool.
10. **Librarian**: Book search, issue/return scan portal, overdue loans table, cataloging quick form.
11. **Transport Coordinator**: Active routes list, bus capacity metrics, driver contact sheet, transport incident log.
12. **Hostel Warden**: Hostel room occupancy matrix, pending gate passes, visitor check-in, mess roster.
13. **Counselor**: Active case records, scheduled intervention sessions, academic at-risk alerts list.
14. **Parent**: Child switcher pills, live attendance badge, academic report card preview, outstanding fee invoice & pay button.
15. **Student**: Enrolled courses with completion percentage, upcoming deadlines card, recent grades, timetable widget.
16. **Auditor**: Filterable immutable audit stream, compliance checklist, exportable transaction logs.

---

## 3. UI Component Standards
- **Data Tables**:
  - Alternating subtle row hover effects (`hover:bg-slate-50`).
  - Sticky header with sorting indicators on column clicks.
  - Multi-select checkboxes for batch operations.
  - Pagination controls (items per page, current page, total count).
  - Search input with 300ms debounce and faceted filter dropdowns.
- **Forms**:
  - Explicit `<label>` elements associated with `htmlFor`.
  - Required field indicators (`*`).
  - Inline validation error messages beneath inputs with `aria-live="polite"`.
  - Clear submit buttons with disabled state and spinner during pending mutations.
- **Dialogs & Modals**:
  - Accessible focus trap; pressing `Escape` closes the modal.
  - Destructive confirmations require explicit red action buttons and clear consequence warnings.
- **Feedback & States**:
  - **Loading**: Skeleton placeholders preserving layout dimensions to prevent layout shifts.
  - **Empty**: Informative illustrations/icons with "No records found" and actionable create button.
  - **Error**: Clear error banners with retry triggers.
  - **Success**: Non-blocking toast notifications auto-dismissing after 4 seconds.

---

## 4. Accessibility & Mobile Responsiveness
- **WCAG 2.1 AA Compliance**: All text-to-background contrast ratios strictly meet or exceed 4.5:1.
- **Focus Rings**: All interactive controls display high-visibility focus rings (`focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:outline-none`).
- **Responsive Breakpoints**:
  - Mobile (`< 768px`): Sidebar collapses to full-screen slide-over drawer; data tables stack or horizontally scroll with freeze-columns.
  - Tablet (`768px - 1024px`): Sidebar collapses to icon rail.
  - Desktop (`> 1024px`): Persistent 256px wide sidebar with expanded labels.
