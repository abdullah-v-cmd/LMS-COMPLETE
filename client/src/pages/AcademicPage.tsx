import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';
import {
  GraduationCap,
  Layers,
  Plus,
  BookOpen,
  Calendar,
  Building,
  CheckCircle2,
  XCircle,
  Users,
  DoorOpen,
  Hash,
  Trash2,
  ShieldCheck,
} from 'lucide-react';
import axios from 'axios';

type Section = {
  id: string;
  name: string;
  roomNumber: string | null;
  maxCapacity: number;
  classGradeId: string;
  _count?: { students: number };
};

type ClassGrade = {
  id: string;
  name: string;
  level: number;
  program?: { id: string; name: string };
  sections: Section[];
};

type Subject = {
  id: string;
  name: string;
  code: string;
  creditUnits: number;
};

type AcademicYear = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  terms: { id: string; name: string }[];
};

type TeacherProfile = {
  id: string;
  employeeCode: string | null;
  department: string | null;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: string;
  };
};

type TeacherAssignment = {
  id: string;
  isPrimaryTeacher: boolean;
  teacher: {
    id: string;
    employeeCode: string | null;
    user: {
      firstName: string;
      lastName: string;
      email: string;
    };
  };
  subject: {
    id: string;
    name: string;
    code: string;
  };
  section: {
    id: string;
    name: string;
    classGrade: {
      name: string;
      level: number;
    };
  };
  academicTerm: {
    id: string;
    name: string;
    academicYear: {
      name: string;
    };
  };
};

