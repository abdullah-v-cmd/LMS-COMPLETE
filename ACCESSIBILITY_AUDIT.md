# Accessibility (a11y) Review & WCAG 2.2 AA Audit (ACCESSIBILITY_AUDIT.md)

- **Date**: October 2026
- **Target Application**: School LMS Frontend (`client/`)
- **Technology Stack**: React 18, TypeScript, Tailwind CSS, Lucide React, React Router 7
- **Standard**: WCAG 2.2 Level AA

---

## 1. Overview & Methodology

This accessibility audit inspected the client components and pages for conformance with Web Content Accessibility Guidelines (WCAG) 2.2 AA. The audit examined keyboard navigation, visible focus management, landmark structure, accessible naming, screen reader status announcements, and form labeling across the application shell, navigation, and authentication flows.

> [!NOTE]
> Testing was performed via static DOM inspection, keyboard navigation analysis, and automated build verification. No physical screen-reader hardware audit (e.g. JAWS, NVDA) was claimed or conducted.

---

## 2. Accessibility Improvements Implemented

### 2.1 Landmark Hierarchy & Skip Navigation
- **Skip Link Added (`DashboardLayout.tsx`)**: An accessible skip link (`<a href="#main-content">Skip to main content</a>`) was placed at the top of the DOM. It remains visually hidden (`sr-only`) until focused via keyboard (`focus:not-sr-only`), allowing keyboard-only users to bypass repetitive sidebar navigation links.
- **Main Landmark (`<main id="main-content" tabIndex={-1}>`)**: Explicit `id` and `tabIndex={-1}` attributes enable clean focus transfer when activating skip links.
- **Navigation Landmarks (`Sidebar.tsx`, `Header.tsx`)**: Added `aria-label="Main Navigation"` to `<aside>`, `aria-label="Portal Navigation Links"` to `<nav>`, and `aria-label="Page Header"` to `<header>`.

### 2.2 Form Labeling & Error Announcements (`LoginPage.tsx`)
- **Explicit Label Associations**: Linked `<label htmlFor="usernameOrEmail">` to `<input id="usernameOrEmail">` and `<label htmlFor="password">` to `<input id="password">`. Added standard `autoComplete` hints (`username`, `current-password`).
- **Dynamic Live Regions**: Added `role="alert"` and `aria-live="assertive"` to the authentication error container to ensure screen readers immediately announce failed sign-in attempts.
- **Heading Hierarchy**: Promoted "Sign In to Portal" to a primary `<h1>` element, ensuring a single semantic top-level heading on the authentication page.

### 2.3 Interactive Controls & Accessible Names
- **Icon Buttons (`Header.tsx`)**: Added explicit `aria-label="View notifications"` to the notifications button and `aria-label="Sign Out of account"` to the logout button.
- **Decorative SVGs**: Added `aria-hidden="true"` to non-informative icons across Header, Sidebar, and Login forms to prevent screen reader stutter.
- **Screen Reader Text (`.sr-only`)**: Added hidden descriptive text for badges and notification dots (e.g., `<span className="sr-only">Unread notifications present</span>`).
- **Quick Demo Switcher**: Added `aria-label="Demo role accounts switcher"` on the 16-role demo panel and descriptive `aria-label="Select [Role] role: [email]"` on individual account buttons.

### 2.4 Keyboard Focus & Visible Rings
- Applied standard high-contrast visible focus rings using Tailwind utilities across interactive elements:
  - `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500` on form inputs and submit buttons.
  - `focus-visible:ring-primary-400` on sidebar navigation links.
  - `focus-visible:ring-rose-500` on the account sign-out button.

---

## 3. WCAG 2.2 AA Compliance Checklist

| Success Criterion | Level | Description | Implementation Status | Evidence / Notes |
|---|---|---|---|---|
| **1.3.1 Info and Relationships** | A | Semantic markup, headings, forms, landmarks | **VERIFIED** | `<main>`, `<nav>`, `<aside>`, `<header>`, `<h1>`, `<label htmlFor>` linked to inputs. |
| **2.1.1 Keyboard** | A | All functionality operable via keyboard | **VERIFIED** | All links, buttons, inputs, and demo switchers are keyboard-focusable without keyboard traps. |
| **2.4.1 Bypass Blocks** | A | Skip-to-content mechanism | **VERIFIED** | Skip to main content link implemented in `DashboardLayout.tsx`. |
| **2.4.3 Focus Order** | A | Logical sequential focus order | **VERIFIED** | DOM order matches visual reading order (Skip -> Nav -> Header -> Main content). |
| **2.4.7 Focus Visible** | AA | Visible keyboard focus indicator | **VERIFIED** | `focus-visible:ring-2` styling present across interactive components. |
| **3.3.1 Error Identification** | A | Error detected and described in text | **VERIFIED** | Textual error message with icon and description rendered. |
| **4.1.2 Name, Role, Value** | A | Accessible names for interactive controls | **VERIFIED** | Buttons have explicit text or `aria-label`s; decorative icons marked `aria-hidden="true"`. |
| **4.1.3 Status Messages** | AA | Dynamic status announcements | **VERIFIED** | `role="alert"` with `aria-live="assertive"` on login error container. |

---

## 4. Verification Evidence

- Client TypeScript type-checking and production build: **Passed in 8.5s (`npm run build:client` exited 0)**.
- Bundled CSS: 26.97 kB (contains all focus-visible and a11y classes).
- Bundled JS: 497.10 kB.
