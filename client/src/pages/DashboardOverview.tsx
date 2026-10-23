import React from 'react';
import { useAuth } from '../context/AuthContext';
import {
  Users,
  GraduationCap,
  BookOpen,
  CalendarCheck,
  CreditCard,
  Building,
  Shield,
  Award,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  Library,
  Bus,
  HeartHandshake,
} from 'lucide-react';

export const DashboardOverview: React.FC = () => {
  const { user } = useAuth();

  if (!user) return null;

  const role = user.role;

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-primary-600 bg-primary-50 px-2.5 py-1 rounded-md">
            {role.replace('ROLE_', '').replace(/_/g, ' ')}
          </span>
          <h1 className="text-2xl font-bold text-slate-900 mt-2">
            Welcome back, {user.firstName}!
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Institution: <span className="font-medium text-slate-700">{user.institutionName || 'Platform Global'}</span> &bull; Academic Term: Fall 2026
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="px-3 py-2 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-600">
            <span className="text-slate-400 block text-[10px] uppercase font-semibold">System Time</span>
            <span className="font-mono font-medium">{new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span>
          </div>
        </div>
      </div>

      {/* Role-Specific Dashboard Views */}
      {role === 'ROLE_SUPER_ADMIN' && <SuperAdminDashboard />}
      {role === 'ROLE_INSTITUTION_ADMIN' && <InstitutionAdminDashboard />}
      {role === 'ROLE_ACADEMIC_HEAD' && <AcademicHeadDashboard />}
      {role === 'ROLE_CLASS_TEACHER' && <ClassTeacherDashboard />}
      {role === 'ROLE_SUBJECT_TEACHER' && <SubjectTeacherDashboard />}
      {role === 'ROLE_TEACHING_ASSISTANT' && <TeachingAssistantDashboard />}
      {role === 'ROLE_EXAM_CONTROLLER' && <ExamControllerDashboard />}
      {role === 'ROLE_FINANCE_HEAD' && <FinanceHeadDashboard />}
      {role === 'ROLE_FEE_CLERK' && <FeeClerkDashboard />}
      {role === 'ROLE_LIBRARIAN' && <LibrarianDashboard />}
      {role === 'ROLE_TRANSPORT_COORDINATOR' && <TransportCoordinatorDashboard />}
      {role === 'ROLE_HOSTEL_WARDEN' && <HostelWardenDashboard />}
      {role === 'ROLE_COUNSELOR' && <CounselorDashboard />}
      {role === 'ROLE_PARENT' && <ParentDashboard />}
      {role === 'ROLE_STUDENT' && <StudentDashboard />}
      {role === 'ROLE_AUDITOR' && <AuditorDashboard />}
    </div>
  );
};

// 1. Super Admin
const SuperAdminDashboard: React.FC = () => (
  <div className="space-y-6">
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <StatCard title="Active Institutions" value="2" icon={Building} change="+1 this month" color="text-blue-600" />
      <StatCard title="Total Platform Users" value="18" icon={Users} change="100% Active" color="text-emerald-600" />
      <StatCard title="System Audit Events" value="48" icon={Shield} change="Tamper-evident" color="text-purple-600" />
      <StatCard title="Platform Uptime" value="99.98%" icon={CheckCircle2} change="All services UP" color="text-green-600" />
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="bg-white p-6 rounded-2xl border border-slate-200">
        <h3 className="text-base font-semibold text-slate-900 mb-4">Provisioned Institutions</h3>
        <div className="divide-y divide-slate-100">
          <div className="py-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-800">Alpha Academy (ALPHA)</p>
              <p className="text-xs text-slate-500">100 Innovation Way &bull; 16 Roles Active</p>
            </div>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">Active</span>
          </div>
          <div className="py-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-800">Beta Institute (BETA)</p>
              <p className="text-xs text-slate-500">200 Heritage Blvd &bull; Branch Campus</p>
            </div>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">Active</span>
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl border border-slate-200">
        <h3 className="text-base font-semibold text-slate-900 mb-4">Platform Security & Audit Status</h3>
        <ul className="space-y-3 text-sm text-slate-600">
          <li className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <span>Multi-Tenant Row-Level Isolation: <strong>Enforced</strong></span>
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <span>JWT Access Token Lifetime: <strong>15 Minutes (Active)</strong></span>
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <span>Refresh Token Rotation & Invalidation: <strong>Enabled</strong></span>
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <span>Maker-Checker Dual Approval Guard: <strong>Active</strong></span>
          </li>
        </ul>
      </div>
    </div>
  </div>
);