export const AcademicPage: React.FC = () => {
  const { hasPermission, user } = useAuth();
  const queryClient = useQueryClient();

  const canManage =
    hasPermission('academic:manage') ||
    user?.role === 'ROLE_SUPER_ADMIN' ||
    user?.role === 'ROLE_INSTITUTION_ADMIN' ||
    user?.role === 'ROLE_ACADEMIC_HEAD';

  const [activeTab, setActiveTab] = useState<'classes' | 'subjects' | 'years' | 'teachers'>('classes');

  // Modals state
  const [showClassModal, setShowClassModal] = useState(false);
  const [showSectionModal, setShowSectionModal] = useState(false);
  const [showSubjectModal, setShowSubjectModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedClassIdForSection, setSelectedClassIdForSection] = useState<string>('');

  // Form states
  const [className, setClassName] = useState('');
  const [classLevel, setClassLevel] = useState<number>(10);

  const [sectionName, setSectionName] = useState('');
  const [roomNumber, setRoomNumber] = useState('');
  const [maxCapacity, setMaxCapacity] = useState<number>(40);

  const [subjectName, setSubjectName] = useState('');
  const [subjectCode, setSubjectCode] = useState('');
  const [creditUnits, setCreditUnits] = useState<number>(1);

  // Teacher Assignment Form
  const [assignTeacherId, setAssignTeacherId] = useState('');
  const [assignSubjectId, setAssignSubjectId] = useState('');
  const [assignSectionId, setAssignSectionId] = useState('');
  const [assignTermId, setAssignTermId] = useState('');
  const [assignIsPrimary, setAssignIsPrimary] = useState(true);

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Queries
  const { data: classes = [], isLoading: loadingClasses } = useQuery({
    queryKey: ['academic-classes'],
    queryFn: async () => {
      const res = await apiClient.get('/academic/classes');
      return (res.data?.data || []) as ClassGrade[];
    },
  });

  const { data: subjects = [], isLoading: loadingSubjects } = useQuery({
    queryKey: ['academic-subjects'],
    queryFn: async () => {
      const res = await apiClient.get('/academic/subjects');
      return (res.data?.data || []) as Subject[];
    },
  });

  const { data: years = [], isLoading: loadingYears } = useQuery({
    queryKey: ['academic-years'],
    queryFn: async () => {
      const res = await apiClient.get('/academic/years');
      return (res.data?.data || []) as AcademicYear[];
    },
  });

  const { data: teachers = [], isLoading: loadingTeachers } = useQuery({
    queryKey: ['academic-teachers'],
    queryFn: async () => {
      const res = await apiClient.get('/academic/teachers');
      return (res.data?.data || []) as TeacherProfile[];
    },
  });

  const { data: teacherAssignments = [], isLoading: loadingAssignments } = useQuery({
    queryKey: ['academic-teacher-assignments'],
    queryFn: async () => {
      const res = await apiClient.get('/academic/teacher-assignments');
      return (res.data?.data || []) as TeacherAssignment[];
    },
  });

  // Teacher assignment mutations
  const assignTeacherMutation = useMutation({
    mutationFn: async (payload: {
      teacherId: string;
      subjectId: string;
      sectionId: string;
      academicTermId: string;
      isPrimaryTeacher: boolean;
    }) => {
      const res = await apiClient.post('/academic/assign-teacher', payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['academic-teacher-assignments'] });
      setShowAssignModal(false);
      setAssignTeacherId('');
      setAssignSubjectId('');
      setAssignSectionId('');
      setAssignTermId('');
      setFeedback({ type: 'success', message: 'Subject teacher successfully assigned to class!' });
    },
    onError: (err: any) => {
      setFeedback({
        type: 'error',
        message: err.response?.data?.error?.message || 'Failed to assign teacher to class.',
      });
    },
  });

  const unassignTeacherMutation = useMutation({
    mutationFn: async (assignmentId: string) => {
      const res = await apiClient.delete(`/academic/teacher-assignments/${assignmentId}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['academic-teacher-assignments'] });
      setFeedback({ type: 'success', message: 'Teacher assignment removed.' });
    },
    onError: (err: any) => {
      setFeedback({
        type: 'error',
        message: err.response?.data?.error?.message || 'Failed to remove teacher assignment.',
      });
    },
  });

  const sectionOptions = useMemo<{ id: string; label: string }[]>(() => {
    return classes.flatMap((cls: ClassGrade) =>
      cls.sections.map((sec: Section) => ({
        id: sec.id,
        label: `${cls.name} · ${sec.name}${sec.roomNumber ? ` (Room ${sec.roomNumber})` : ''}`,
      }))
    );
  }, [classes]);

  const termOptions = useMemo<{ id: string; label: string }[]>(() => {
    return years.flatMap((year: AcademicYear) =>
      year.terms.map((term: { id: string; name: string }) => ({
        id: term.id,
        label: `${year.name} · ${term.name}`,
      }))
    );
  }, [years]);

  // Mutations
  const createClassMutation = useMutation({
    mutationFn: async (payload: { name: string; level: number }) => {
      const res = await apiClient.post('/academic/classes', payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['academic-classes'] });
      setShowClassModal(false);
      setClassName('');
      setClassLevel(10);
      setFeedback({ type: 'success', message: 'Class Grade created successfully!' });
    },
    onError: (err: unknown) => {
      let msg = 'Failed to create class grade.';
      if (axios.isAxiosError(err)) msg = err.response?.data?.error?.message || msg;
      setFeedback({ type: 'error', message: msg });
    },
  });

  const createSectionMutation = useMutation({
    mutationFn: async (payload: {
      classGradeId: string;
      name: string;
      roomNumber?: string;
      maxCapacity: number;
    }) => {
      const res = await apiClient.post('/academic/sections', payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['academic-classes'] });
      setShowSectionModal(false);
      setSectionName('');
      setRoomNumber('');
      setMaxCapacity(40);
      setFeedback({ type: 'success', message: 'Section created successfully!' });
    },
    onError: (err: unknown) => {
      let msg = 'Failed to create section.';
      if (axios.isAxiosError(err)) msg = err.response?.data?.error?.message || msg;
      setFeedback({ type: 'error', message: msg });
    },
  });

  const createSubjectMutation = useMutation({
    mutationFn: async (payload: { name: string; code: string; creditUnits: number }) => {
      const res = await apiClient.post('/academic/subjects', payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['academic-subjects'] });
      setShowSubjectModal(false);
      setSubjectName('');
      setSubjectCode('');
      setCreditUnits(1);
      setFeedback({ type: 'success', message: 'Subject created successfully!' });
    },
    onError: (err: unknown) => {
      let msg = 'Failed to create subject.';
      if (axios.isAxiosError(err)) msg = err.response?.data?.error?.message || msg;
      setFeedback({ type: 'error', message: msg });
    },
  });

  const handleOpenAddSection = (classId?: string) => {
    setSelectedClassIdForSection(classId || (classes[0]?.id ?? ''));
    setSectionName('');
    setRoomNumber('');
    setMaxCapacity(40);
    setShowSectionModal(true);
  };

  return (
    <div className="space-y-6">
      {/* Page Header & Action Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Academic Structure & Programs</h1>
          <p className="text-sm text-slate-500">
            Build and manage Class Grades, Sections (e.g. Class 10 Sec A), Subjects, and Academic Calendars.
          </p>
        </div>

        {canManage && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setClassName('');
                setClassLevel(10);
                setShowClassModal(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-primary-700"
            >
              <Plus className="h-4 w-4" />
              <span>Add Class Grade</span>
            </button>

            <button
              type="button"
              onClick={() => handleOpenAddSection()}
              disabled={classes.length === 0}
              className="inline-flex items-center gap-1.5 rounded-xl border border-primary-200 bg-primary-50 px-3.5 py-2 text-xs font-semibold text-primary-700 transition hover:bg-primary-100 disabled:opacity-50"
            >
              <Layers className="h-4 w-4" />
              <span>Add Section</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setSubjectName('');
                setSubjectCode('');
                setCreditUnits(1);
                setShowSubjectModal(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              <BookOpen className="h-4 w-4" />
              <span>Add Subject</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setShowAssignModal(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3.5 py-2 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100"
            >
              <Users className="h-4 w-4" />
              <span>Assign Teacher</span>
            </button>
          </div>
        )}
      </div>

      {/* Feedback Alert */}
      {feedback && (
        <div
          role="status"
          className={`flex items-center gap-3 rounded-xl border p-4 text-sm font-medium transition ${
            feedback.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-rose-200 bg-rose-50 text-rose-800'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
          ) : (
            <XCircle className="h-5 w-5 shrink-0 text-rose-600" />
          )}
          <span>{feedback.message}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="ml-auto text-xs underline hover:no-underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-200">
        <button
          type="button"
          onClick={() => setActiveTab('classes')}
          className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-semibold transition ${
            activeTab === 'classes'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <GraduationCap className="h-4 w-4" />
          <span>Classes & Sections ({classes.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('subjects')}
          className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-semibold transition ${
            activeTab === 'subjects'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <BookOpen className="h-4 w-4" />
          <span>Subjects ({subjects.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('years')}
          className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-semibold transition ${
            activeTab === 'years'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Calendar className="h-4 w-4" />
          <span>Academic Calendar</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('teachers')}
          className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-semibold transition ${
            activeTab === 'teachers'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Users className="h-4 w-4" />
          <span>Teacher Assignments ({teacherAssignments.length})</span>
        </button>
      </div>

      {/* Tab 1: Classes & Sections */}
      {activeTab === 'classes' && (
        <div className="space-y-4">
          {loadingClasses ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
              Loading class grades and sections…
            </div>
          ) : classes.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
              <GraduationCap className="mx-auto mb-3 h-12 w-12 text-slate-400" />
              <h3 className="text-base font-bold text-slate-800">No Class Grades Configured</h3>
              <p className="mt-1 text-xs text-slate-500">
                Click "+ Add Class Grade" above to create classes like Grade 10, Grade 9, etc.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {classes.map((cls) => {
                const totalStudents = cls.sections.reduce(
                  (acc, s) => acc + (s._count?.students || 0),
                  0
                );

                return (
                  <div
                    key={cls.id}
                    className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="inline-block rounded-md bg-primary-100 px-2 py-0.5 text-xs font-bold text-primary-700">
                          Level {cls.level}
                        </span>
                        <h3 className="mt-1 text-lg font-bold text-slate-900">{cls.name}</h3>
                        <p className="text-xs text-slate-500">
                          {cls.sections.length} Section{cls.sections.length !== 1 ? 's' : ''} · {totalStudents} Student{totalStudents !== 1 ? 's' : ''} Enrolled
                        </p>
                      </div>

                      {canManage && (
                        <button
                          type="button"
                          onClick={() => handleOpenAddSection(cls.id)}
                          className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700"
                          title="Add section to this class"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      )}
                    </div>

                    <div className="mt-4 flex-1 space-y-2 border-t border-slate-100 pt-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                        Sections
                      </p>
                      {cls.sections.length === 0 ? (
                        <p className="py-2 text-xs italic text-slate-400">No sections added yet.</p>
                      ) : (
                        <div className="space-y-1.5">
                          {cls.sections.map((sec) => (
                            <div
                              key={sec.id}
                              className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs"
                            >
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-800">{sec.name}</span>
                                {sec.roomNumber && (
                                  <span className="flex items-center gap-1 text-[11px] text-slate-500">
                                    <DoorOpen className="h-3 w-3" />
                                    {sec.roomNumber}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 font-medium text-slate-600">
                                <Users className="h-3.5 w-3.5 text-slate-400" />
                                <span>
                                  {sec._count?.students ?? 0} / {sec.maxCapacity}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Subjects */}
      {activeTab === 'subjects' && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {loadingSubjects ? (
            <div className="py-12 text-center text-sm text-slate-500">Loading subjects…</div>
          ) : subjects.length === 0 ? (
            <div className="p-12 text-center text-sm text-slate-500">
              No subjects registered yet. Click "+ Add Subject" to create one.
            </div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Subject Name</th>
                  <th className="px-4 py-3">Credit Units</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {subjects.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/80">
                    <td className="px-4 py-3 font-mono font-bold text-primary-700">{s.code}</td>
                    <td className="px-4 py-3 font-semibold text-slate-800">{s.name}</td>
                    <td className="px-4 py-3 text-slate-600">{s.creditUnits} Unit{s.creditUnits !== 1 ? 's' : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Tab 3: Calendar */}
      {activeTab === 'years' && (
        <div className="space-y-4">
          {loadingYears ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
              Loading calendar…
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {years.map((y) => (
                <div key={y.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-slate-900">{y.name}</h3>
                    {y.isCurrent && (
                      <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                        Current Session
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {new Date(y.startDate).toLocaleDateString()} — {new Date(y.endDate).toLocaleDateString()}
                  </p>

                  <div className="mt-4 border-t border-slate-100 pt-3">
                    <p className="text-xs font-semibold text-slate-700">Academic Terms ({y.terms.length})</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {y.terms.map((t) => (
                        <span key={t.id} className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                          {t.name}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 4: Teacher Assignments */}
      {activeTab === 'teachers' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Subject Teacher Assignments</h2>
              <p className="text-xs text-slate-500">
                Official class-to-teacher mappings authorized by academic administrators.
              </p>
            </div>
            {canManage && (
              <button
                type="button"
                onClick={() => setShowAssignModal(true)}
                className="inline-flex items-center gap-1.5 self-start rounded-xl bg-primary-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-primary-700"
              >
                <Plus className="h-4 w-4" />
                <span>Assign Subject Teacher</span>
              </button>
            )}
          </div>

          {loadingAssignments ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
              Loading teacher assignments…
            </div>
          ) : teacherAssignments.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
              <Users className="mx-auto mb-3 h-12 w-12 text-slate-400" />
              <h3 className="text-base font-bold text-slate-800">No Teachers Assigned Yet</h3>
              <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto">
                Authorized administrators can assign subject teachers to specific sections and classes.
              </p>
              {canManage && (
                <button
                  type="button"
                  onClick={() => setShowAssignModal(true)}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-primary-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-primary-700"
                >
                  <Plus className="h-4 w-4" />
                  <span>Assign First Teacher</span>
                </button>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase">
                    <tr>
                      <th className="p-3.5">Subject Teacher</th>
                      <th className="p-3.5">Assigned Class & Section</th>
                      <th className="p-3.5">Subject</th>
                      <th className="p-3.5">Academic Term</th>
                      <th className="p-3.5">Role Designation</th>
                      {canManage && <th className="p-3.5 text-right">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {teacherAssignments.map((a) => (
                      <tr key={a.id} className="hover:bg-slate-50/60 transition">
                        <td className="p-3.5">
                          <p className="font-bold text-slate-900">
                            {a.teacher.user.firstName} {a.teacher.user.lastName}
                          </p>
                          <p className="text-xs text-slate-500 font-mono">
                            {a.teacher.user.email} {a.teacher.employeeCode ? `· ${a.teacher.employeeCode}` : ''}
                          </p>
                        </td>
                        <td className="p-3.5 font-semibold text-slate-800">
                          {a.section.classGrade.name} · {a.section.name}
                        </td>
                        <td className="p-3.5">
                          <span className="font-semibold text-primary-700">{a.subject.name}</span>{' '}
                          <span className="rounded bg-primary-50 px-1.5 py-0.5 text-[10px] font-mono font-bold text-primary-700">
                            {a.subject.code}
                          </span>
                        </td>
                        <td className="p-3.5 text-slate-600">
                          {a.academicTerm.academicYear.name} · {a.academicTerm.name}
                        </td>
                        <td className="p-3.5">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                              a.isPrimaryTeacher
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            <ShieldCheck className="h-3 w-3" />
                            {a.isPrimaryTeacher ? 'Primary Subject Teacher' : 'Assistant / Co-Teacher'}
                          </span>
                        </td>
                        {canManage && (
                          <td className="p-3.5 text-right">
                            <button
                              type="button"
                              onClick={() => {
                                if (
                                  window.confirm(
                                    `Unassign ${a.teacher.user.firstName} ${a.teacher.user.lastName} from ${a.section.classGrade.name} ${a.section.name}?`
                                  )
                                ) {
                                  unassignTeacherMutation.mutate(a.id);
                                }
                              }}
                              disabled={unassignTeacherMutation.isPending}
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
                              title="Unassign teacher"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal: Create Class Grade */}
      {showClassModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900">Add New Class Grade</h3>
              <button
                type="button"
                onClick={() => setShowClassModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                createClassMutation.mutate({ name: className, level: classLevel });
              }}
              className="mt-4 space-y-4"
            >
              <div>
                <label className="block text-xs font-semibold text-slate-700">Class Grade Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Grade 10 or Class 10"
                  value={className}
                  onChange={(e) => setClassName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Academic Level (1–12)</label>
                <input
                  type="number"
                  required
                  min={1}
                  max={12}
                  value={classLevel}
                  onChange={(e) => setClassLevel(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowClassModal(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createClassMutation.isPending || !className.trim()}
                  className="rounded-xl bg-primary-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-primary-700 disabled:opacity-50"
                >
                  {createClassMutation.isPending ? 'Saving…' : 'Create Class Grade'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Create Section */}
      {showSectionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900">Add New Section</h3>
              <button
                type="button"
                onClick={() => setShowSectionModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                createSectionMutation.mutate({
                  classGradeId: selectedClassIdForSection,
                  name: sectionName,
                  roomNumber: roomNumber.trim() || undefined,
                  maxCapacity,
                });
              }}
              className="mt-4 space-y-4"
            >
              <div>
                <label className="block text-xs font-semibold text-slate-700">Assign to Class</label>
                <select
                  required
                  value={selectedClassIdForSection}
                  onChange={(e) => setSelectedClassIdForSection(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                >
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} (Level {c.level})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Section Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Section A, Section B"
                  value={sectionName}
                  onChange={(e) => setSectionName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Room Number (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. Room 101"
                    value={roomNumber}
                    onChange={(e) => setRoomNumber(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">Max Capacity</label>
                  <input
                    type="number"
                    min={5}
                    max={120}
                    value={maxCapacity}
                    onChange={(e) => setMaxCapacity(Number(e.target.value))}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSectionModal(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createSectionMutation.isPending || !sectionName.trim() || !selectedClassIdForSection}
                  className="rounded-xl bg-primary-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-primary-700 disabled:opacity-50"
                >
                  {createSectionMutation.isPending ? 'Saving…' : 'Create Section'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Create Subject */}
      {showSubjectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900">Add New Subject</h3>
              <button
                type="button"
                onClick={() => setShowSubjectModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                createSubjectMutation.mutate({
                  name: subjectName,
                  code: subjectCode.toUpperCase(),
                  creditUnits,
                });
              }}
              className="mt-4 space-y-4"
            >
              <div>
                <label className="block text-xs font-semibold text-slate-700">Subject Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Mathematics or Physics"
                  value={subjectName}
                  onChange={(e) => setSubjectName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Subject Code</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. MATH-101"
                    value={subjectCode}
                    onChange={(e) => setSubjectCode(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm uppercase text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">Credit Units</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={creditUnits}
                    onChange={(e) => setCreditUnits(Number(e.target.value))}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSubjectModal(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createSubjectMutation.isPending || !subjectName.trim() || !subjectCode.trim()}
                  className="rounded-xl bg-primary-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-primary-700 disabled:opacity-50"
                >
                  {createSubjectMutation.isPending ? 'Saving…' : 'Create Subject'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Assign Subject Teacher to Class */}
      {showAssignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-900">Assign Subject Teacher</h3>
                <p className="text-xs text-slate-500 mt-0.5">Link a teacher to a subject, class grade, and section</p>
              </div>
              <button
                type="button"
                onClick={() => setShowAssignModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!assignTeacherId || !assignSubjectId || !assignSectionId || !assignTermId) {
                  setFeedback({ type: 'error', message: 'Please select all required fields to assign the teacher.' });
                  return;
                }
                assignTeacherMutation.mutate({
                  teacherId: assignTeacherId,
                  subjectId: assignSubjectId,
                  sectionId: assignSectionId,
                  academicTermId: assignTermId,
                  isPrimaryTeacher: assignIsPrimary,
                });
              }}
              className="mt-4 space-y-4"
            >
              <div>
                <label className="block text-xs font-semibold text-slate-700">Select Teacher *</label>
                <select
                  required
                  value={assignTeacherId}
                  onChange={(e) => setAssignTeacherId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                >
                  <option value="">-- Choose Teacher --</option>
                  {teachers.map((t: TeacherProfile) => (
                    <option key={t.id} value={t.id}>
                      {t.user.firstName} {t.user.lastName} ({t.employeeCode || 'Faculty'}{t.department ? ` · ${t.department}` : ''})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Select Subject *</label>
                <select
                  required
                  value={assignSubjectId}
                  onChange={(e) => setAssignSubjectId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                >
                  <option value="">-- Choose Subject --</option>
                  {subjects.map((s: Subject) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code}) · {s.creditUnits} Credits
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Class & Section *</label>
                <select
                  required
                  value={assignSectionId}
                  onChange={(e) => setAssignSectionId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                >
                  <option value="">-- Choose Class & Section --</option>
                  {sectionOptions.map((sec: { id: string; label: string }) => (
                    <option key={sec.id} value={sec.id}>
                      {sec.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Academic Term *</label>
                <select
                  required
                  value={assignTermId}
                  onChange={(e) => setAssignTermId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                >
                  <option value="">-- Choose Academic Term --</option>
                  {termOptions.map((term: { id: string; label: string }) => (
                    <option key={term.id} value={term.id}>
                      {term.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="assignIsPrimary"
                  checked={assignIsPrimary}
                  onChange={(e) => setAssignIsPrimary(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                />
                <label htmlFor="assignIsPrimary" className="text-xs font-medium text-slate-700 cursor-pointer">
                  Designate as primary subject teacher for this class
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAssignModal(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    assignTeacherMutation.isPending ||
                    !assignTeacherId ||
                    !assignSubjectId ||
                    !assignSectionId ||
                    !assignTermId
                  }
                  className="rounded-xl bg-primary-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-primary-700 disabled:opacity-50"
                >
                  {assignTeacherMutation.isPending ? 'Assigning…' : 'Confirm Assignment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
