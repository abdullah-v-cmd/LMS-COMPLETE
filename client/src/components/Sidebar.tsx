import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard,
  BookOpen,
  CalendarCheck,
  Award,
  CreditCard,
  Users,
  Settings,
  Shield,
  FileText,
  Bus,
  Building,
  HeartHandshake,
  GraduationCap,
  Library,
  MessageCircle,
  ClipboardList,
  Banknote,
} from 'lucide-react';

interface NavItem {
  name: string;
  to: string;
  icon: React.ElementType;
  roles?: string[];
}

export const Sidebar: React.FC = () => {
  const { user } = useAuth();

  const navItems: NavItem[] = [
    { name: 'Dashboard', to: '/dashboard', icon: LayoutDashboard },
    {
      name: 'Institutions',
      to: '/institutions',
      icon: Building,
      roles: ['ROLE_SUPER_ADMIN'],
    },
    {
      name: 'Academic Structure',
      to: '/academic',
      icon: GraduationCap,
      roles: ['ROLE_SUPER_ADMIN', 'ROLE_INSTITUTION_ADMIN', 'ROLE_ACADEMIC_HEAD'],
    },
    {
      name: 'Students & SIS',
      to: '/students',
      icon: Users,
      roles: [
        'ROLE_SUPER_ADMIN',
        'ROLE_INSTITUTION_ADMIN',
        'ROLE_ACADEMIC_HEAD',
        'ROLE_CLASS_TEACHER',
        'ROLE_COUNSELOR',
      ],
    },
    {
      name: 'Courses & LMS',
      to: '/courses',
      icon: BookOpen,
      roles: [
        'ROLE_SUPER_ADMIN',
        'ROLE_INSTITUTION_ADMIN',
        'ROLE_ACADEMIC_HEAD',
        'ROLE_SUBJECT_TEACHER',
        'ROLE_TEACHING_ASSISTANT',
        'ROLE_STUDENT',
        'ROLE_PARENT',
      ],
    },
    {
      name: 'Attendance',
      to: '/attendance',
      icon: CalendarCheck,
      roles: [
        'ROLE_SUPER_ADMIN',
        'ROLE_INSTITUTION_ADMIN',
        'ROLE_ACADEMIC_HEAD',
        'ROLE_CLASS_TEACHER',
        'ROLE_SUBJECT_TEACHER',
        'ROLE_TEACHING_ASSISTANT',
        'ROLE_STUDENT',
        'ROLE_PARENT',
        'ROLE_AUDITOR',
      ],
    },
    {
      name: 'Communication',
      to: '/communication',
      icon: MessageCircle,
      roles: [
        'ROLE_SUPER_ADMIN', 'ROLE_INSTITUTION_ADMIN', 'ROLE_ACADEMIC_HEAD',
        'ROLE_CLASS_TEACHER', 'ROLE_SUBJECT_TEACHER', 'ROLE_TEACHING_ASSISTANT',
        'ROLE_EXAM_CONTROLLER', 'ROLE_LIBRARIAN', 'ROLE_TRANSPORT_COORDINATOR',
        'ROLE_HOSTEL_WARDEN', 'ROLE_COUNSELOR', 'ROLE_PARENT', 'ROLE_STUDENT',
      ],
    },
    {
      name: 'Leave Requests',
      to: '/leave',
      icon: ClipboardList,
      roles: ['ROLE_SUPER_ADMIN', 'ROLE_INSTITUTION_ADMIN', 'ROLE_CLASS_TEACHER', 'ROLE_SUBJECT_TEACHER', 'ROLE_TEACHING_ASSISTANT'],
    },
    {
      name: 'Exams & Grades',
      to: '/exams',
      icon: Award,
      roles: [
        'ROLE_SUPER_ADMIN',
        'ROLE_INSTITUTION_ADMIN',
        'ROLE_ACADEMIC_HEAD',
        'ROLE_EXAM_CONTROLLER',
        'ROLE_SUBJECT_TEACHER',
        'ROLE_STUDENT',
        'ROLE_PARENT',
      ],
    },
    {
      name: 'Finance & Fees',
      to: '/finance',
      icon: CreditCard,
      roles: [
        'ROLE_SUPER_ADMIN',
        'ROLE_INSTITUTION_ADMIN',
        'ROLE_FINANCE_HEAD',
        'ROLE_FEE_CLERK',
        'ROLE_STUDENT',
        'ROLE_PARENT',
      ],
    },
    {
      name: 'Library',
      to: '/library',
      icon: Library,
      roles: ['ROLE_SUPER_ADMIN', 'ROLE_INSTITUTION_ADMIN', 'ROLE_LIBRARIAN', 'ROLE_STUDENT'],
    },
    {
      name: 'Transport',
      to: '/transport',
      icon: Bus,
      roles: ['ROLE_SUPER_ADMIN', 'ROLE_INSTITUTION_ADMIN', 'ROLE_TRANSPORT_COORDINATOR'],
    },
    { name: 'Payroll', to: '/payroll', icon: Banknote, roles: ['ROLE_INSTITUTION_ADMIN', 'ROLE_FINANCE_HEAD'] },
    {
      name: 'Hostel',
      to: '/hostel',
      icon: Building,
      roles: ['ROLE_SUPER_ADMIN', 'ROLE_INSTITUTION_ADMIN', 'ROLE_HOSTEL_WARDEN', 'ROLE_STUDENT'],
    },
    {
      name: 'Counseling',
      to: '/counseling',
      icon: HeartHandshake,
      roles: ['ROLE_SUPER_ADMIN', 'ROLE_INSTITUTION_ADMIN', 'ROLE_COUNSELOR'],
    },
    {
      name: 'Audit Logs',
      to: '/audits',
      icon: Shield,
      roles: ['ROLE_SUPER_ADMIN', 'ROLE_AUDITOR'],
    },
  ];

  const filteredNav = navItems.filter(
    (item) => !item.roles || (user && item.roles.includes(user.role))
  );

  return (
    <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col shrink-0 min-h-screen">
      <div className="h-16 flex items-center px-6 border-b border-slate-800">
        <span className="text-white font-bold tracking-tight text-lg">ANTIGRAVITY LMS</span>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {filteredNav.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                  isActive
                    ? 'bg-primary-600 text-white font-semibold'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`
              }
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{item.name}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-800 text-xs text-slate-500">
        <p>Local-First Edition</p>
        <p className="font-mono text-[10px] text-slate-600 mt-0.5">PostgreSQL 16 &bull; Express &bull; React</p>
      </div>
    </aside>
  );
};
