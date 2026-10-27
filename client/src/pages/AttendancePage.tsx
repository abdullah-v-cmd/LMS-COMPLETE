import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';
import {
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  AlertTriangle,
  TrendingUp,
  BarChart2,
  Filter,
  Layers,
  ChevronRight,
  Award,
  AlertCircle,
  Check,
  X,
} from 'lucide-react';

type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED' | 'HALF_DAY';
type Section = { id: string; name: string; classGrade: { id: string; name: string } };
type SubjectAssignment = { sectionId: string; subjectId: string; section: { name: string; classGrade: { name: string } }; subject: { name: string; code: string } };
type AttendanceRecord = { id: string; studentId: string; status: AttendanceStatus; remarks: string | null; date: string; lockedAt: string | null; section?: { name: string }; student?: { admissionNumber: string; rollNumber: string | null; user: { id: string; firstName: string; lastName: string } } };
type SubjectAttendanceRecord = { id: string; status: AttendanceStatus; date: string; periodNumber: number; remarks?: string | null; lockedAt: string | null; student: { admissionNumber: string; user: { firstName: string; lastName: string } }; section: { name: string }; subject: { id?: string; name: string; code: string } };
type AttendanceSummary = { student: { admissionNumber: string; rollNumber: string | null; user: { firstName: string; lastName: string }; section: { name: string; classGrade: { name: string } } }; totalSchoolDays: number; absentDays: number; excusedDays: number; absenceRatePercent: number; chronicAbsentee: boolean };
type RosterStudent = {
  id: string;
  rollNumber: string | null;
  admissionNumber: string;
  user: { firstName: string; lastName: string };
  attendance: { id: string; status: AttendanceStatus; remarks: string | null; lockedAt: string | null } | null;
};
type Correction = {
  id: string;
  requestedStatus: AttendanceStatus;
  reason: string;
  createdAt: string;
  attendanceRecord?: {
    status: AttendanceStatus;
    student: { admissionNumber: string; rollNumber: string | null; user: { firstName: string; lastName: string } };
    section: { name: string; classGrade: { name: string } };
  };
  subjectAttendanceRecord?: {
    status: AttendanceStatus;
    periodNumber: number;
    student: { admissionNumber: string; rollNumber: string | null; user: { firstName: string; lastName: string } };
    section: { name: string; classGrade: { name: string } };
    subject: { name: string; code: string };
  } | null;
};

export type SubjectStat = {
  subjectId: string;
  subjectName: string;
  subjectCode: string;
  totalClasses: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  halfDay: number;
  percentage: number;
  records: SubjectAttendanceRecord[];
};

