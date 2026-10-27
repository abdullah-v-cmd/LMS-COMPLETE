import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';
import {
  Users,
  Search,
  KeyRound,
  ShieldAlert,
  CheckCircle2,
  Eye,
  EyeOff,
  UserPlus,
  UserCog,
  Briefcase,
  GraduationCap,
  X,
  AlertCircle,
  Building,
  ShieldCheck,
} from 'lucide-react';
import axios from 'axios';

type UserItem = {
  id: string;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  role: string;
  isActive: boolean;
  phone?: string | null;
  createdAt: string;
  institution?: { id: string; name: string };
  teacherProfile?: { id: string; employeeCode: string; department?: string };
  parentProfile?: { id: string; occupation?: string };
  studentProfile?: { id: string; admissionNumber: string };
};

const ROLE_LABELS: Record<string, { label: string; color: string; description: string }> = {
  ROLE_SUPER_ADMIN: {
    label: 'Super Admin',
    color: 'bg-purple-100 text-purple-800 border-purple-200',
    description: 'Full platform governance across all institutions and tenants',
  },
  ROLE_INSTITUTION_ADMIN: {
    label: 'Institution Admin (Principal)',
    color: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    description: 'School principal / top administrator for this institution',
  },
  ROLE_ACADEMIC_HEAD: {
    label: 'Academic Head',
    color: 'bg-blue-100 text-blue-800 border-blue-200',
    description: 'Curriculum oversight, class programs, and faculty supervision',
  },
  ROLE_CLASS_TEACHER: {
    label: 'Class Teacher',
    color: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    description: 'Primary classroom tutor and section coordinator',
  },
  ROLE_SUBJECT_TEACHER: {
    label: 'Subject Teacher',
    color: 'bg-teal-100 text-teal-800 border-teal-200',
    description: 'Course instructor entering subject marks and lessons',
  },
  ROLE_TEACHING_ASSISTANT: {
    label: 'Teaching Assistant',
    color: 'bg-cyan-100 text-cyan-800 border-cyan-200',
    description: 'Classroom assistant and instructional aide',
  },
  ROLE_EXAM_CONTROLLER: {
    label: 'Exam Controller',
    color: 'bg-amber-100 text-amber-800 border-amber-200',
    description: 'Schedules exams, publishes results, and manages grade integrity',
  },
  ROLE_FINANCE_HEAD: {
    label: 'Finance Head',
    color: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    description: 'Manages tuition structures, fee invoicing, and audit ledgers',
  },
  ROLE_FEE_CLERK: {
    label: 'Junior Accountant / Fee Clerk',
    color: 'bg-green-100 text-green-800 border-green-200',
    description: 'Records fee collections and issues invoice payment receipts',
  },
  ROLE_LIBRARIAN: {
    label: 'Librarian',
    color: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    description: 'Manages catalog, book borrowing, and inventory audits',
  },
  ROLE_TRANSPORT_COORDINATOR: {
    label: 'Transport Coordinator',
    color: 'bg-orange-100 text-orange-800 border-orange-200',
    description: 'Vehicle routing, transit fees, and GPS logs',
  },
  ROLE_HOSTEL_WARDEN: {
    label: 'Hostel Warden',
    color: 'bg-stone-100 text-stone-800 border-stone-200',
    description: 'Dormitory bed allocations, visitor logs, and gate passes',
  },
  ROLE_COUNSELOR: {
    label: 'Counselor',
    color: 'bg-pink-100 text-pink-800 border-pink-200',
    description: 'Confidential student welfare and behavior support plans',
  },
  ROLE_PARENT: {
    label: 'Parent / Guardian',
    color: 'bg-rose-100 text-rose-800 border-rose-200',
    description: 'Authorized guardian linked explicitly to student records',
  },
  ROLE_STUDENT: {
    label: 'Student',
    color: 'bg-sky-100 text-sky-800 border-sky-200',
    description: 'Enrolled student accessing courses and assignments',
  },
  ROLE_AUDITOR: {
    label: 'Auditor / Compliance Officer',
    color: 'bg-slate-100 text-slate-800 border-slate-200',
    description: 'Read-only compliance verification and audit log reviews',
  },
};