// 2. Institution Admin / Principal
const InstitutionAdminDashboard: React.FC = () => (
  <div className="space-y-6">
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <StatCard title="Enrolled Students" value="1" icon={GraduationCap} change="Grade 10 Roster" color="text-blue-600" />
      <StatCard title="Faculty & Staff" value="7" icon={Users} change="All Departments" color="text-indigo-600" />
      <StatCard title="Today's Attendance" value="100%" icon={CalendarCheck} change="Homeroom logged" color="text-emerald-600" />
      <StatCard title="Term Fee Collection" value="$0.00 / $1,200" icon={CreditCard} change="1 Outstanding Invoice" color="text-amber-600" />
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200">
        <h3 className="text-base font-semibold text-slate-900 mb-3">Academic Operations Status</h3>
        <p className="text-sm text-slate-600 mb-4">
          All modules for Alpha Academy are operating under academic year <strong>2026-2027</strong>.
        </p>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-slate-400 block font-medium">Classes Configured</span>
            <span className="text-base font-bold text-slate-800">Grade 10 - Section A</span>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-slate-400 block font-medium">Active Courses</span>
            <span className="text-base font-bold text-slate-800">Adv Mathematics (MATH-10-A)</span>
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl border border-slate-200">
        <h3 className="text-base font-semibold text-slate-900 mb-3">Quick Approvals</h3>
        <div className="space-y-2 text-xs">
          <div className="p-2.5 bg-slate-50 rounded-lg flex items-center justify-between">
            <span>Grade Overrides</span>
            <span className="font-semibold text-slate-500">0 Pending</span>
          </div>
          <div className="p-2.5 bg-slate-50 rounded-lg flex items-center justify-between">
            <span>Staff Leave Requests</span>
            <span className="font-semibold text-slate-500">0 Pending</span>
          </div>
          <div className="p-2.5 bg-slate-50 rounded-lg flex items-center justify-between">
            <span>Transfer Clearances</span>
            <span className="font-semibold text-slate-500">0 Pending</span>
          </div>
        </div>
      </div>
    </div>
  </div>
);

// 3. Academic Head
const AcademicHeadDashboard: React.FC = () => (
  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
    <StatCard title="Department Syllabus Progress" value="68%" icon={BookOpen} change="+4% this week" color="text-blue-600" />
    <StatCard title="Lesson Plans Submitted" value="12 / 12" icon={CheckCircle2} change="All reviewed" color="text-emerald-600" />
    <StatCard title="Grade Moderation Requests" value="0" icon={Award} change="Exam period pending" color="text-purple-600" />
  </div>
);

// 4. Class Teacher
const ClassTeacherDashboard: React.FC = () => (
  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
    <StatCard title="Homeroom Roster" value="Grade 10-A" icon={Users} change="1 Enrolled Student" color="text-blue-600" />
    <StatCard title="Daily Attendance" value="Marked" icon={CalendarCheck} change="Today: Present" color="text-emerald-600" />
    <StatCard title="Behavior Concerns" value="0" icon={HeartHandshake} change="No flags" color="text-slate-600" />
  </div>
);

// 5. Subject Teacher
const SubjectTeacherDashboard: React.FC = () => (
  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
    <StatCard title="My Courses" value="1" icon={BookOpen} change="MATH-10-A (Adv Math)" color="text-blue-600" />
    <StatCard title="Pending Grading" value="1" icon={Clock} change="Assignment 1" color="text-amber-600" />
    <StatCard title="Active Quizzes" value="1" icon={Award} change="Polynomial Basics" color="text-indigo-600" />
  </div>
);

// 6. Teaching Assistant
const TeachingAssistantDashboard: React.FC = () => (
  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
    <StatCard title="Assigned Courses" value="1" icon={BookOpen} change="Physics I Lab" color="text-blue-600" />
    <StatCard title="Discussion Threads" value="2" icon={Users} change="Student questions" color="text-indigo-600" />
    <StatCard title="Grading Queue" value="0" icon={Clock} change="Up to date" color="text-emerald-600" />
  </div>
);

// 7. Exam Controller
const ExamControllerDashboard: React.FC = () => (
  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
    <StatCard title="Exam Term" value="Fall 2026" icon={Award} change="Schedules set" color="text-purple-600" />
    <StatCard title="Marks Entry Status" value="In Progress" icon={Clock} change="Window open" color="text-amber-600" />
    <StatCard title="Grade Corrections" value="0" icon={CheckCircle2} change="Maker-Checker Ready" color="text-emerald-600" />
  </div>
);

// 8. Finance Head (Checker)
const FinanceHeadDashboard: React.FC = () => (
  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
    <StatCard title="Receivable Balance" value="$1,200.00" icon={CreditCard} change="1 Active Invoice" color="text-blue-600" />
    <StatCard title="Pending Waivers (Checker)" value="0" icon={AlertTriangle} change="Dual approval queue" color="text-amber-600" />
    <StatCard title="Ledger Postings" value="Balanced" icon={CheckCircle2} change="Double-entry audited" color="text-emerald-600" />
  </div>
);

// 9. Fee Clerk (Maker)
const FeeClerkDashboard: React.FC = () => (
  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
    <StatCard title="Daily Collections" value="$0.00" icon={CreditCard} change="Counter open" color="text-blue-600" />
    <StatCard title="Unpaid Invoices" value="1" icon={AlertTriangle} change="INV-2026-0001" color="text-amber-600" />
    <StatCard title="Draft Waivers (Maker)" value="0" icon={Clock} change="Requires Finance Head" color="text-slate-600" />
  </div>
);

