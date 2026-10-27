import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';
import {
  Users,
  UserPlus,
  Search,
  CheckCircle2,
  AlertCircle,
  X,
  GraduationCap,
  ShieldCheck,
  ShieldAlert,
  Heart,
  UserCheck,
  ArrowRightLeft,
  Trash2,
} from 'lucide-react';

interface Student {
  id: string;
  admissionNumber: string;
  rollNumber: string | null;
  status: string;
  gender: string;
  dateOfBirth: string;
  emergencyContact: string | null;
  bloodGroup: string | null;
  user: {
    id: string;
    email: string;
    username: string;
    firstName: string;
    lastName: string;
    isActive: boolean;
  };
  section: {
    id: string;
    name: string;
    classGrade: {
      id: string;
      name: string;
    };
  };
  parentRelations?: Array<{
    id: string;
    relationshipType: string;
    isPrimaryContact: boolean;
    parent: {
      id: string;
      user: {
        id: string;
        firstName: string;
        lastName: string;
        email: string;
        phone?: string;
      };
    };
  }>;
}

interface ClassGrade {
  id: string;
  name: string;
  sections: {
    id: string;
    name: string;
  }[];
}

export const StudentsPage: React.FC = () => {
  const { hasPermission, user } = useAuth();
  const queryClient = useQueryClient();
  const canCreateStudent = hasPermission('student:create');
  const canUpdateStudent =
    hasPermission('student:update') ||
    ['ROLE_SUPER_ADMIN', 'ROLE_INSTITUTION_ADMIN', 'ROLE_ACADEMIC_HEAD', 'ROLE_CLASS_TEACHER'].includes(
      user?.role || ''
    );

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSection, setSelectedSection] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [studentForSectionChange, setStudentForSectionChange] = useState<Student | null>(null);
  const [targetSectionId, setTargetSectionId] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  // Form State
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    username: '',
    password: 'Password123!',
    admissionNumber: '',
    rollNumber: '',
    sectionId: '',
    dateOfBirth: '2010-01-15',
    gender: 'MALE',
    emergencyContact: '',
    bloodGroup: 'O+',
    // Parent section
    includeParent: true,
    parentFirstName: '',
    parentLastName: '',
    parentEmail: '',
    parentPhone: '',
    relationshipType: 'FATHER' as 'FATHER' | 'MOTHER' | 'GUARDIAN',
    parentOccupation: '',
  });

  // Queries
  const { data: students = [], isLoading } = useQuery<Student[]>({
    queryKey: ['students-list'],
    queryFn: async () => {
      const res = await apiClient.get('/students');
      return res.data.data;
    },
  });

  const { data: classGrades = [] } = useQuery<ClassGrade[]>({
    queryKey: ['academic-classes-sections'],
    queryFn: async () => {
      const res = await apiClient.get('/academic/classes');
      return res.data.data;
    },
  });

  // Flatten all available sections
  const allSections = classGrades.flatMap((cg) =>
    (cg.sections || []).map((s) => ({
      id: s.id,
      name: `${cg.name} — Section ${s.name}`,
    }))
  );

  // Mutation
  const createStudentMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const payload: any = {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        username: data.username,
        password: data.password,
        admissionNumber: data.admissionNumber,
        rollNumber: data.rollNumber || undefined,
        sectionId: data.sectionId,
        dateOfBirth: data.dateOfBirth,
        gender: data.gender,
        emergencyContact: data.emergencyContact || undefined,
        bloodGroup: data.bloodGroup || undefined,
      };

      if (data.includeParent && data.parentEmail) {
        payload.parent = {
          firstName: data.parentFirstName || data.lastName,
          lastName: data.parentLastName || 'Parent',
          email: data.parentEmail,
          phone: data.parentPhone || undefined,
          relationshipType: data.relationshipType,
          occupation: data.parentOccupation || undefined,
          isPrimaryContact: true,
        };
      }

      return (await apiClient.post('/students', payload)).data;
    },
    onSuccess: () => {
      setError('');
      setNotice('New student admitted, credentials provisioned, and parent account linked successfully.');
      setIsModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['students-list'] });
      // Reset form
      setFormData({
        firstName: '',
        lastName: '',
        email: '',
        username: '',
        password: 'Password123!',
        admissionNumber: '',
        rollNumber: '',
        sectionId: '',
        dateOfBirth: '2010-01-15',
        gender: 'MALE',
        emergencyContact: '',
        bloodGroup: 'O+',
        includeParent: true,
        parentFirstName: '',
        parentLastName: '',
        parentEmail: '',
        parentPhone: '',
        relationshipType: 'FATHER',
        parentOccupation: '',
      });
    },
    onError: (err: any) => {
      setNotice('');
      setError(err.response?.data?.error?.message || err.response?.data?.message || 'Failed to enroll student. Please check input details.');
    },
  });

  const changeSectionMutation = useMutation({
    mutationFn: async ({ studentId, sectionId }: { studentId: string; sectionId: string }) => {
      const res = await apiClient.patch(`/students/${studentId}/section`, { sectionId });
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['students-list'] });
      setNotice(
        `Successfully transferred ${studentForSectionChange?.user.firstName} ${studentForSectionChange?.user.lastName} to ${data?.data?.section?.classGrade?.name} — ${data?.data?.section?.name}!`
      );
      setError('');
      setStudentForSectionChange(null);
      setTargetSectionId('');
    },
    onError: (err: any) => {
      setError(err.response?.data?.error?.message || err.response?.data?.message || 'Failed to change student section.');
      setNotice('');
    },
  });

  const deleteStudentMutation = useMutation({
    mutationFn: async (studentId: string) => {
      const res = await apiClient.post('/system/recycle-bin/delete', {
        entityType: 'STUDENT',
        entityId: studentId,
        reason: 'Student moved to Recycle Bin by administrator',
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['students-list'] });
      setNotice('Student record moved to Recycle Bin. You can restore or permanently delete it in Settings > Recycle Bin.');
      setError('');
    },
    onError: (err: any) => {
      setError(err.response?.data?.error?.message || err.response?.data?.message || 'Failed to delete student.');
      setNotice('');
    },
  });

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.sectionId) {
      setError('Please select an academic section for enrollment.');
      return;
    }
    if (formData.includeParent && (!formData.parentEmail || !formData.parentFirstName || !formData.parentLastName)) {
      setError('Please provide parent full name and email address, or uncheck the parent creation box.');
      return;
    }
    setError('');
    createStudentMutation.mutate(formData);
  };

  const filteredStudents = students.filter((s) => {
    const fullName = `${s.user.firstName} ${s.user.lastName}`.toLowerCase();
    const adm = s.admissionNumber.toLowerCase();
    const parentName = (s.parentRelations?.[0]?.parent?.user ? `${s.parentRelations[0].parent.user.firstName} ${s.parentRelations[0].parent.user.lastName}` : '').toLowerCase();
    const matchesSearch =
      fullName.includes(searchTerm.toLowerCase()) ||
      adm.includes(searchTerm.toLowerCase()) ||
      parentName.includes(searchTerm.toLowerCase());
    const matchesSection = !selectedSection || s.section?.id === selectedSection;
    return matchesSearch && matchesSection;
  });

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Student Directory & Admissions</h1>
            <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-primary-50 text-primary-700 border border-primary-200">
              {students.length} Enrolled
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Browse enrolled students, linked guardian accounts, and issue new admissions with atomic parent provisioning.
          </p>
        </div>

        {canCreateStudent && (
          <button
            type="button"
            onClick={() => {
              setIsModalOpen(true);
              setNotice('');
              setError('');
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-semibold transition shadow-sm focus:ring-2 focus:ring-primary-500/20"
          >
            <UserPlus className="w-4 h-4" />
            <span>Admit Student</span>
          </button>
        )}
      </div>

      {/* Notices */}
      {notice && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between text-emerald-800 text-sm">
          <div className="flex items-center gap-2 font-medium">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{notice}</span>
          </div>
          <button type="button" onClick={() => setNotice('')} className="text-emerald-600 hover:text-emerald-800">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-between text-rose-800 text-sm">
          <div className="flex items-center gap-2 font-medium">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button type="button" onClick={() => setError('')} className="text-rose-600 hover:text-rose-800">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Search and Filters */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 justify-between items-center">
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by student name, admission #, parent…"
            className="w-full text-sm pl-10 pr-4 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition"
          />
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <select
            value={selectedSection}
            onChange={(e) => setSelectedSection(e.target.value)}
            className="text-sm px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition w-full md:w-64"
          >
            <option value="">All Academic Sections</option>
            {allSections.map((sec) => (
              <option key={sec.id} value={sec.id}>
                {sec.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Students Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="py-12 text-center text-sm text-slate-500">Loading enrolled students…</div>
        ) : filteredStudents.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-500">
            No students found matching your search.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Student Name & Email</th>
                  <th className="px-4 py-3">Admission #</th>
                  <th className="px-4 py-3">Roll #</th>
                  <th className="px-4 py-3">Class & Section</th>
                  <th className="px-4 py-3">Linked Guardian / Parent</th>
                  <th className="px-4 py-3">Gender / DOB</th>
                  <th className="px-4 py-3">Status</th>
                  {canUpdateStudent && <th className="px-4 py-3 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredStudents.map((s) => {
                  const primaryParent = s.parentRelations?.[0];
                  return (
                    <tr key={s.id} className="hover:bg-slate-50/75 transition">
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary-100 text-primary-700 font-bold text-xs flex items-center justify-center shrink-0">
                            {s.user.firstName[0]}
                            {s.user.lastName[0]}
                          </div>
                          <div>
                            <p className="font-semibold text-slate-900 leading-tight">
                              {s.user.firstName} {s.user.lastName}
                            </p>
                            <p className="text-xs text-slate-500">{s.user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 font-mono text-xs font-semibold text-slate-700">
                        {s.admissionNumber}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-slate-600">
                        {s.rollNumber || '—'}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="inline-block px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                          {s.section?.classGrade?.name || 'Class'} · {s.section?.name || 'Sec'}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-xs">
                        {primaryParent?.parent?.user ? (
                          <div className="flex items-center gap-1.5">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                              {primaryParent.relationshipType}
                            </span>
                            <span className="font-medium text-slate-800">
                              {primaryParent.parent.user.firstName} {primaryParent.parent.user.lastName}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">No parent linked</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-slate-600">
                        <p>{s.gender}</p>
                        <p className="text-[11px] text-slate-400">
                          {new Date(s.dateOfBirth).toLocaleDateString()}
                        </p>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                          {s.status}
                        </span>
                      </td>
                      {canUpdateStudent && (
                        <td className="px-4 py-3.5 text-right space-x-2">
                          <button
                            type="button"
                            onClick={() => {
                              setStudentForSectionChange(s);
                              setTargetSectionId(s.section?.id || '');
                            }}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-primary-50 hover:text-primary-700 hover:border-primary-200 shadow-sm transition"
                            title="Change student section"
                          >
                            <ArrowRightLeft className="w-3.5 h-3.5 text-primary-600" />
                            Change Section
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              if (window.confirm(`Move student "${s.user.firstName} ${s.user.lastName} (Adm: ${s.admissionNumber})" to Recycle Bin? You can restore this student record anytime in Settings > Recycle Bin.`)) {
                                deleteStudentMutation.mutate(s.id);
                              }
                            }}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-red-200 bg-red-50 text-xs font-semibold text-red-700 hover:bg-red-100 hover:border-red-300 shadow-sm transition"
                            title="Move student record to Recycle Bin"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-red-600" />
                            Delete (To Bin)
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Admission Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white z-10">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-primary-50 text-primary-600 rounded-lg">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">Student Admission & Parent Account Setup</h2>
                  <p className="text-xs text-slate-500">Atomic enrollment creating student record and parent account linking.</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="p-6 space-y-5">
              {/* Personal Details */}
              <div>
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
                  1. Student Identity & Credentials
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Student First Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.firstName}
                      onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                      placeholder="e.g. Alice"
                      className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Student Last Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.lastName}
                      onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                      placeholder="e.g. Doe"
                      className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Student Email Address *
                    </label>
                    <input
                      type="email"
                      required
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="alice@alpha.edu"
                      className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Student Username *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.username}
                      onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                      placeholder="student_alice"
                      className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Initial Temporary Password *
                    </label>
                    <input
                      type="password"
                      required
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Emergency Contact Phone
                    </label>
                    <input
                      type="text"
                      value={formData.emergencyContact}
                      onChange={(e) => setFormData({ ...formData, emergencyContact: e.target.value })}
                      placeholder="+1-555-0199"
                      className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Academic Placement */}
              <div className="border-t border-slate-100 pt-4">
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
                  2. Academic Placement & Details
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Admission Number *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.admissionNumber}
                      onChange={(e) => setFormData({ ...formData, admissionNumber: e.target.value })}
                      placeholder="e.g. ADM-2026-088"
                      className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:outline-none font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Roll Number
                    </label>
                    <input
                      type="text"
                      value={formData.rollNumber}
                      onChange={(e) => setFormData({ ...formData, rollNumber: e.target.value })}
                      placeholder="e.g. 101"
                      className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:outline-none"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Assigned Class & Section *
                    </label>
                    <select
                      required
                      value={formData.sectionId}
                      onChange={(e) => setFormData({ ...formData, sectionId: e.target.value })}
                      className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:outline-none bg-white"
                    >
                      <option value="">-- Choose Academic Section --</option>
                      {allSections.map((sec) => (
                        <option key={sec.id} value={sec.id}>
                          {sec.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Date of Birth *
                    </label>
                    <input
                      type="date"
                      required
                      value={formData.dateOfBirth}
                      onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
                      className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:outline-none bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Gender *
                    </label>
                    <select
                      value={formData.gender}
                      onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                      className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:outline-none bg-white"
                    >
                      <option value="MALE">Male</option>
                      <option value="FEMALE">Female</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Parent / Guardian Section */}
              <div className="border-t border-slate-100 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-rose-600" />
                    3. Parent / Guardian Account Creation & Linking
                  </h3>
                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.includeParent}
                      onChange={(e) => setFormData({ ...formData, includeParent: e.target.checked })}
                      className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span>Link or Provision Parent Account</span>
                  </label>
                </div>

                {formData.includeParent && (
                  <div className="rounded-xl border border-rose-100 bg-rose-50/40 p-4 space-y-4">
                    <div className="rounded-lg bg-white/80 p-3 text-xs text-rose-900 border border-rose-200/60">
                      <strong>Multi-Child & Deduplication Architecture:</strong> If the parent's email is already registered, this student will be linked directly to their existing parent account. If new, a secure parent account (<span className="font-mono">ROLE_PARENT</span>) will be provisioned.
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Parent First Name *
                        </label>
                        <input
                          type="text"
                          required={formData.includeParent}
                          value={formData.parentFirstName}
                          onChange={(e) => setFormData({ ...formData, parentFirstName: e.target.value })}
                          placeholder="e.g. Robert"
                          className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:outline-none bg-white"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Parent Last Name *
                        </label>
                        <input
                          type="text"
                          required={formData.includeParent}
                          value={formData.parentLastName}
                          onChange={(e) => setFormData({ ...formData, parentLastName: e.target.value })}
                          placeholder="e.g. Doe"
                          className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:outline-none bg-white"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Parent Email Address *
                        </label>
                        <input
                          type="email"
                          required={formData.includeParent}
                          value={formData.parentEmail}
                          onChange={(e) => setFormData({ ...formData, parentEmail: e.target.value })}
                          placeholder="robert.doe@example.com"
                          className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:outline-none bg-white"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Parent Phone Number
                        </label>
                        <input
                          type="tel"
                          value={formData.parentPhone}
                          onChange={(e) => setFormData({ ...formData, parentPhone: e.target.value })}
                          placeholder="+1 (555) 012-3456"
                          className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:outline-none bg-white"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Relationship to Student *
                        </label>
                        <select
                          value={formData.relationshipType}
                          onChange={(e) => setFormData({ ...formData, relationshipType: e.target.value as any })}
                          className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:outline-none bg-white"
                        >
                          <option value="FATHER">Father</option>
                          <option value="MOTHER">Mother</option>
                          <option value="GUARDIAN">Legal Guardian</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Parent Occupation (Optional)
                        </label>
                        <input
                          type="text"
                          value={formData.parentOccupation}
                          onChange={(e) => setFormData({ ...formData, parentOccupation: e.target.value })}
                          placeholder="e.g. Civil Engineer, Physician"
                          className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:outline-none bg-white"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="border-t border-slate-200 pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createStudentMutation.isPending}
                  className="px-5 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-semibold transition disabled:opacity-50"
                >
                  {createStudentMutation.isPending ? 'Enrolling & Linking...' : 'Confirm Admission & Provision Parent'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Change Student Section */}
      {studentForSectionChange && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <ArrowRightLeft className="w-5 h-5 text-primary-600" />
                <div>
                  <h3 className="font-bold text-slate-900 leading-tight">Change Student Section</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Transfer student to another class grade or section</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setStudentForSectionChange(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!targetSectionId) {
                  setError('Please select a target section.');
                  return;
                }
                changeSectionMutation.mutate({
                  studentId: studentForSectionChange.id,
                  sectionId: targetSectionId,
                });
              }}
              className="mt-4 space-y-4"
            >
              <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-200 space-y-1.5 text-xs text-slate-600">
                <p>
                  <strong className="text-slate-800">Student:</strong>{' '}
                  {studentForSectionChange.user.firstName} {studentForSectionChange.user.lastName}
                </p>
                <p>
                  <strong className="text-slate-800">Admission No:</strong>{' '}
                  {studentForSectionChange.admissionNumber}
                </p>
                <p>
                  <strong className="text-slate-800">Current Section:</strong>{' '}
                  {studentForSectionChange.section?.classGrade?.name} — {studentForSectionChange.section?.name}
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Select Target Section *</label>
                <select
                  required
                  value={targetSectionId}
                  onChange={(e) => setTargetSectionId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                >
                  <option value="">-- Choose New Section --</option>
                  {allSections.map((sec) => (
                    <option key={sec.id} value={sec.id}>
                      {sec.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setStudentForSectionChange(null)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    changeSectionMutation.isPending ||
                    !targetSectionId ||
                    targetSectionId === studentForSectionChange.section?.id
                  }
                  className="rounded-xl bg-primary-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-primary-700 disabled:opacity-50"
                >
                  {changeSectionMutation.isPending ? 'Transferring…' : 'Confirm Section Transfer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