export const UsersPage: React.FC = () => {
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();

  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');

  // Password reset modal state
  const [selectedUser, setSelectedUser] = useState<UserItem | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Add User modal state
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    username: '',
    password: 'Password123!',
    phone: '',
    role: 'ROLE_SUBJECT_TEACHER',
    employeeCode: '',
    department: '',
    qualification: '',
    occupation: '',
    emergencyContact: '',
  });

  // Edit Role modal state
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);
  const [editRole, setEditRole] = useState('');
  const [editActive, setEditActive] = useState(true);

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const isSuperAdmin = currentUser?.role === 'ROLE_SUPER_ADMIN';
  const isInstitutionAdmin = currentUser?.role === 'ROLE_INSTITUTION_ADMIN';
  const hasAuthority = isSuperAdmin || isInstitutionAdmin;

  // Available roles for selection (Institution Admin cannot create or promote to Super Admin)
  const assignableRoles = useMemo(() => {
    const allRoleKeys = Object.keys(ROLE_LABELS);
    if (!isSuperAdmin) {
      return allRoleKeys.filter((r) => r !== 'ROLE_SUPER_ADMIN');
    }
    return allRoleKeys;
  }, [isSuperAdmin]);

  const { data: users = [], isLoading, isError, error } = useQuery({
    queryKey: ['users-list'],
    queryFn: async () => {
      const res = await apiClient.get('/users');
      return (res.data?.data || []) as UserItem[];
    },
    enabled: hasAuthority,
  });

  // 1. Create User Mutation
  const createUserMutation = useMutation({
    mutationFn: async (payload: typeof addForm) => {
      const res = await apiClient.post('/users', payload);
      return res.data;
    },
    onSuccess: (data) => {
      setFeedback({
        type: 'success',
        message: `Account for ${addForm.firstName} ${addForm.lastName} (${ROLE_LABELS[addForm.role]?.label || addForm.role}) created successfully!`,
      });
      setIsAddUserModalOpen(false);
      setAddForm({
        firstName: '',
        lastName: '',
        email: '',
        username: '',
        password: 'Password123!',
        phone: '',
        role: 'ROLE_SUBJECT_TEACHER',
        employeeCode: '',
        department: '',
        qualification: '',
        occupation: '',
        emergencyContact: '',
      });
      queryClient.invalidateQueries({ queryKey: ['users-list'] });
    },
    onError: (err: unknown) => {
      let msg = 'Failed to create user account.';
      if (axios.isAxiosError(err)) {
        msg = err.response?.data?.error?.message || err.response?.data?.message || msg;
      }
      setFeedback({ type: 'error', message: msg });
    },
  });

  // 2. Update User Role & Status Mutation
  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role, isActive }: { userId: string; role: string; isActive: boolean }) => {
      const res = await apiClient.put(`/users/${userId}/role`, { role, isActive });
      return res.data;
    },
    onSuccess: (data) => {
      setFeedback({
        type: 'success',
        message: `User permissions and status successfully updated. Active sessions were securely refreshed.`,
      });
      setEditingUser(null);
      queryClient.invalidateQueries({ queryKey: ['users-list'] });
    },
    onError: (err: unknown) => {
      let msg = 'Failed to update user role.';
      if (axios.isAxiosError(err)) {
        msg = err.response?.data?.error?.message || err.response?.data?.message || msg;
      }
      setFeedback({ type: 'error', message: msg });
    },
  });

  // 3. Reset Password Mutation
  const resetPasswordMutation = useMutation({
    mutationFn: async ({ userId, pass }: { userId: string; pass: string }) => {
      const res = await apiClient.post(`/users/${userId}/reset-password`, { newPassword: pass });
      return res.data;
    },
    onSuccess: (data) => {
      setFeedback({
        type: 'success',
        message: data?.data?.message || 'Password successfully updated!',
      });
      setSelectedUser(null);
      setNewPassword('');
      setConfirmPassword('');
      queryClient.invalidateQueries({ queryKey: ['users-list'] });
    },
    onError: (err: unknown) => {
      let msg = 'Failed to reset password.';
      if (axios.isAxiosError(err)) {
        msg = err.response?.data?.error?.message || err.response?.data?.message || msg;
      }
      setFeedback({ type: 'error', message: msg });
    },
  });

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchesSearch =
        searchTerm === '' ||
        `${u.firstName} ${u.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (u.teacherProfile?.employeeCode && u.teacherProfile.employeeCode.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesRole = roleFilter === 'ALL' || u.role === roleFilter;

      return matchesSearch && matchesRole;
    });
  }, [users, searchTerm, roleFilter]);

  const stats = useMemo(() => {
    const total = users.length;
    const students = users.filter((u) => u.role === 'ROLE_STUDENT').length;
    const teachers = users.filter((u) =>
      ['ROLE_SUBJECT_TEACHER', 'ROLE_CLASS_TEACHER', 'ROLE_TEACHING_ASSISTANT', 'ROLE_ACADEMIC_HEAD'].includes(u.role)
    ).length;
    const parents = users.filter((u) => u.role === 'ROLE_PARENT').length;
    const staff = total - students - teachers - parents;
    return { total, students, teachers, parents, staff };
  }, [users]);

  const handleOpenReset = (u: UserItem) => {
    setSelectedUser(u);
    setNewPassword('');
    setConfirmPassword('');
    setFeedback(null);
  };

  const handleOpenEditRole = (u: UserItem) => {
    setEditingUser(u);
    setEditRole(u.role);
    setEditActive(u.isActive);
    setFeedback(null);
  };

  const handleResetSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    if (newPassword !== confirmPassword) {
      setFeedback({ type: 'error', message: 'Passwords do not match.' });
      return;
    }
    resetPasswordMutation.mutate({ userId: selectedUser.id, pass: newPassword });
  };

  const handleAddUserSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    createUserMutation.mutate(addForm);
  };

  const handleUpdateRoleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setFeedback(null);
    updateRoleMutation.mutate({
      userId: editingUser.id,
      role: editRole,
      isActive: editActive,
    });
  };

  if (!hasAuthority) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-8 text-center text-rose-800">
        <ShieldAlert className="mx-auto mb-3 h-12 w-12 text-rose-500" />
        <h2 className="text-xl font-bold">Access Restricted</h2>
        <p className="mt-2 text-sm text-rose-600">
          Only School Administrators (Principal / Super Administrator) have the authority to manage users, assign roles, and configure credentials.
        </p>
      </div>
    );
  }

  const isTeachingRole = ['ROLE_CLASS_TEACHER', 'ROLE_SUBJECT_TEACHER', 'ROLE_TEACHING_ASSISTANT', 'ROLE_ACADEMIC_HEAD'].includes(addForm.role);
  const isParentRole = addForm.role === 'ROLE_PARENT';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">User & Role Management</h1>
            <span className="rounded-md bg-primary-100 px-2 py-0.5 text-xs font-semibold text-primary-800">
              {isSuperAdmin ? 'Platform Super Admin' : 'Institution Admin'}
            </span>
          </div>
          <p className="text-sm text-slate-500">
            Provision faculty, staff, parents, and administrators with canonical role enforcement and session security.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setIsAddUserModalOpen(true);
            setFeedback(null);
          }}
          className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
        >
          <UserPlus className="h-4 w-4" />
          <span>+ Add User</span>
        </button>
      </div>

      {/* Feedback Alert */}
      {feedback && (
        <div
          role="status"
          className={`flex items-center justify-between rounded-xl border p-4 text-sm font-medium transition ${
            feedback.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-rose-200 bg-rose-50 text-rose-800'
          }`}
        >
          <div className="flex items-center gap-3">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
            ) : (
              <AlertCircle className="h-5 w-5 shrink-0 text-rose-600" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-slate-400 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Quick Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Total Users</span>
            <Users className="h-4 w-4 text-slate-400" />
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900">{stats.total}</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Teachers</span>
            <Briefcase className="h-4 w-4 text-teal-600" />
          </div>
          <p className="mt-2 text-2xl font-bold text-teal-700">{stats.teachers}</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Students</span>
            <GraduationCap className="h-4 w-4 text-sky-600" />
          </div>
          <p className="mt-2 text-2xl font-bold text-sky-700">{stats.students}</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Parents</span>
            <Users className="h-4 w-4 text-rose-600" />
          </div>
          <p className="mt-2 text-2xl font-bold text-rose-700">{stats.parents}</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Staff & Admins</span>
            <ShieldCheck className="h-4 w-4 text-purple-600" />
          </div>
          <p className="mt-2 text-2xl font-bold text-purple-700">{stats.staff}</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by name, email, username, or employee code…"
            className="w-full rounded-xl border border-slate-300 bg-slate-50 py-2 pl-10 pr-4 text-sm text-slate-900 transition focus:border-primary-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20"
          />
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="role-select" className="text-xs font-medium text-slate-600">
            Role:
          </label>
          <select
            id="role-select"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700 transition focus:border-primary-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20"
          >
            <option value="ALL">All Roles ({users.length})</option>
            {Object.keys(ROLE_LABELS).map((roleKey) => (
              <option key={roleKey} value={roleKey}>
                {ROLE_LABELS[roleKey].label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Users Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {isLoading ? (
          <div className="py-12 text-center text-sm text-slate-500">Loading user accounts…</div>
        ) : isError ? (
          <div className="p-8 text-center text-sm text-rose-600">
            Failed to load users: {(error as any)?.message || 'Unknown error'}
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-500">
            No users matched your search criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">User & Identity</th>
                  <th className="px-4 py-3">Canonical Role</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Profile Info</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredUsers.map((u) => {
                  const roleConfig = ROLE_LABELS[u.role] || {
                    label: u.role.replace('ROLE_', ''),
                    color: 'bg-slate-100 text-slate-800 border-slate-200',
                    description: '',
                  };
                  const canEditThisUser =
                    isSuperAdmin || (isInstitutionAdmin && u.role !== 'ROLE_SUPER_ADMIN');

                  return (
                    <tr key={u.id} className="hover:bg-slate-50/80 transition">
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-100 font-bold text-primary-700">
                            {u.firstName?.[0] || 'U'}
                            {u.lastName?.[0] || ''}
                          </div>
                          <div>
                            <p className="font-semibold text-slate-900">
                              {u.firstName} {u.lastName}
                            </p>
                            <p className="text-xs text-slate-500">{u.email} &bull; <span className="font-mono text-[11px] text-slate-600">@{u.username}</span></p>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3.5">
                        <span
                          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${roleConfig.color}`}
                        >
                          {roleConfig.label}
                        </span>
                      </td>

                      <td className="px-4 py-3.5">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${
                            u.isActive
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              u.isActive ? 'bg-emerald-500' : 'bg-slate-400'
                            }`}
                          />
                          {u.isActive ? 'Active' : 'Suspended'}
                        </span>
                      </td>

                      <td className="px-4 py-3.5 text-xs text-slate-600">
                        {u.teacherProfile?.employeeCode ? (
                          <span>Code: <strong className="font-mono">{u.teacherProfile.employeeCode}</strong> {u.teacherProfile.department ? `(${u.teacherProfile.department})` : ''}</span>
                        ) : u.studentProfile?.admissionNumber ? (
                          <span>Adm: <strong className="font-mono">{u.studentProfile.admissionNumber}</strong></span>
                        ) : u.parentProfile?.occupation ? (
                          <span>Occ: {u.parentProfile.occupation}</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      <td className="px-4 py-3.5 text-right">
                        {canEditThisUser ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleOpenEditRole(u)}
                              title="Edit Role and Account Status"
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-700"
                            >
                              <UserCog className="h-3.5 w-3.5 text-indigo-600" />
                              <span>Edit Role</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleOpenReset(u)}
                              title="Reset Password"
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-primary-400 hover:bg-primary-50 hover:text-primary-700"
                            >
                              <KeyRound className="h-3.5 w-3.5" />
                              <span>Pass</span>
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs font-medium text-slate-400">Protected Super Admin</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* 1. ADD USER MODAL */}
      {/* ======================================================== */}
      {isAddUserModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm overflow-y-auto">
          <div className="my-8 w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="rounded-lg bg-primary-100 p-2 text-primary-700">
                  <UserPlus className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900">Add New User & Assign Canonical Role</h3>
                  <p className="text-xs text-slate-500">Create staff, teacher, accountant, or parent accounts with role-specific profiles</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddUserModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleAddUserSubmit} className="mt-5 space-y-4">
              {/* Role Selection */}
              <div className="rounded-xl border border-primary-100 bg-primary-50/40 p-4">
                <label className="block text-xs font-bold uppercase tracking-wider text-primary-900">
                  Canonical User Role *
                </label>
                <select
                  required
                  value={addForm.role}
                  onChange={(e) => setAddForm({ ...addForm, role: e.target.value })}
                  className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                >
                  {assignableRoles.map((rk) => (
                    <option key={rk} value={rk}>
                      {ROLE_LABELS[rk].label}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-slate-600">
                  {ROLE_LABELS[addForm.role]?.description}
                </p>
              </div>

              {/* Name Fields */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">First Name *</label>
                  <input
                    type="text"
                    required
                    value={addForm.firstName}
                    onChange={(e) => setAddForm({ ...addForm, firstName: e.target.value })}
                    placeholder="e.g. John"
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Last Name *</label>
                  <input
                    type="text"
                    required
                    value={addForm.lastName}
                    onChange={(e) => setAddForm({ ...addForm, lastName: e.target.value })}
                    placeholder="e.g. Miller"
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                  />
                </div>
              </div>

              {/* Email & Username */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Official Email *</label>
                  <input
                    type="email"
                    required
                    value={addForm.email}
                    onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
                    placeholder="e.g. jmiller@school.edu"
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Unique Username *</label>
                  <input
                    type="text"
                    required
                    minLength={3}
                    value={addForm.username}
                    onChange={(e) => setAddForm({ ...addForm, username: e.target.value })}
                    placeholder="e.g. jmiller"
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                  />
                </div>
              </div>

              {/* Password & Phone */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Initial Password *</label>
                  <input
                    type="text"
                    required
                    minLength={8}
                    value={addForm.password}
                    onChange={(e) => setAddForm({ ...addForm, password: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-300 font-mono px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                  />
                  <p className="mt-1 text-[11px] text-slate-500">Requires 8+ chars, upper, lower, number, special.</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Phone Number (Optional)</label>
                  <input
                    type="tel"
                    value={addForm.phone}
                    onChange={(e) => setAddForm({ ...addForm, phone: e.target.value })}
                    placeholder="+1 (555) 000-0000"
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                  />
                </div>
              </div>

              {/* Conditional Profile Fields */}
              {isTeachingRole && (
                <div className="rounded-xl border border-teal-200 bg-teal-50/40 p-4 space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-teal-900 flex items-center gap-1.5">
                    <Briefcase className="h-4 w-4" />
                    Teacher & Faculty Profile Details
                  </h4>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700">Employee Code</label>
                      <input
                        type="text"
                        value={addForm.employeeCode}
                        onChange={(e) => setAddForm({ ...addForm, employeeCode: e.target.value })}
                        placeholder="Auto-generated if blank"
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700">Department</label>
                      <input
                        type="text"
                        value={addForm.department}
                        onChange={(e) => setAddForm({ ...addForm, department: e.target.value })}
                        placeholder="e.g. Mathematics"
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700">Qualification</label>
                      <input
                        type="text"
                        value={addForm.qualification}
                        onChange={(e) => setAddForm({ ...addForm, qualification: e.target.value })}
                        placeholder="e.g. M.Sc, B.Ed"
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                      />
                    </div>
                  </div>
                </div>
              )}

              {isParentRole && (
                <div className="rounded-xl border border-rose-200 bg-rose-50/40 p-4 space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-rose-900 flex items-center gap-1.5">
                    <Users className="h-4 w-4" />
                    Parent / Guardian Profile Details
                  </h4>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700">Occupation</label>
                      <input
                        type="text"
                        value={addForm.occupation}
                        onChange={(e) => setAddForm({ ...addForm, occupation: e.target.value })}
                        placeholder="e.g. Engineer, Healthcare"
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700">Emergency Contact</label>
                      <input
                        type="tel"
                        value={addForm.emergencyContact}
                        onChange={(e) => setAddForm({ ...addForm, emergencyContact: e.target.value })}
                        placeholder="Alternate phone number"
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddUserModalOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createUserMutation.isPending}
                  className="rounded-xl bg-primary-600 px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-primary-700 disabled:opacity-50"
                >
                  {createUserMutation.isPending ? 'Provisioning…' : 'Create User Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 2. EDIT ROLE & STATUS MODAL */}
      {/* ======================================================== */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="rounded-lg bg-indigo-100 p-2 text-indigo-700">
                  <UserCog className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900">Edit User Role & Privileges</h3>
                  <p className="text-xs text-slate-500">Reassign canonical roles or modify active status</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="my-4 rounded-xl bg-slate-50 p-3.5 text-xs text-slate-700">
              <p className="font-semibold text-slate-900">
                User: {editingUser.firstName} {editingUser.lastName} ({editingUser.email})
              </p>
              <p className="text-slate-500">
                Current Role:{' '}
                <span className="font-medium text-slate-800">
                  {ROLE_LABELS[editingUser.role]?.label || editingUser.role}
                </span>
              </p>
            </div>

            <form onSubmit={handleUpdateRoleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700">New Canonical Role</label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                >
                  {assignableRoles.map((rk) => (
                    <option key={rk} value={rk}>
                      {ROLE_LABELS[rk].label}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-slate-500">{ROLE_LABELS[editRole]?.description}</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Account Status</label>
                <div className="flex items-center gap-4">
                  <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                    <input
                      type="radio"
                      name="isActive"
                      checked={editActive === true}
                      onChange={() => setEditActive(true)}
                      className="text-primary-600 focus:ring-primary-500"
                    />
                    <span>Active (Can Log In)</span>
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                    <input
                      type="radio"
                      name="isActive"
                      checked={editActive === false}
                      onChange={() => setEditActive(false)}
                      className="text-primary-600 focus:ring-primary-500"
                    />
                    <span>Suspended / Deactivated</span>
                  </label>
                </div>
              </div>

              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                <p className="font-semibold flex items-center gap-1">
                  <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
                  Security Notice:
                </p>
                <p className="mt-0.5">
                  Changing a user's role immediately invalidates their active refresh tokens and sessions to prevent privilege retention.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updateRoleMutation.isPending}
                  className="rounded-xl bg-primary-600 px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-primary-700 disabled:opacity-50"
                >
                  {updateRoleMutation.isPending ? 'Updating…' : 'Save Role & Status'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 3. PASSWORD RESET MODAL */}
      {/* ======================================================== */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="rounded-lg bg-primary-100 p-2 text-primary-700">
                  <KeyRound className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900">Change User Password</h3>
                  <p className="text-xs text-slate-500">Administrative Override Authority</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedUser(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="my-4 rounded-xl bg-slate-50 p-3.5 text-xs text-slate-700">
              <p className="font-semibold text-slate-900">
                Target User: {selectedUser.firstName} {selectedUser.lastName}
              </p>
              <p className="text-slate-500">Email: {selectedUser.email}</p>
              <p className="text-slate-500">
                Role:{' '}
                <span className="font-medium text-slate-800">
                  {ROLE_LABELS[selectedUser.role]?.label || selectedUser.role}
                </span>
              </p>
            </div>

            <form onSubmit={handleResetSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700">New Password</label>
                <div className="relative mt-1">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new strong password"
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 pr-10 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  Must include 8+ chars, upper & lower case letters, numbers, and special symbol.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Confirm New Password</label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-type new password"
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedUser(null)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={resetPasswordMutation.isPending || !newPassword || newPassword !== confirmPassword}
                  className="rounded-xl bg-primary-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-primary-700 disabled:opacity-50"
                >
                  {resetPasswordMutation.isPending ? 'Updating…' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