// 10. Librarian
const LibrarianDashboard: React.FC = () => (
  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
    <StatCard title="Catalog Titles" value="120" icon={Library} change="Dewey Classified" color="text-blue-600" />
    <StatCard title="Books Borrowed" value="0" icon={Clock} change="Available for loan" color="text-emerald-600" />
    <StatCard title="Overdue Fines" value="$0.00" icon={CreditCard} change="No overdue loans" color="text-slate-600" />
  </div>
);

// 11. Transport Coordinator
const TransportCoordinatorDashboard: React.FC = () => (
  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
    <StatCard title="Active Routes" value="1" icon={Bus} change="Route 4 - North" color="text-blue-600" />
    <StatCard title="Vehicles Deployed" value="1" icon={CheckCircle2} change="Capacity: 30" color="text-emerald-600" />
    <StatCard title="Student Allocations" value="1" icon={Users} change="Pickups assigned" color="text-indigo-600" />
  </div>
);

// 12. Hostel Warden
const HostelWardenDashboard: React.FC = () => (
  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
    <StatCard title="Hostel Blocks" value="1" icon={Building} change="Boys Block A" color="text-blue-600" />
    <StatCard title="Bed Occupancy" value="1 / 40" icon={Users} change="Room 101 Assigned" color="text-emerald-600" />
    <StatCard title="Active Gate Passes" value="0" icon={Clock} change="No pending passes" color="text-slate-600" />
  </div>
);

// 13. Counselor
const CounselorDashboard: React.FC = () => (
  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
    <StatCard title="Active Welfare Cases" value="0" icon={HeartHandshake} change="Confidential storage" color="text-blue-600" />
    <StatCard title="At-Risk Alerts" value="0" icon={AlertTriangle} change="Threshold normal" color="text-emerald-600" />
    <StatCard title="Scheduled Sessions" value="0" icon={Clock} change="Open calendar" color="text-purple-600" />
  </div>
);

// 14. Parent
const ParentDashboard: React.FC = () => (
  <div className="space-y-6">
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <StatCard title="Linked Child" value="Alice Doe" icon={GraduationCap} change="Grade 10 - Section A" color="text-blue-600" />
      <StatCard title="Attendance Rate" value="100%" icon={CalendarCheck} change="All days present" color="text-emerald-600" />
      <StatCard title="Outstanding Fee" value="$1,200.00" icon={CreditCard} change="Due Sep 1, 2026" color="text-amber-600" />
    </div>
    <div className="bg-white p-6 rounded-2xl border border-slate-200">
      <h3 className="text-base font-semibold text-slate-900 mb-2">Student Progress Overview</h3>
      <p className="text-sm text-slate-600">
        Alice is enrolled in <strong>Grade 10 Advanced Mathematics</strong>. Her current assignments and report card are accessible in the LMS and Exam tabs.
      </p>
    </div>
  </div>
);

// 15. Student
const StudentDashboard: React.FC = () => (
  <div className="space-y-6">
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <StatCard title="Enrolled Course" value="Grade 10 Math" icon={BookOpen} change="1 Active Course" color="text-blue-600" />
      <StatCard title="Assignments Due" value="1" icon={Clock} change="Due in 7 days" color="text-amber-600" />
      <StatCard title="My Attendance" value="100%" icon={CalendarCheck} change="Present" color="text-emerald-600" />
    </div>
    <div className="bg-white p-6 rounded-2xl border border-slate-200">
      <h3 className="text-base font-semibold text-slate-900 mb-2">Upcoming Coursework</h3>
      <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
        <div>
          <span className="text-xs font-semibold text-primary-600 uppercase">Assignment 1</span>
          <p className="text-sm font-bold text-slate-800">Factoring Higher Degree Polynomials</p>
          <p className="text-xs text-slate-500">Max Points: 100 &bull; Late Submissions Allowed (10% penalty)</p>
        </div>
        <span className="px-3 py-1 bg-primary-600 text-white rounded-lg text-xs font-medium">Pending Submission</span>
      </div>
    </div>
  </div>
);

// 16. Auditor
const AuditorDashboard: React.FC = () => (
  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
    <StatCard title="Audit Event Stream" value="Tamper Evident" icon={Shield} change="Append-only log" color="text-purple-600" />
    <StatCard title="Integrity Checks" value="100% Passed" icon={CheckCircle2} change="Zero discrepancies" color="text-emerald-600" />
    <StatCard title="Compliance Standard" value="OWASP / SOC2" icon={Award} change="Verified" color="text-blue-600" />
  </div>
);

// Reusable Metric Stat Card
interface StatCardProps {
  title: string;
  value: string;
  icon: React.ElementType;
  change: string;
  color: string;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, icon: Icon, change, color }) => (
  <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
    <div className="flex items-center justify-between">
      <span className="text-xs font-medium text-slate-500">{title}</span>
      <div className={`p-2 rounded-lg bg-slate-50 ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
    </div>
    <p className="text-2xl font-bold text-slate-900 mt-2">{value}</p>
    <p className="text-xs text-slate-500 mt-1">{change}</p>
  </div>
);