const statuses: AttendanceStatus[] = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED', 'HALF_DAY'];
const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};
const windowStart = (end: string) => { const d = new Date(`${end}T12:00:00`); d.setDate(d.getDate() - 89); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const messageFor = (error: unknown) => axios.isAxiosError(error)
  ? error.response?.data?.error?.message ?? 'The request could not be completed. Please try again.'
  : 'The request could not be completed. Please try again.';

export const AttendancePage: React.FC = () => {
  const { user, hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const canMark = hasPermission('attendance:mark');
  const canCorrect = hasPermission('attendance:update');
  const canReview = hasPermission('attendance:approve');
  const canJustify = user?.role === 'ROLE_PARENT';

  // Navigation tab: Default to subject_wise for students and parents
  const [activeTab, setActiveTab] = useState<'subject_wise' | 'daily'>(
    user?.role === 'ROLE_STUDENT' || user?.role === 'ROLE_PARENT' ? 'subject_wise' : 'daily'
  );

  const [date, setDate] = useState(today());
  const [sectionId, setSectionId] = useState('');
  const [subjectAssignmentKey, setSubjectAssignmentKey] = useState('');
  const [periodNumber, setPeriodNumber] = useState(1);
  const [subjectDraftStatuses, setSubjectDraftStatuses] = useState<Record<string, AttendanceStatus>>({});
  const [subjectCorrectionDrafts, setSubjectCorrectionDrafts] = useState<Record<string, { status: AttendanceStatus; reason: string }>>({});
  const [draftStatuses, setDraftStatuses] = useState<Record<string, AttendanceStatus>>({});
  const [correctionDrafts, setCorrectionDrafts] = useState<Record<string, { status: AttendanceStatus; reason: string }>>({});
  const [justificationDrafts, setJustificationDrafts] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  // Subject-Wise Attendance States
  const [subjectDateRange, setSubjectDateRange] = useState<'30' | '90' | '180' | 'all'>('90');
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState<string>('ALL');

  const subjectStartDate = useMemo(() => {
    const d = new Date();
    const days = subjectDateRange === '30' ? 30 : subjectDateRange === '90' ? 90 : subjectDateRange === '180' ? 180 : 365;
    d.setDate(d.getDate() - days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, [subjectDateRange]);

  const sectionsQuery = useQuery({
    queryKey: ['attendance-sections'],
    queryFn: async () => (await apiClient.get('/attendance/sections')).data.data as Section[],
    enabled: canMark,
  });
  useEffect(() => {
    if (!sectionId && sectionsQuery.data?.length) setSectionId(sectionsQuery.data[0].id);
  }, [sectionId, sectionsQuery.data]);

  const rosterQuery = useQuery({
    queryKey: ['attendance-roster', sectionId, date],
    queryFn: async () => (await apiClient.get(`/attendance/sections/${sectionId}/roster`, { params: { date } })).data.data as RosterStudent[],
    enabled: canMark && Boolean(sectionId) && Boolean(date),
  });
  const subjectAssignmentsQuery = useQuery({
    queryKey: ['attendance-subject-assignments'],
    queryFn: async () => (await apiClient.get('/attendance/subject-assignments')).data.data as SubjectAssignment[],
    enabled: canMark,
  });
  useEffect(() => {
    if (!subjectAssignmentKey && subjectAssignmentsQuery.data?.length) {
      const first = subjectAssignmentsQuery.data[0];
      setSubjectAssignmentKey(`${first.sectionId}:${first.subjectId}`);
    }
  }, [subjectAssignmentKey, subjectAssignmentsQuery.data]);
  const selectedSubjectAssignment = subjectAssignmentsQuery.data?.find((item) => `${item.sectionId}:${item.subjectId}` === subjectAssignmentKey);
  const subjectRosterQuery = useQuery({
    queryKey: ['attendance-subject-roster', subjectAssignmentKey, date, periodNumber],
    queryFn: async () => (await apiClient.get(`/attendance/sections/${selectedSubjectAssignment!.sectionId}/subject-roster`, { params: { subjectId: selectedSubjectAssignment!.subjectId, date, periodNumber } })).data.data as RosterStudent[],
    enabled: canMark && Boolean(selectedSubjectAssignment) && Boolean(date),
  });
  useEffect(() => {
    if (subjectRosterQuery.data) setSubjectDraftStatuses(Object.fromEntries(subjectRosterQuery.data.filter((student) => !student.attendance).map((student) => [student.id, 'PRESENT' as AttendanceStatus])));
  }, [subjectRosterQuery.data]);
  useEffect(() => {
    if (subjectRosterQuery.data) setSubjectCorrectionDrafts(Object.fromEntries(subjectRosterQuery.data.filter((student) => student.attendance).map((student) => [student.id, { status: student.attendance!.status, reason: '' }])));
  }, [subjectRosterQuery.data]);
  useEffect(() => {
    if (rosterQuery.data) {
      setDraftStatuses(Object.fromEntries(rosterQuery.data.filter((s) => !s.attendance).map((s) => [s.id, 'PRESENT' as AttendanceStatus])));
      setCorrectionDrafts(Object.fromEntries(rosterQuery.data.filter((s) => s.attendance).map((s) => [s.id, { status: s.attendance!.status, reason: '' }])));
    }
  }, [rosterQuery.data]);

  const historyQuery = useQuery({
    queryKey: ['attendance-history', sectionId, date, user?.role],
    queryFn: async () => (await apiClient.get('/attendance', { params: { ...(sectionId && canMark ? { sectionId } : {}), startDate: date, endDate: date } })).data.data as AttendanceRecord[],
    enabled: !canMark || Boolean(sectionId),
  });
  const subjectHistoryQuery = useQuery({
    queryKey: ['attendance-subject-history', sectionId, date, user?.role],
    queryFn: async () => (await apiClient.get('/attendance/subjects', { params: { ...(sectionId && canMark ? { sectionId } : {}), startDate: date, endDate: date } })).data.data as SubjectAttendanceRecord[],
    enabled: !canMark || Boolean(sectionId),
  });
  const summaryQuery = useQuery({
    queryKey: ['attendance-summary', sectionId, date, user?.role],
    queryFn: async () => (await apiClient.get('/attendance/reports/summary', { params: { ...(sectionId && canMark ? { sectionId } : {}), startDate: windowStart(date), endDate: date, thresholdPercent: 10, minimumSchoolDays: 10 } })).data.data as AttendanceSummary[],
    enabled: Boolean(date) && (!canMark || Boolean(sectionId)),
  });
  const correctionsQuery = useQuery({
    queryKey: ['attendance-corrections'],
    queryFn: async () => (await apiClient.get('/attendance/corrections')).data.data as Correction[],
    enabled: canReview,
  });

  // Query cumulative subject-wise attendance over the chosen time window
  const subjectCumulativeQuery = useQuery({
    queryKey: ['attendance-subject-cumulative', sectionId, subjectStartDate, date, user?.role],
    queryFn: async () => {
      const res = await apiClient.get('/attendance/subjects', {
        params: {
          ...(sectionId && canMark ? { sectionId } : {}),
          startDate: subjectStartDate,
          endDate: date,
        },
      });
      return (res.data?.data || []) as SubjectAttendanceRecord[];
    },
    enabled: !canMark || Boolean(sectionId),
  });

  // Calculate Subject-Wise Aggregates
  const subjectAggregates = useMemo(() => {
    const list = subjectCumulativeQuery.data ?? [];
    const map = new Map<string, SubjectStat>();

    for (const r of list) {
      const key = r.subject?.id || r.subject?.code || r.subject?.name || 'GEN';
      if (!map.has(key)) {
        map.set(key, {
          subjectId: key,
          subjectName: r.subject?.name || 'General Subject',
          subjectCode: r.subject?.code || 'GEN',
          totalClasses: 0,
          present: 0,
          absent: 0,
          late: 0,
          excused: 0,
          halfDay: 0,
          percentage: 0,
          records: [],
        });
      }
      const entry = map.get(key)!;
      entry.totalClasses += 1;
      entry.records.push(r);
      if (r.status === 'PRESENT') entry.present += 1;
      else if (r.status === 'ABSENT') entry.absent += 1;
      else if (r.status === 'LATE') entry.late += 1;
      else if (r.status === 'EXCUSED') entry.excused += 1;
      else if (r.status === 'HALF_DAY') entry.halfDay += 1;
    }

    return Array.from(map.values()).map((s) => {
      const effective = s.present + (s.late * 0.75) + (s.halfDay * 0.5) + s.excused;
      const percentage = s.totalClasses > 0 ? Math.round((effective / s.totalClasses) * 100) : 100;
      return { ...s, percentage };
    }).sort((a, b) => a.subjectName.localeCompare(b.subjectName));
  }, [subjectCumulativeQuery.data]);

  const filteredSubjectRecords = useMemo(() => {
    const all = subjectCumulativeQuery.data ?? [];
    if (selectedSubjectFilter === 'ALL') return all;
    return all.filter((r) => (r.subject?.id === selectedSubjectFilter || r.subject?.code === selectedSubjectFilter || r.subject?.name === selectedSubjectFilter));
  }, [subjectCumulativeQuery.data, selectedSubjectFilter]);

  const overallSubjectPercentage = useMemo(() => {
    if (!subjectAggregates.length) return 100;
    const totalP = subjectAggregates.reduce((acc, s) => acc + s.percentage, 0);
    return Math.round(totalP / subjectAggregates.length);
  }, [subjectAggregates]);

  const totalClassesRecorded = useMemo(() => {
    return subjectAggregates.reduce((acc, s) => acc + s.totalClasses, 0);
  }, [subjectAggregates]);

  const totalClassesAttended = useMemo(() => {
    return subjectAggregates.reduce((acc, s) => acc + s.present + s.late + s.excused, 0);
  }, [subjectAggregates]);

  const atRiskSubjectsCount = useMemo(() => {
    return subjectAggregates.filter((s) => s.percentage < 75).length;
  }, [subjectAggregates]);

  const markMutation = useMutation({
    mutationFn: async () => {
      const rows = rosterQuery.data?.filter((student) => !student.attendance) ?? [];
      if (!rows.length) throw new Error('There are no unmarked students to submit.');
      return apiClient.post('/attendance/mark', {
        sectionId,
        date,
        records: rows.map((student) => ({ studentId: student.id, status: draftStatuses[student.id] ?? 'PRESENT' })),
      });
    },
    onSuccess: async () => {
      setError(''); setNotice('Attendance saved and locked.');
      await queryClient.invalidateQueries({ queryKey: ['attendance-roster', sectionId, date] });
      await queryClient.invalidateQueries({ queryKey: ['attendance-history'] });
      await queryClient.invalidateQueries({ queryKey: ['attendance-subject-cumulative'] });
    },
    onError: (err) => { setNotice(''); setError(messageFor(err)); },
  });

  const correctionMutation = useMutation({
    mutationFn: async ({ recordId, subjectRecordId, status, reason }: { recordId?: string; subjectRecordId?: string; status: AttendanceStatus; reason: string }) =>
      apiClient.post('/attendance/corrections', { ...(recordId ? { attendanceRecordId: recordId } : { subjectAttendanceRecordId: subjectRecordId }), requestedStatus: status, reason }),
    onSuccess: async () => {
      setError(''); setNotice('Correction request sent for approval.');
      await queryClient.invalidateQueries({ queryKey: ['attendance-roster', sectionId, date] });
      await queryClient.invalidateQueries({ queryKey: ['attendance-corrections'] });
      await queryClient.invalidateQueries({ queryKey: ['attendance-subject-cumulative'] });
    },
    onError: (err) => { setNotice(''); setError(messageFor(err)); },
  });

  const markSubjectMutation = useMutation({
    mutationFn: async () => {
      const rows = subjectRosterQuery.data?.filter((student) => !student.attendance) ?? [];
      if (!selectedSubjectAssignment || !rows.length) throw new Error('There are no unmarked students to submit.');
      return apiClient.post('/attendance/subjects/mark', { sectionId: selectedSubjectAssignment.sectionId, subjectId: selectedSubjectAssignment.subjectId, date, periodNumber, records: rows.map((student) => ({ studentId: student.id, status: subjectDraftStatuses[student.id] ?? 'PRESENT' })) });
    },
    onSuccess: async () => {
      setError(''); setNotice('Subject attendance saved and locked.');
      await queryClient.invalidateQueries({ queryKey: ['attendance-subject-roster'] });
      await queryClient.invalidateQueries({ queryKey: ['attendance-subject-history'] });
      await queryClient.invalidateQueries({ queryKey: ['attendance-subject-cumulative'] });
    },
    onError: (err) => { setNotice(''); setError(messageFor(err)); },
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'APPROVED' | 'REJECTED' }) =>
      apiClient.post(`/attendance/corrections/${id}/review`, { status }),
    onSuccess: async () => {
      setError(''); setNotice('Correction request reviewed.');
      await queryClient.invalidateQueries({ queryKey: ['attendance-corrections'] });
      await queryClient.invalidateQueries({ queryKey: ['attendance-roster'] });
      await queryClient.invalidateQueries({ queryKey: ['attendance-history'] });
      await queryClient.invalidateQueries({ queryKey: ['attendance-subject-cumulative'] });
    },
    onError: (err) => { setNotice(''); setError(messageFor(err)); },
  });

  const justificationMutation = useMutation({
    mutationFn: async ({ recordId, reason }: { recordId: string; reason: string }) =>
      apiClient.post('/attendance/justifications', { attendanceRecordId: recordId, reason }),
    onSuccess: async () => {
      setError(''); setNotice('Absence explanation sent to the school for review.');
      await queryClient.invalidateQueries({ queryKey: ['attendance-history'] });
      await queryClient.invalidateQueries({ queryKey: ['attendance-corrections'] });
      await queryClient.invalidateQueries({ queryKey: ['attendance-subject-cumulative'] });
    },
    onError: (err) => { setNotice(''); setError(messageFor(err)); },
  });

  const records = useMemo(() => historyQuery.data ?? [], [historyQuery.data]);
  const dateLabel = date ? new Date(`${date}T12:00:00`).toLocaleDateString() : '';

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold tracking-wider text-primary-700 uppercase">ACADEMIC ATTENDANCE</p>
          <h1 className="mt-1 text-2xl sm:text-3xl font-extrabold text-slate-900">Attendance & Class Tracking</h1>
          <p className="mt-1 text-sm text-slate-600">
            View subject-wise attendance percentages, review daily homeroom rosters, and manage correction requests.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-bold text-slate-700">Reference Date
            <input
              type="date"
              value={date}
              onChange={(e) => { setDate(e.target.value); setNotice(''); setError(''); }}
              className="mt-1 block rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
            />
          </label>
        </div>
      </header>

      {/* Global Alerts */}
      {notice && (
        <div role="status" className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          <span>{notice}</span>
        </div>
      )}
      {error && (
        <div role="alert" className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">
          <AlertCircle className="h-5 w-5 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Mode Navigation Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab('subject_wise')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-all ${
            activeTab === 'subject_wise'
              ? 'bg-primary-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <BookOpen className="h-4 w-4" />
          Subject-Wise Attendance ({subjectAggregates.length} Subjects)
        </button>

        <button
          onClick={() => setActiveTab('daily')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-all ${
            activeTab === 'daily'
              ? 'bg-primary-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Calendar className="h-4 w-4" />
          Daily Attendance & Rosters
        </button>
      </div>

      {/* ========================================================================= */}
      {/* VIEW 1: SUBJECT-WISE ATTENDANCE (For Students, Guardians, and Instructors) */}
      {/* ========================================================================= */}
      {activeTab === 'subject_wise' && (
        <div className="space-y-6">
          {/* Top Filter and Range Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 mr-1 flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                Time Window:
              </span>
              <button
                type="button"
                onClick={() => setSubjectDateRange('30')}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                  subjectDateRange === '30'
                    ? 'bg-primary-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Past 30 Days
              </button>
              <button
                type="button"
                onClick={() => setSubjectDateRange('90')}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                  subjectDateRange === '90'
                    ? 'bg-primary-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Past 90 Days (Term)
              </button>
              <button
                type="button"
                onClick={() => setSubjectDateRange('180')}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                  subjectDateRange === '180'
                    ? 'bg-primary-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Past 6 Months
              </button>
              <button
                type="button"
                onClick={() => setSubjectDateRange('all')}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                  subjectDateRange === 'all'
                    ? 'bg-primary-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Full Academic Year
              </button>
            </div>

            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-slate-400" />
              <select
                value={selectedSubjectFilter}
                onChange={(e) => setSelectedSubjectFilter(e.target.value)}
                className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
              >
                <option value="ALL">All Enrolled Subjects</option>
                {subjectAggregates.map((s) => (
                  <option key={s.subjectId} value={s.subjectId}>
                    {s.subjectName} ({s.subjectCode})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Metric Overview Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase">Average Attendance</span>
                <div className="rounded-xl bg-primary-50 p-2 text-primary-600">
                  <TrendingUp className="h-5 w-5" />
                </div>
              </div>
              <p className="mt-2 text-2xl font-black text-slate-900">{overallSubjectPercentage}%</p>
              <p className="mt-1 text-xs text-slate-500">Across {subjectAggregates.length} Subjects</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase">Lectures Attended</span>
                <div className="rounded-xl bg-emerald-50 p-2 text-emerald-600">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
              </div>
              <p className="mt-2 text-2xl font-black text-emerald-600">
                {totalClassesAttended} / {totalClassesRecorded}
              </p>
              <p className="mt-1 text-xs text-slate-500">Scheduled Sessions</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase">Missed Classes</span>
                <div className="rounded-xl bg-rose-50 p-2 text-rose-600">
                  <AlertCircle className="h-5 w-5" />
                </div>
              </div>
              <p className="mt-2 text-2xl font-black text-rose-600">
                {totalClassesRecorded - totalClassesAttended}
              </p>
              <p className="mt-1 text-xs text-slate-500">Unexcused Absences</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase">Eligibility Benchmark</span>
                <div className={`rounded-xl p-2 ${atRiskSubjectsCount > 0 ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
                  {atRiskSubjectsCount > 0 ? <AlertTriangle className="h-5 w-5" /> : <Award className="h-5 w-5" />}
                </div>
              </div>
              <p className="mt-2 text-2xl font-black text-slate-900">
                {atRiskSubjectsCount === 0 ? 'All Clear' : `${atRiskSubjectsCount} At-Risk`}
              </p>
              <p className="mt-1 text-xs text-slate-500">75% Minimum Required for Exam</p>
            </div>
          </div>

          {/* Subject Cards Grid */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">Your Enrolled Subjects & Breakdown</h2>
              <span className="text-xs font-semibold text-slate-500">
                Showing statistics from {new Date(subjectStartDate).toLocaleDateString()} to {dateLabel}
              </span>
            </div>

            {subjectCumulativeQuery.isLoading ? (
              <div className="flex justify-center py-16">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
              </div>
            ) : subjectAggregates.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
                <BookOpen className="mx-auto h-12 w-12 text-slate-400" />
                <h3 className="mt-3 text-lg font-bold text-slate-800">No Subject Attendance Recorded</h3>
                <p className="mt-1 text-sm text-slate-500 max-w-md mx-auto">
                  There are no subject attendance sessions registered for your profile within this date range. As your teachers mark lessons, your subject percentages will update automatically.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {subjectAggregates.map((s) => {
                  const isHigh = s.percentage >= 85;
                  const isWarning = s.percentage < 75;
                  const isSelected = selectedSubjectFilter === s.subjectId;

                  return (
                    <div
                      key={s.subjectId}
                      className={`rounded-2xl border p-5 shadow-sm transition-all bg-white ${
                        isSelected
                          ? 'border-primary-500 ring-2 ring-primary-500/20'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-mono font-bold text-slate-600">
                            {s.subjectCode}
                          </span>
                          <h3 className="mt-1 text-base font-bold text-slate-900 line-clamp-1" title={s.subjectName}>
                            {s.subjectName}
                          </h3>
                        </div>
                        <div className="text-right">
                          <span
                            className={`text-2xl font-black ${
                              isHigh
                                ? 'text-emerald-600'
                                : isWarning
                                ? 'text-rose-600'
                                : 'text-amber-600'
                            }`}
                          >
                            {s.percentage}%
                          </span>
                          <span
                            className={`block text-[10px] font-bold uppercase tracking-wider ${
                              isHigh
                                ? 'text-emerald-700'
                                : isWarning
                                ? 'text-rose-700'
                                : 'text-amber-700'
                            }`}
                          >
                            {isHigh ? 'Excellent' : isWarning ? 'At-Risk (<75%)' : 'Good Standing'}
                          </span>
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div className="mt-3 w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                        <div
                          className={`h-2.5 rounded-full transition-all duration-500 ${
                            isHigh
                              ? 'bg-emerald-500'
                              : isWarning
                              ? 'bg-rose-500'
                              : 'bg-amber-500'
                          }`}
                          style={{ width: `${Math.min(s.percentage, 100)}%` }}
                        />
                      </div>

                      {/* Detail Counters */}
                      <div className="mt-4 grid grid-cols-4 gap-2 pt-3 border-t border-slate-100 text-center">
                        <div className="rounded-lg bg-slate-50 p-1.5">
                          <span className="text-[10px] font-bold text-slate-400 block uppercase">Classes</span>
                          <span className="text-xs font-bold text-slate-800">{s.totalClasses}</span>
                        </div>
                        <div className="rounded-lg bg-emerald-50 p-1.5">
                          <span className="text-[10px] font-bold text-emerald-600 block uppercase">Present</span>
                          <span className="text-xs font-bold text-emerald-700">{s.present}</span>
                        </div>
                        <div className="rounded-lg bg-rose-50 p-1.5">
                          <span className="text-[10px] font-bold text-rose-600 block uppercase">Absent</span>
                          <span className="text-xs font-bold text-rose-700">{s.absent}</span>
                        </div>
                        <div className="rounded-lg bg-amber-50 p-1.5">
                          <span className="text-[10px] font-bold text-amber-600 block uppercase">Late</span>
                          <span className="text-xs font-bold text-amber-700">{s.late}</span>
                        </div>
                      </div>

                      {/* Action Button */}
                      <div className="mt-3 flex justify-end">
                        <button
                          type="button"
                          onClick={() => setSelectedSubjectFilter(isSelected ? 'ALL' : s.subjectId)}
                          className={`text-xs font-bold transition-colors inline-flex items-center gap-1 px-2.5 py-1 rounded-lg ${
                            isSelected
                              ? 'bg-primary-100 text-primary-800'
                              : 'text-primary-600 hover:bg-primary-50'
                          }`}
                        >
                          {isSelected ? 'Clear Filter' : 'Filter Lecture History'}
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Chronological Subject Session Log Table */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Subject Lecture History Log ({filteredSubjectRecords.length} Sessions)
                </h3>
                <p className="text-xs text-slate-500">
                  Individual lectures marked by subject teachers, including period numbers and verified statuses.
                </p>
              </div>
              {selectedSubjectFilter !== 'ALL' && (
                <button
                  type="button"
                  onClick={() => setSelectedSubjectFilter('ALL')}
                  className="text-xs font-bold text-primary-600 hover:text-primary-800 underline self-start"
                >
                  Show All Subjects
                </button>
              )}
            </div>

            {filteredSubjectRecords.length === 0 ? (
              <p className="text-center py-8 text-sm text-slate-500">
                No lecture records found for this selection.
              </p>
            ) : (
              <div className="overflow-x-auto max-h-[460px]">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                    <tr>
                      <th className="p-3">Date</th>
                      <th className="p-3">Period</th>
                      <th className="p-3">Subject</th>
                      <th className="p-3">Student Name</th>
                      <th className="p-3">Class & Section</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Remarks / Verification</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredSubjectRecords.map((r) => {
                      const isPresent = r.status === 'PRESENT';
                      const isAbsent = r.status === 'ABSENT';
                      const isLate = r.status === 'LATE';
                      const isExcused = r.status === 'EXCUSED';

                      return (
                        <tr key={r.id} className="hover:bg-slate-50/50">
                          <td className="p-3 font-semibold text-slate-800">
                            {new Date(r.date).toLocaleDateString()}
                          </td>
                          <td className="p-3">
                            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-mono font-bold text-slate-700">
                              P-{r.periodNumber}
                            </span>
                          </td>
                          <td className="p-3 font-bold text-slate-900">
                            {r.subject.name} <span className="font-normal text-slate-400">({r.subject.code})</span>
                          </td>
                          <td className="p-3 text-slate-700">
                            {r.student.user.firstName} {r.student.user.lastName}
                          </td>
                          <td className="p-3 text-slate-600">
                            {r.section.name}
                          </td>
                          <td className="p-3">
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider inline-flex items-center gap-1 ${
                                isPresent
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : isAbsent
                                  ? 'bg-rose-100 text-rose-800'
                                  : isLate
                                  ? 'bg-amber-100 text-amber-800'
                                  : isExcused
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-indigo-100 text-indigo-800'
                              }`}
                            >
                              {isPresent && <Check className="h-3 w-3" />}
                              {isAbsent && <X className="h-3 w-3" />}
                              {r.status}
                            </span>
                          </td>
                          <td className="p-3 text-slate-500">
                            {r.remarks || (r.lockedAt ? 'Locked by teacher' : 'Open')}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW 2: DAILY ATTENDANCE & ROSTERS (Homeroom, Rosters, & Administrative)  */}
      {/* ========================================================================= */}
      {activeTab === 'daily' && (
        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3">
              <h2 className="text-lg font-semibold text-slate-900">Attendance summary · 90 days</h2>
              <p className="text-sm text-slate-500">
                Chronic absenteeism is flagged at 10% absent across at least 10 recorded school days. Excused days are excluded.
              </p>
            </div>
            {summaryQuery.isLoading && <p className="py-5 text-center text-sm text-slate-500">Calculating attendance summary…</p>}
            {summaryQuery.isError && <p role="alert" className="py-5 text-sm text-rose-700">Could not load attendance summary.</p>}
            {summaryQuery.data && !summaryQuery.data.some((item) => item.chronicAbsentee) && <p className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800">No chronic absenteeism flags in this reporting window.</p>}
            {!!summaryQuery.data?.some((item) => item.chronicAbsentee) && (
              <div className="space-y-2">
                {summaryQuery.data.filter((item) => item.chronicAbsentee).map((item) => (
                  <div key={item.student.admissionNumber} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
                    <span className="font-medium text-slate-800">{item.student.user.firstName} {item.student.user.lastName} · {item.student.section.classGrade.name} {item.student.section.name}</span>
                    <span className="font-semibold text-amber-900">{item.absentDays}/{item.totalSchoolDays} absent ({item.absenceRatePercent}%)</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {canMark && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Class roster</h2>
                  <p className="text-sm text-slate-500">New submissions lock after saving. Corrections need approval.</p>
                </div>
                <label className="text-sm font-medium text-slate-700">Class and section
                  <select value={sectionId} onChange={(e) => setSectionId(e.target.value)} disabled={sectionsQuery.isLoading || !sectionsQuery.data?.length} className="mt-1 block min-w-56 rounded-lg border border-slate-300 bg-white px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500">
                    {(sectionsQuery.data ?? []).map((section) => <option key={section.id} value={section.id}>{section.classGrade.name} · {section.name}</option>)}
                  </select>
                </label>
              </div>
              {sectionsQuery.isLoading && <p className="py-8 text-center text-sm text-slate-500">Loading assigned sections…</p>}
              {sectionsQuery.isError && <p role="alert" className="py-6 text-center text-sm text-rose-700">Could not load sections. Refresh to retry.</p>}
              {!sectionsQuery.isLoading && !sectionsQuery.isError && !sectionsQuery.data?.length && <p className="rounded-lg bg-slate-50 p-6 text-center text-sm text-slate-600">No sections are assigned to your account.</p>}
              {rosterQuery.isLoading && <p className="py-8 text-center text-sm text-slate-500">Loading the student roster…</p>}
              {rosterQuery.isError && <p role="alert" className="py-6 text-center text-sm text-rose-700">Could not load this roster. Check the date or section and retry.</p>}
              {rosterQuery.data && (
                <>
                  {!rosterQuery.data.length ? <p className="rounded-lg bg-slate-50 p-6 text-center text-sm text-slate-600">No active students are enrolled in this section.</p> : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[640px] text-left text-sm">
                        <thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500"><th className="px-3 py-3">Student</th><th className="px-3 py-3">Admission no.</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Action</th></tr></thead>
                        <tbody className="divide-y divide-slate-100">{rosterQuery.data.map((student) => <tr key={student.id}>
                          <td className="px-3 py-3 font-medium text-slate-800">{student.rollNumber ? `${student.rollNumber} · ` : ''}{student.user.firstName} {student.user.lastName}</td>
                          <td className="px-3 py-3 text-slate-600">{student.admissionNumber}</td>
                          <td className="px-3 py-3">{student.attendance ? <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{student.attendance.status} · locked</span> : <select aria-label={`Attendance status for ${student.user.firstName} ${student.user.lastName}`} value={draftStatuses[student.id] ?? 'PRESENT'} onChange={(e) => setDraftStatuses((s) => ({ ...s, [student.id]: e.target.value as AttendanceStatus }))} className="rounded-md border border-slate-300 bg-white px-2 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500">{statuses.map((status) => <option key={status}>{status}</option>)}</select>}</td>
                          <td className="px-3 py-3">{student.attendance && canCorrect ? <div className="flex min-w-64 gap-2">
                            <select aria-label={`Requested attendance status for ${student.user.firstName}`} value={correctionDrafts[student.id]?.status ?? student.attendance.status} onChange={(e) => setCorrectionDrafts((s) => ({ ...s, [student.id]: { ...s[student.id], status: e.target.value as AttendanceStatus, reason: s[student.id]?.reason ?? '' } }))} className="rounded-md border border-slate-300 bg-white px-2 py-1.5">{statuses.map((status) => <option key={status}>{status}</option>)}</select>
                            <input aria-label="Correction reason" placeholder="Reason" value={correctionDrafts[student.id]?.reason ?? ''} onChange={(e) => setCorrectionDrafts((s) => ({ ...s, [student.id]: { status: s[student.id]?.status ?? student.attendance!.status, reason: e.target.value } }))} className="min-w-24 flex-1 rounded-md border border-slate-300 px-2 py-1.5" />
                            <button disabled={correctionMutation.isPending || (correctionDrafts[student.id]?.reason.trim().length ?? 0) < 5} onClick={() => correctionMutation.mutate({ recordId: student.attendance!.id, status: correctionDrafts[student.id]?.status ?? student.attendance!.status, reason: correctionDrafts[student.id]?.reason ?? '' })} className="rounded-md bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">Request</button>
                          </div> : student.attendance ? <span className="text-xs text-slate-500">Submitted</span> : null}</td>
                        </tr>)}</tbody>
                      </table>
                    </div>
                  )}
                  {rosterQuery.data.some((s) => !s.attendance) && (
                    <div className="mt-4 flex justify-end">
                      <button onClick={() => markMutation.mutate()} disabled={markMutation.isPending || !date} className="rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50">
                        {markMutation.isPending ? 'Saving attendance…' : `Save attendance for ${dateLabel}`}
                      </button>
                    </div>
                  )}
                </>
              )}
            </section>
          )}

          {canMark && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Subject and period attendance</h2>
                  <p className="text-sm text-slate-500">Mark an assigned subject lesson; records lock after saving.</p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <label className="text-sm font-medium">Assigned subject
                    <select value={subjectAssignmentKey} onChange={(e) => setSubjectAssignmentKey(e.target.value)} className="mt-1 block min-w-56 rounded-lg border border-slate-300 bg-white px-3 py-2">
                      {(subjectAssignmentsQuery.data ?? []).map((item) => (
                        <option key={`${item.sectionId}:${item.subjectId}`} value={`${item.sectionId}:${item.subjectId}`}>
                          {item.section.classGrade.name} · {item.section.name} · {item.subject.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm font-medium">Period
                    <input type="number" min={1} max={20} value={periodNumber} onChange={(e) => setPeriodNumber(Number(e.target.value))} className="mt-1 block w-24 rounded-lg border border-slate-300 px-3 py-2"/>
                  </label>
                </div>
              </div>
              {subjectAssignmentsQuery.isLoading && <p className="py-6 text-center text-sm text-slate-500">Loading subject assignments…</p>}
              {subjectAssignmentsQuery.isError && <p role="alert" className="py-6 text-sm text-rose-700">Could not load your subject assignments.</p>}
              {subjectAssignmentsQuery.data && !subjectAssignmentsQuery.data.length && <p className="rounded-lg bg-slate-50 p-5 text-center text-sm text-slate-600">No subject/section teaching assignments are available for your account.</p>}
              {subjectRosterQuery.isLoading && <p className="py-6 text-center text-sm text-slate-500">Loading enrolled students…</p>}
              {subjectRosterQuery.isError && <p role="alert" className="py-6 text-sm text-rose-700">Could not load this subject roster.</p>}
              {!!subjectRosterQuery.data?.length && (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[740px] text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                          <th className="px-3 py-3">Student</th>
                          <th className="px-3 py-3">Admission no.</th>
                          <th className="px-3 py-3">Status</th>
                          <th className="px-3 py-3">Correction request</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {subjectRosterQuery.data.map((student) => (
                          <tr key={student.id}>
                            <td className="px-3 py-3">{student.user.firstName} {student.user.lastName}</td>
                            <td className="px-3 py-3">{student.admissionNumber}</td>
                            <td className="px-3 py-3">
                              {student.attendance ? (
                                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold">{student.attendance.status} · locked</span>
                              ) : (
                                <select aria-label={`Period ${periodNumber} attendance for ${student.user.firstName}`} value={subjectDraftStatuses[student.id] ?? 'PRESENT'} onChange={(e) => setSubjectDraftStatuses((drafts) => ({ ...drafts, [student.id]: e.target.value as AttendanceStatus }))} className="rounded-md border border-slate-300 bg-white px-2 py-1.5">{statuses.map((status) => <option key={status}>{status}</option>)}</select>
                              )}
                            </td>
                            <td className="px-3 py-3">
                              {student.attendance && canCorrect ? (
                                <div className="flex min-w-64 gap-2">
                                  <select aria-label="Requested subject attendance status" value={subjectCorrectionDrafts[student.id]?.status ?? student.attendance.status} onChange={(e) => setSubjectCorrectionDrafts((drafts) => ({ ...drafts, [student.id]: { ...drafts[student.id], status: e.target.value as AttendanceStatus, reason: drafts[student.id]?.reason ?? '' } }))} className="rounded-md border border-slate-300 px-2 py-1.5">{statuses.map((status) => <option key={status}>{status}</option>)}</select>
                                  <input aria-label="Subject attendance correction reason" placeholder="Reason" value={subjectCorrectionDrafts[student.id]?.reason ?? ''} onChange={(e) => setSubjectCorrectionDrafts((drafts) => ({ ...drafts, [student.id]: { status: drafts[student.id]?.status ?? student.attendance!.status, reason: e.target.value } }))} className="min-w-24 flex-1 rounded-md border border-slate-300 px-2 py-1.5"/>
                                  <button disabled={correctionMutation.isPending || (subjectCorrectionDrafts[student.id]?.reason.trim().length ?? 0) < 5} onClick={() => correctionMutation.mutate({ subjectRecordId: student.attendance!.id, status: subjectCorrectionDrafts[student.id]?.status ?? student.attendance!.status, reason: subjectCorrectionDrafts[student.id]?.reason ?? '' })} className="rounded-md bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">Request</button>
                                </div>
                              ) : student.attendance ? (
                                <span className="text-xs text-slate-500">Submitted</span>
                              ) : null}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {subjectRosterQuery.data.some((student) => !student.attendance) && (
                    <div className="mt-4 flex justify-end">
                      <button disabled={markSubjectMutation.isPending || periodNumber < 1 || periodNumber > 20} onClick={() => markSubjectMutation.mutate()} className="rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                        {markSubjectMutation.isPending ? 'Saving…' : `Save period ${periodNumber}`}
                      </button>
                    </div>
                  )}
                </>
              )}
            </section>
          )}

          {canReview && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Pending correction approvals</h2>
              <p className="mb-4 text-sm text-slate-500">A requester cannot approve their own correction.</p>
              {correctionsQuery.isLoading && <p className="py-6 text-center text-sm text-slate-500">Loading requests…</p>}
              {correctionsQuery.isError && <p role="alert" className="py-6 text-sm text-rose-700">Could not load correction requests.</p>}
              {correctionsQuery.data && correctionsQuery.data.length === 0 && <p className="rounded-lg bg-slate-50 p-5 text-center text-sm text-slate-600">No pending attendance corrections.</p>}
              {!!correctionsQuery.data?.length && (
                <div className="space-y-3">
                  {correctionsQuery.data.map((item) => {
                    const target = item.attendanceRecord ?? item.subjectAttendanceRecord;
                    if (!target) return null;
                    return (
                      <article key={item.id} className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="font-semibold text-slate-800">{target.student.user.firstName} {target.student.user.lastName} <span className="font-normal text-slate-500">· {target.student.admissionNumber}</span></p>
                          <p className="text-sm text-slate-600">{target.section.classGrade.name} · {target.section.name}{item.subjectAttendanceRecord ? ` · ${item.subjectAttendanceRecord.subject.name}, period ${item.subjectAttendanceRecord.periodNumber}` : ''}: {target.status} → {item.requestedStatus}</p>
                          <p className="mt-1 text-sm text-slate-500">{item.reason}</p>
                        </div>
                        <div className="flex gap-2">
                          <button disabled={reviewMutation.isPending} onClick={() => reviewMutation.mutate({ id: item.id, status: 'REJECTED' })} className="rounded-lg border border-rose-300 px-3 py-2 text-sm font-semibold text-rose-700 disabled:opacity-50">Reject</button>
                          <button disabled={reviewMutation.isPending} onClick={() => reviewMutation.mutate({ id: item.id, status: 'APPROVED' })} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Approve</button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-slate-900">Homeroom Attendance for {dateLabel}</h2>
              <p className="text-sm text-slate-500">Records visible to your account. Student and guardian views are restricted to linked profiles.</p>
            </div>
            {historyQuery.isLoading && <p className="py-8 text-center text-sm text-slate-500">Loading attendance…</p>}
            {historyQuery.isError && <p role="alert" className="py-6 text-center text-sm text-rose-700">Could not load attendance records.</p>}
            {historyQuery.data && !records.length && <p className="rounded-lg bg-slate-50 p-6 text-center text-sm text-slate-600">No attendance records found for this date.</p>}
            {!!records.length && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-left text-sm">
                  <thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500"><th className="px-3 py-3">Student</th><th className="px-3 py-3">Section</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Submitted</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">{records.map((record) => <tr key={record.id}>
                    <td className="px-3 py-3">{record.student ? `${record.student.user.firstName} ${record.student.user.lastName}` : 'My attendance'}</td>
                    <td className="px-3 py-3">{record.section?.name ?? '—'}</td>
                    <td className="px-3 py-3"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold">{record.status}</span></td>
                    <td className="px-3 py-3 text-slate-500">{record.lockedAt ? 'Locked' : 'Open'}</td>
                  </tr>)}</tbody>
                </table>
              </div>
            )}
            {canJustify && records.filter((record) => record.status === 'ABSENT' && record.lockedAt).map((record) => (
              <div key={`justify-${record.id}`} className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
                <span className="text-sm font-medium text-amber-900">Explain this absence:</span>
                <input aria-label="Absence explanation" placeholder="Reason for absence" value={justificationDrafts[record.id] ?? ''} onChange={(e) => setJustificationDrafts((drafts) => ({ ...drafts, [record.id]: e.target.value }))} className="min-w-48 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm" />
                <button disabled={justificationMutation.isPending || (justificationDrafts[record.id]?.trim().length ?? 0) < 5} onClick={() => justificationMutation.mutate({ recordId: record.id, reason: justificationDrafts[record.id] ?? '' })} className="rounded-md bg-primary-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Send explanation</button>
              </div>
            ))}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-slate-900">Subject attendance for {dateLabel}</h2>
              <p className="text-sm text-slate-500">Subject and period records for your account's assigned or linked students on this single date.</p>
            </div>
            {subjectHistoryQuery.isLoading && <p className="py-6 text-center text-sm text-slate-500">Loading subject attendance…</p>}
            {subjectHistoryQuery.isError && <p role="alert" className="py-6 text-sm text-rose-700">Could not load subject attendance.</p>}
            {subjectHistoryQuery.data && !subjectHistoryQuery.data.length && <p className="rounded-lg bg-slate-50 p-5 text-center text-sm text-slate-600">No subject attendance records found for this date.</p>}
            {!!subjectHistoryQuery.data?.length && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px] text-left text-sm">
                  <thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500"><th className="px-3 py-3">Student</th><th className="px-3 py-3">Class</th><th className="px-3 py-3">Subject</th><th className="px-3 py-3">Period</th><th className="px-3 py-3">Status</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">{subjectHistoryQuery.data.map((record) => <tr key={record.id}><td className="px-3 py-3">{record.student.user.firstName} {record.student.user.lastName}</td><td className="px-3 py-3">{record.section.name}</td><td className="px-3 py-3">{record.subject.name}</td><td className="px-3 py-3">{record.periodNumber}</td><td className="px-3 py-3"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold">{record.status}{record.lockedAt ? ' · locked' : ''}</span></td></tr>)}</tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
};
