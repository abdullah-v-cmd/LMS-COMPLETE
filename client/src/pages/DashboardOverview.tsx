import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../api/client';
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

interface TeacherDashboardAnalytics {
  teacher: {
    teacherProfileId: string;
    courses: number;
    assignments: number;
    assignedSubjectsCount: number;
    assignedSectionsCount: number;
    totalAllocations: number;
    pendingGrading: number;
    assignedSubjects: { id: string; name: string; code: string }[];
    allocations: {
      id: string;
      subjectId: string;
      subjectName: string;
      subjectCode: string;
      sectionId: string;
      sectionName: string;
      gradeName: string;
      termName: string;
    }[];
  } | null;
}

// 4. Class Teacher
const ClassTeacherDashboard: React.FC = () => {
  const { data: dashData, isLoading } = useQuery<TeacherDashboardAnalytics>({
    queryKey: ['class-teacher-dashboard-analytics'],
    queryFn: async () => {
      const res = await apiClient.get('/analytics/dashboard');
      return res.data.data;
    },
    refetchInterval: 30000,
  });

  const teacher = dashData?.teacher;
  const subjectsCount = teacher?.assignedSubjectsCount ?? 0;
  const allocations = teacher?.allocations ?? [];
  const coursesCount = teacher?.courses ?? 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard title="Homeroom Roster" value="Grade 10-A" icon={Users} change="1 Enrolled Student" color="text-blue-600" />
        <StatCard title="Daily Attendance" value="Marked" icon={CalendarCheck} change="Today: Homeroom Logged" color="text-emerald-600" />
        <StatCard
          title="Assigned Subjects"
          value={isLoading ? '...' : String(subjectsCount)}
          icon={BookOpen}
          change={teacher?.assignedSubjects.map((s) => s.name).join(', ') || 'Academic Roster'}
          color="text-indigo-600"
        />
        <StatCard
          title="Active LMS Courses"
          value={isLoading ? '...' : String(coursesCount)}
          icon={Award}
          change={`${allocations.length} total class allocations`}
          color="text-purple-600"
        />
      </div>

      {allocations.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-indigo-600" />
                Teaching Allocations & Subject Assignments
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Official subjects and class sections assigned to your faculty profile.
              </p>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-full border border-indigo-100">
              {allocations.length} Active {allocations.length === 1 ? 'Allocation' : 'Allocations'}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider font-semibold">
                <tr>
                  <th className="py-2.5 px-3 rounded-l-lg">Subject</th>
                  <th className="py-2.5 px-3">Code</th>
                  <th className="py-2.5 px-3">Class & Section</th>
                  <th className="py-2.5 px-3">Academic Term</th>
                  <th className="py-2.5 px-3 rounded-r-lg text-right">LMS Course Authorization</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {allocations.map((alloc) => (
                  <tr key={alloc.id} className="hover:bg-slate-50/70 transition">
                    <td className="py-3 px-3 font-semibold text-slate-900">{alloc.subjectName}</td>
                    <td className="py-3 px-3 font-mono text-xs text-slate-500">{alloc.subjectCode}</td>
                    <td className="py-3 px-3 font-medium">{alloc.gradeName} - Section {alloc.sectionName}</td>
                    <td className="py-3 px-3 text-xs text-slate-500">{alloc.termName}</td>
                    <td className="py-3 px-3 text-right">
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        Authorized
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

// 5. Subject Teacher
const SubjectTeacherDashboard: React.FC = () => {
  const { data: dashData, isLoading } = useQuery<TeacherDashboardAnalytics>({
    queryKey: ['subject-teacher-dashboard-analytics'],
    queryFn: async () => {
      const res = await apiClient.get('/analytics/dashboard');
      return res.data.data;
    },
    refetchInterval: 30000,
  });

  const teacher = dashData?.teacher;
  const subjectsCount = teacher?.assignedSubjectsCount ?? 0;
  const sectionsCount = teacher?.assignedSectionsCount ?? 0;
  const coursesCount = teacher?.courses ?? 0;
  const pendingGradingCount = teacher?.pendingGrading ?? 0;
  const allocations = teacher?.allocations ?? [];
  const assignedSubjects = teacher?.assignedSubjects ?? [];

  return (
    <div className="space-y-6">
      {/* Dynamic Key Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Assigned Subjects"
          value={isLoading ? '...' : String(subjectsCount)}
          icon={BookOpen}
          change={assignedSubjects.map((s) => s.name).join(', ') || 'Official Curriculum'}
          color="text-indigo-600"
        />
        <StatCard
          title="Class Allocations"
          value={isLoading ? '...' : String(allocations.length)}
          icon={Users}
          change={`${sectionsCount} unique class sections`}
          color="text-blue-600"
        />
        <StatCard
          title="Active LMS Courses"
          value={isLoading ? '...' : String(coursesCount)}
          icon={Award}
          change="Published learning modules"
          color="text-emerald-600"
        />
        <StatCard
          title="Pending Grading"
          value={isLoading ? '...' : String(pendingGradingCount)}
          icon={Clock}
          change={pendingGradingCount > 0 ? `${pendingGradingCount} awaiting evaluation` : 'All submissions graded'}
          color={pendingGradingCount > 0 ? 'text-amber-600' : 'text-slate-600'}
        />
      </div>

      {/* Official Teaching Allocations & Roster */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4 mb-4">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-indigo-600" />
              Official Teaching Allocations & Course Authorization Roster
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Verified subjects and classes allocated to your faculty profile by school administration.
            </p>
          </div>
          <span className="text-xs font-semibold px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full border border-indigo-100 self-start sm:self-auto">
            {allocations.length} Active Teaching {allocations.length === 1 ? 'Allocation' : 'Allocations'}
          </span>
        </div>

        {isLoading ? (
          <div className="py-8 text-center text-sm text-slate-500">Loading teaching assignments...</div>
        ) : allocations.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-500">
            No teaching subjects or classes are currently allocated to your account. Please contact the Academic Head.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider font-semibold">
                <tr>
                  <th className="py-3 px-4 rounded-l-lg">Subject Name</th>
                  <th className="py-3 px-4">Subject Code</th>
                  <th className="py-3 px-4">Grade / Class</th>
                  <th className="py-3 px-4">Section</th>
                  <th className="py-3 px-4">Academic Term</th>
                  <th className="py-3 px-4 rounded-r-lg text-right">LMS Course Permission</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {allocations.map((alloc) => (
                  <tr key={alloc.id} className="hover:bg-slate-50/70 transition">
                    <td className="py-3.5 px-4 font-semibold text-slate-900 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-indigo-500 inline-block"></span>
                      {alloc.subjectName}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-xs text-slate-500">{alloc.subjectCode}</td>
                    <td className="py-3.5 px-4 font-medium">{alloc.gradeName}</td>
                    <td className="py-3.5 px-4">
                      <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-slate-100 text-slate-700">
                        Section {alloc.sectionName}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-500">{alloc.termName}</td>
                    <td className="py-3.5 px-4 text-right">
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        Authorized
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

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
const ParentDashboard: React.FC = () => {
  const [selectedChildId, setSelectedChildId] = useState<string>('');

  const { data: children = [], isLoading } = useQuery<any[]>({
    queryKey: ['parent-linked-children'],
    queryFn: async () => {
      const res = await apiClient.get('/students');
      return res.data?.data || [];
    },
  });

  const selectedChild =
    children.find((c) => c.id === selectedChildId) || children[0] || null;

  const { data: invoices = [] } = useQuery<any[]>({
    queryKey: ['parent-child-invoices', selectedChild?.id],
    queryFn: async () => {
      if (!selectedChild) return [];
      const res = await apiClient.get('/finance/invoices');
      return (res.data?.data || []).filter((inv: any) => inv.studentId === selectedChild.id);
    },
    enabled: Boolean(selectedChild),
  });

  const totalOutstanding = invoices.reduce(
    (sum: number, inv: any) => sum + (inv.balanceAmount || 0),
    0
  );

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
        Loading family records…
      </div>
    );
  }

  if (children.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
        <Users className="mx-auto mb-3 h-12 w-12 text-slate-400" />
        <h3 className="text-base font-bold text-slate-800">No Linked Students Found</h3>
        <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
          Your parent account is currently not linked to any enrolled student records. Please contact your school administrator to link your child's student admission record.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Child Selector if multiple children */}
      {children.length > 1 && (
        <div className="flex flex-col gap-2 rounded-2xl border border-primary-100 bg-primary-50/50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-bold text-primary-950">Select Student Portal</h3>
            <p className="text-xs text-primary-700">You have {children.length} children linked to your parent account.</p>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="child-select" className="text-xs font-semibold text-slate-600">Child:</label>
            <select
              id="child-select"
              value={selectedChild.id}
              onChange={(e) => setSelectedChildId(e.target.value)}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
            >
              {children.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.user?.firstName} {c.user?.lastName} ({c.section?.classGrade?.name} - {c.section?.name})
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          title="Active Student"
          value={`${selectedChild.user?.firstName} ${selectedChild.user?.lastName}`}
          icon={GraduationCap}
          change={`${selectedChild.section?.classGrade?.name || 'Class'} · Section ${selectedChild.section?.name || 'A'} (Adm: ${selectedChild.admissionNumber})`}
          color="text-blue-600"
        />
        <StatCard
          title="Attendance Status"
          value="Enrolled & Active"
          icon={CalendarCheck}
          change={`Roll Number: ${selectedChild.rollNumber || 'N/A'}`}
          color="text-emerald-600"
        />
        <StatCard
          title="Outstanding Tuition Balance"
          value={`$${totalOutstanding.toFixed(2)}`}
          icon={CreditCard}
          change={invoices.length > 0 ? `${invoices.length} invoices issued` : 'All invoices settled'}
          color={totalOutstanding > 0 ? 'text-amber-600' : 'text-emerald-600'}
        />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-base font-semibold text-slate-900 mb-2">Student Academic Overview</h3>
        <p className="text-sm text-slate-600">
          Showing academic and financial progress for <strong>{selectedChild.user?.firstName} {selectedChild.user?.lastName}</strong>.
          You can view course lesson materials in LMS, check test marks in Examinations, and download official verified report cards through your parent portal.
        </p>
      </div>
    </div>
  );
};

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
