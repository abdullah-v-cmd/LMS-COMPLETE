import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import {
  Calendar,
  Award,
  FileSpreadsheet,
  CheckSquare,
  Settings,
  Printer,
  Search,
  CheckCircle2,
  Clock,
  MapPin,
  Users,
  ShieldCheck,
  FileText,
  AlertCircle,
  PlusCircle,
  Upload,
  ChevronDown,
  ChevronUp,
  Filter,
  BarChart3,
  X,
  Layers,
} from 'lucide-react';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';

type Schedule = {
  id: string;
  subjectId: string;
  subject: { id: string; name: string; code: string };
  examDate: string;
  startTime: string;
  endTime: string;
  maxMarks: number;
  passMarks: number;
  roomNumber: string | null;
  marks?: Array<{ id: string; studentId: string; marksObtained: number; isAbsent: boolean }>;
  invigilators?: Array<{ id: string; user: { firstName: string; lastName: string } }>;
};

type Session = {
  id: string;
  name: string;
  academicTermId: string;
  startDate: string;
  endDate: string;
  status: string;
  schedules: Schedule[];
  academicTerm: { name: string; academicYear: { name: string } };
};

type SubjectMark = {
  id: string;
  subjectId: string;
  subjectName: string;
  subjectCode: string;
  maxMarks: number;
  passMarks: number;
  marksObtained: number;
  percentage: number;
  isAbsent: boolean;
  isPassed: boolean;
  gradeLetter: string;
  remarks: string | null;
};

type StudentRow = {
  id: string;
  admissionNumber: string;
  rollNumber: string | null;
  sectionId: string;
  section?: { id: string; name: string; classGrade: { id: string; name: string; level: number } };
  user: { firstName: string; lastName: string };
  mark: { id: string; marksObtained: number; isAbsent: boolean; remarks: string | null } | null;
};

type GradeChange = {
  id: string;
  proposedMarks: number;
  originalMarks: number;
  reason: string;
  examMark: {
    student: { admissionNumber: string; user: { firstName: string; lastName: string } };
    examSchedule: { subject: { name: string }; examSession: { name: string } };
  };
};

type AcademicYear = { id: string; name: string; terms: { id: string; name: string }[] };
type Subject = { id: string; name: string; code: string };

type ReportCard = {
  id: string;
  percentage: number;
  gradeLetter: string;
  gpa: number;
  rank: number | null;
  totalMarks: number;
  verificationSignature: string | null;
  publishedAt?: string | null;
  examSession: { id: string; name: string; academicTerm?: { name: string; academicYear: { name: string } } };
  student?: {
    id: string;
    admissionNumber: string;
    rollNumber?: string | null;
    user: { firstName: string; lastName: string; email?: string };
    section?: { id: string; name: string; classGrade: { id: string; name: string } };
  };
  subjectMarks?: SubjectMark[];
};

type Invigilator = {
  user: { id: string; firstName: string; lastName: string; role: string; teacherProfile?: { employeeCode: string | null } | null };
};

type GradeBand = { minimumPercentage: number; gradeLetter: string; gpa: number };
type SectionOption = { id: string; name: string; className: string; label: string };

const errorText = (e: unknown) =>
  axios.isAxiosError(e)
    ? e.response?.data?.error?.message ?? 'The request could not be completed.'
    : 'The request could not be completed.';

const localDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

export const ExamsPage: React.FC = () => {
  const { user, hasPermission } = useAuth();
  const cache = useQueryClient();
  const navigate = useNavigate();

  const roleUpper = String(user?.role ?? '').toUpperCase();
  const isStudent = roleUpper === 'ROLE_STUDENT' || roleUpper.includes('STUDENT');
  const isParent = roleUpper === 'ROLE_PARENT' || roleUpper.includes('PARENT');
  const isStudentOrParent = isStudent || isParent;
  const isTeacher =
    roleUpper === 'ROLE_SUBJECT_TEACHER' ||
    roleUpper === 'ROLE_TEACHING_ASSISTANT' ||
    roleUpper === 'ROLE_CLASS_TEACHER' ||
    roleUpper.includes('TEACHER');
  const isControllerOrAdmin =
    !isStudentOrParent &&
    (hasPermission('exam:create') ||
      hasPermission('result:release') ||
      roleUpper.includes('ADMIN') ||
      roleUpper.includes('CONTROLLER') ||
      roleUpper.includes('HEAD'));

  const canCreate = hasPermission('exam:create');
  const canMark = hasPermission('exam:marks:entry');
  const canChangeGrade = hasPermission('grade:update');
  const canReview = hasPermission('grade:approve');
  const canPublish = hasPermission('result:release');

  // Initial tab selection based on user role
  const defaultTab = useMemo(() => {
    if (isStudentOrParent) return 'timetable';
    if (canMark && isTeacher) return 'marks';
    if (canCreate) return 'management';
    return 'timetable';
  }, [isStudentOrParent, isTeacher, canMark, canCreate]);

  const [activeTab, setActiveTab] = useState<'timetable' | 'marks' | 'corrections' | 'results' | 'management'>(defaultTab);

  // General state
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  // Selected session for timetable viewing
  const [selectedTimetableSessionId, setSelectedTimetableSessionId] = useState('');

  // Forms state
  const [sessionForm, setSessionForm] = useState({ academicTermId: '', name: '', startDate: localDate(), endDate: localDate() });
  const [scheduleForm, setScheduleForm] = useState({
    examSessionId: '',
    subjectId: '',
    examDate: localDate(),
    startTime: '09:00',
    endTime: '12:00',
    maxMarks: 100,
    passMarks: 40,
    roomNumber: '',
  });

  // Marks entry state
  const [scheduleId, setScheduleId] = useState('');
  const [sectionFilter, setSectionFilter] = useState('ALL');
  const [marks, setMarks] = useState<Record<string, number>>({});
  const [absentDrafts, setAbsentDrafts] = useState<Record<string, boolean>>({});
  const [csvText, setCsvText] = useState('');
  const [showCsvImport, setShowCsvImport] = useState(false);

  // Grade corrections & results state
  const [gradeDrafts, setGradeDrafts] = useState<Record<string, { proposedMarks: number; reason: string }>>({});
  const [selectedInvigilators, setSelectedInvigilators] = useState<string[]>([]);
  const [gradeBands, setGradeBands] = useState<GradeBand[]>([]);
  const [resultSearch, setResultSearch] = useState('');
  const [resultSessionFilter, setResultSessionFilter] = useState('ALL');
  const [resultSectionFilter, setResultSectionFilter] = useState('ALL');
  const [resultSubjectFilter, setResultSubjectFilter] = useState('ALL');
  const [resultViewMode, setResultViewMode] = useState<'transcripts' | 'subject_marks'>(
    isTeacher && !isControllerOrAdmin ? 'subject_marks' : 'transcripts'
  );
  const [selectedResultCardId, setSelectedResultCardId] = useState<string | null>(null);
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);

  // Queries
  const sessionsQuery = useQuery({
    queryKey: ['exam-sessions'],
    queryFn: async () => (await apiClient.get('/exams/sessions')).data.data as Session[],
  });

  const yearsQuery = useQuery({
    queryKey: ['academic-years'],
    queryFn: async () => (await apiClient.get('/academic/years')).data.data as AcademicYear[],
    enabled: canCreate,
  });

  const subjectsQuery = useQuery({
    queryKey: ['academic-subjects'],
    queryFn: async () => (await apiClient.get('/academic/subjects')).data.data as Subject[],
    enabled: canCreate,
  });

  const reportCardsQuery = useQuery({
    queryKey: ['report-cards'],
    queryFn: async () => (await apiClient.get('/exams/report-cards')).data.data as ReportCard[],
  });

  const gradingScaleQuery = useQuery({
    queryKey: ['exam-grading-scale'],
    queryFn: async () => (await apiClient.get('/exams/grading-scale')).data.data as { source: string; bands: GradeBand[] },
    enabled: canCreate,
  });

  const invigilatorCandidatesQuery = useQuery({
    queryKey: ['invigilator-candidates'],
    queryFn: async () =>
      (await apiClient.get('/exams/invigilators/candidates')).data.data as {
        user: { id: string; firstName: string; lastName: string; role: string };
        employeeCode: string | null;
      }[],
    enabled: canCreate,
  });

  const assignedInvigilatorsQuery = useQuery({
    queryKey: ['schedule-invigilators', scheduleId],
    queryFn: async () => (await apiClient.get(`/exams/schedules/${scheduleId}/invigilators`)).data.data as Invigilator[],
    enabled: canCreate && Boolean(scheduleId),
  });

  const rosterQuery = useQuery({
    queryKey: ['exam-mark-roster', scheduleId],
    queryFn: async () =>
      (await apiClient.get(`/exams/schedules/${scheduleId}/roster`)).data.data as {
        schedule: { id: string; maxMarks: number; passMarks: number; examSession: { status: string; name: string } };
        sections?: SectionOption[];
        students: StudentRow[];
      },
    enabled: canMark && Boolean(scheduleId),
  });

  const changesQuery = useQuery({
    queryKey: ['grade-change-queue'],
    queryFn: async () => (await apiClient.get('/exams/grade-changes')).data.data as GradeChange[],
    enabled: canReview || canChangeGrade,
  });

  const termOptions = useMemo(
    () => yearsQuery.data?.flatMap((year) => year.terms.map((term) => ({ id: term.id, label: `${year.name} · ${term.name}` }))) ?? [],
    [yearsQuery.data]
  );

  useEffect(() => {
    if (!sessionForm.academicTermId && termOptions.length) {
      setSessionForm((f) => ({ ...f, academicTermId: termOptions[0].id }));
    }
  }, [sessionForm.academicTermId, termOptions]);

  useEffect(() => {
    if (!scheduleForm.examSessionId && sessionsQuery.data?.length) {
      setScheduleForm((f) => ({ ...f, examSessionId: sessionsQuery.data![0].id }));
    }
    if (!selectedTimetableSessionId && sessionsQuery.data?.length) {
      setSelectedTimetableSessionId(sessionsQuery.data[0].id);
    }
  }, [scheduleForm.examSessionId, selectedTimetableSessionId, sessionsQuery.data]);

  useEffect(() => {
    if (!scheduleForm.subjectId && subjectsQuery.data?.length) {
      setScheduleForm((f) => ({ ...f, subjectId: subjectsQuery.data![0].id }));
    }
  }, [scheduleForm.subjectId, subjectsQuery.data]);

  useEffect(() => {
    if (!scheduleId && sessionsQuery.data?.some((s) => s.schedules.length)) {
      const firstSessionWithSchedules = sessionsQuery.data.find((s) => s.schedules.length);
      if (firstSessionWithSchedules) setScheduleId(firstSessionWithSchedules.schedules[0].id);
    }
  }, [scheduleId, sessionsQuery.data]);

  useEffect(() => {
    if (rosterQuery.data) {
      setMarks(Object.fromEntries(rosterQuery.data.students.filter((s) => !s.mark).map((s) => [s.id, 0])));
      setAbsentDrafts(Object.fromEntries(rosterQuery.data.students.filter((s) => !s.mark).map((s) => [s.id, false])));
    }
  }, [rosterQuery.data]);

  const invalidate = async () => {
    await Promise.all([
      cache.invalidateQueries({ queryKey: ['exam-sessions'] }),
      cache.invalidateQueries({ queryKey: ['exam-mark-roster'] }),
      cache.invalidateQueries({ queryKey: ['report-cards'] }),
      cache.invalidateQueries({ queryKey: ['grade-change-queue'] }),
      cache.invalidateQueries({ queryKey: ['schedule-invigilators'] }),
      cache.invalidateQueries({ queryKey: ['exam-grading-scale'] }),
    ]);
  };

  const mutate = <TVariables = void,>(fn: (variables: TVariables) => Promise<unknown>, success: string) => ({
    mutationFn: fn,
    onSuccess: async () => {
      setError('');
      setNotice(success);
      await invalidate();
    },
    onError: (e: unknown) => {
      setNotice('');
      setError(errorText(e));
    },
  });

  const sessionMutation = useMutation(mutate(async () => apiClient.post('/exams/sessions', sessionForm), 'Exam session created successfully.'));
  const scheduleMutation = useMutation(
    mutate(
      async () =>
        apiClient.post('/exams/schedules', {
          ...scheduleForm,
          maxMarks: Number(scheduleForm.maxMarks),
          passMarks: Number(scheduleForm.passMarks),
          roomNumber: scheduleForm.roomNumber || undefined,
        }),
      'Exam schedule added successfully.'
    )
  );

  const marksMutation = useMutation(
    mutate(async () => {
      const rows = rosterQuery.data?.students.filter((student) => !student.mark) ?? [];
      if (!rows.length) throw new Error('There are no unmarked students in this schedule.');
      return apiClient.post('/exams/marks', {
        examScheduleId: scheduleId,
        marks: rows.map((student) => ({
          studentId: student.id,
          marksObtained: absentDrafts[student.id] ? 0 : Number(marks[student.id] ?? 0),
          isAbsent: absentDrafts[student.id] ?? false,
        })),
      });
    }, 'Marks submitted successfully. Existing marks now require grade correction requests.')
  );

  const gradeMutation = useMutation(
    mutate(
      async ({ markId, proposedMarks, reason }: { markId: string; proposedMarks: number; reason: string }) =>
        apiClient.post('/exams/grade-changes', { examMarkId: markId, proposedMarks, reason }),
      'Grade change request submitted for Maker-Checker approval.'
    )
  );

  const reviewMutation = useMutation(
    mutate(
      async ({ id, status }: { id: string; status: 'APPROVED' | 'REJECTED' }) =>
        apiClient.post(`/exams/grade-changes/${id}/review`, { status }),
      'Grade change reviewed.'
    )
  );

  const publishMutation = useMutation(
    mutate(
      async (examSessionId: string) => apiClient.post('/exams/results/publish', { examSessionId }),
      'Results compiled, signed with HMAC-SHA256, and published to student portals!'
    )
  );

  const invigilatorsMutation = useMutation(
    mutate(
      async () => apiClient.put(`/exams/schedules/${scheduleId}/invigilators`, { userIds: selectedInvigilators }),
      'Invigilator assignments saved.'
    )
  );

  useEffect(() => {
    if (assignedInvigilatorsQuery.data) {
      setSelectedInvigilators(assignedInvigilatorsQuery.data.map((item) => item.user.id));
    }
  }, [assignedInvigilatorsQuery.data]);

  useEffect(() => {
    if (gradingScaleQuery.data) {
      setGradeBands(
        gradingScaleQuery.data.bands.map(({ minimumPercentage, gradeLetter, gpa }) => ({
          minimumPercentage,
          gradeLetter,
          gpa,
        }))
      );
    }
  }, [gradingScaleQuery.data]);

  const gradingScaleMutation = useMutation(
    mutate(
      async () =>
        apiClient.put('/exams/grading-scale', {
          bands: gradeBands.map((band) => ({
            ...band,
            minimumPercentage: Number(band.minimumPercentage),
            gpa: Number(band.gpa),
          })),
        }),
      'Institution grading scale saved successfully.'
    )
  );

  const importCsv = () => {
    const roster = rosterQuery.data?.students ?? [];
    const byAdmission = new Map(roster.map((student) => [student.admissionNumber.toLowerCase(), student]));
    const imported: Record<string, number> = {};
    const importedAbsences: Record<string, boolean> = {};
    const lines = csvText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

    for (const [index, line] of lines.entries()) {
      if (index === 0 && /admission/i.test(line)) continue;
      const [admission, rawMarks, rawAbsent = 'false'] = line.split(',').map((part) => part.trim());
      const student = byAdmission.get((admission ?? '').toLowerCase());
      const score = Number(rawMarks);

      if (
        !student ||
        student.mark ||
        Object.prototype.hasOwnProperty.call(imported, student.id) ||
        !Number.isFinite(score) ||
        score < 0 ||
        score > (rosterQuery.data?.schedule.maxMarks ?? 0) ||
        !['true', 'false', '1', '0', ''].includes(rawAbsent.toLowerCase())
      ) {
        setError(`CSV line ${index + 1} is invalid, duplicated, already marked, or outside the allowed range.`);
        setNotice('');
        return;
      }
      const isAbsent = ['true', '1'].includes(rawAbsent.toLowerCase());
      imported[student.id] = score;
      importedAbsences[student.id] = isAbsent;
    }

    setMarks((prev) => ({ ...prev, ...imported }));
    setAbsentDrafts((prev) => ({ ...prev, ...importedAbsences }));
    setNotice(`Imported ${Object.keys(imported).length} rows from CSV.`);
    setError('');
    setShowCsvImport(false);
  };

  const filteredStudents = useMemo(() => {
    if (!rosterQuery.data?.students) return [];
    if (sectionFilter === 'ALL') return rosterQuery.data.students;
    return rosterQuery.data.students.filter((s) => s.sectionId === sectionFilter);
  }, [rosterQuery.data?.students, sectionFilter]);

  // Current session timetable data
  const currentTimetableSession = useMemo(() => {
    if (!sessionsQuery.data) return null;
    return sessionsQuery.data.find((s) => s.id === selectedTimetableSessionId) ?? sessionsQuery.data[0] ?? null;
  }, [sessionsQuery.data, selectedTimetableSessionId]);

  // Unique sections available in results
  const availableSections = useMemo(() => {
    const map = new Map<string, { id: string; label: string }>();
    (reportCardsQuery.data ?? []).forEach((c) => {
      if (c.student?.section) {
        const sec = c.student.section;
        const label = `${sec.classGrade.name} - Section ${sec.name}`;
        map.set(sec.id, { id: sec.id, label });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [reportCardsQuery.data]);

  // Unique subjects available in results
  const availableSubjects = useMemo(() => {
    const map = new Map<string, { id: string; name: string; code: string }>();
    (reportCardsQuery.data ?? []).forEach((c) => {
      (c.subjectMarks ?? []).forEach((sm) => {
        if (sm.subjectId && !map.has(sm.subjectId)) {
          map.set(sm.subjectId, { id: sm.subjectId, name: sm.subjectName, code: sm.subjectCode });
        }
      });
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [reportCardsQuery.data]);

  // Guaranteed isolated report cards for student (prevents student from seeing any other students)
  const studentOnlyCards = useMemo(() => {
    const list = reportCardsQuery.data ?? [];
    if (!isStudent || !user) return list;
    return list.filter(
      (c) =>
        c.student?.user.email === user.email ||
        (user.username && c.student?.user.firstName && c.student.user.firstName.toLowerCase() === user.username.toLowerCase())
    );
  }, [reportCardsQuery.data, isStudent, user]);

  // Filtered report cards for staff/controller/teacher view
  const filteredReportCards = useMemo(() => {
    let list = reportCardsQuery.data ?? [];

    if (isStudent) {
      return studentOnlyCards;
    }

    // 1. Session filter
    if (resultSessionFilter !== 'ALL') {
      list = list.filter((c) => c.examSession.id === resultSessionFilter);
    }

    // 2. Section filter
    if (resultSectionFilter !== 'ALL') {
      list = list.filter((c) => c.student?.section?.id === resultSectionFilter);
    }

    // 3. Smart Search query (Roll number, First name, Last name, Full name, Admission number)
    if (resultSearch.trim()) {
      const q = resultSearch.trim().toLowerCase();
      list = list.filter((c) => {
        const student = c.student;
        if (!student) return false;
        const firstName = (student.user.firstName || '').toLowerCase();
        const lastName = (student.user.lastName || '').toLowerCase();
        const fullName = `${firstName} ${lastName}`.trim();
        const reversedFullName = `${lastName} ${firstName}`.trim();
        const rollNumber = (student.rollNumber || '').toLowerCase();
        const admissionNumber = (student.admissionNumber || '').toLowerCase();
        const sectionName = (student.section?.name || '').toLowerCase();
        const className = (student.section?.classGrade.name || '').toLowerCase();

        return (
          firstName.includes(q) ||
          lastName.includes(q) ||
          fullName.includes(q) ||
          reversedFullName.includes(q) ||
          rollNumber.includes(q) ||
          rollNumber === q ||
          admissionNumber.includes(q) ||
          sectionName.includes(q) ||
          className.includes(q)
        );
      });
    }

    return list;
  }, [reportCardsQuery.data, isStudent, studentOnlyCards, resultSessionFilter, resultSectionFilter, resultSearch]);

  // Flattened per-subject rows for Teacher & Controller subject inspection
  const filteredSubjectRows = useMemo(() => {
    const rows: Array<{
      cardId: string;
      studentId: string;
      studentName: string;
      admissionNumber: string;
      rollNumber: string;
      className: string;
      sectionName: string;
      sessionName: string;
      subjectId: string;
      subjectName: string;
      subjectCode: string;
      maxMarks: number;
      passMarks: number;
      marksObtained: number;
      percentage: number;
      gradeLetter: string;
      isPassed: boolean;
      isAbsent: boolean;
      remarks: string | null;
      rawCard: ReportCard;
    }> = [];

    for (const card of filteredReportCards) {
      const student = card.student;
      if (!student) continue;
      const marks = card.subjectMarks || [];

      for (const sm of marks) {
        if (resultSubjectFilter !== 'ALL' && sm.subjectId !== resultSubjectFilter) {
          continue;
        }

        rows.push({
          cardId: card.id,
          studentId: student.id,
          studentName: `${student.user.firstName} ${student.user.lastName}`,
          admissionNumber: student.admissionNumber,
          rollNumber: student.rollNumber || '—',
          className: student.section?.classGrade.name || '—',
          sectionName: student.section?.name || '—',
          sessionName: card.examSession.name,
          subjectId: sm.subjectId,
          subjectName: sm.subjectName,
          subjectCode: sm.subjectCode,
          maxMarks: sm.maxMarks,
          passMarks: sm.passMarks,
          marksObtained: sm.marksObtained,
          percentage: sm.percentage,
          gradeLetter: sm.gradeLetter,
          isPassed: sm.isPassed,
          isAbsent: sm.isAbsent,
          remarks: sm.remarks,
          rawCard: card,
        });
      }
    }

    return rows;
  }, [filteredReportCards, resultSubjectFilter]);

  const activeStudentCard = useMemo(() => {
    if (!studentOnlyCards.length) return null;
    if (selectedResultCardId) {
      return studentOnlyCards.find((c) => c.id === selectedResultCardId) ?? studentOnlyCards[0];
    }
    return studentOnlyCards[0];
  }, [studentOnlyCards, selectedResultCardId]);

  const printReportCard = (card: ReportCard) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      setError('Please allow pop-ups to print or download the official PDF transcript.');
      return;
    }
    const studentName = card.student ? `${card.student.user.firstName} ${card.student.user.lastName}` : 'Official Student Result Card';
    const admissionNo = card.student?.admissionNumber || '—';
    const rollNo = card.student?.rollNumber || '—';
    const sectionName = card.student?.section ? `${card.student.section.classGrade.name} - ${card.student.section.name}` : '—';
    const examName = card.examSession?.name || 'Academic Term Examination';
    const sessionYear = card.examSession?.academicTerm
      ? `${card.examSession.academicTerm.academicYear.name} · ${card.examSession.academicTerm.name}`
      : '';

    const subjectsRows = (card.subjectMarks || [])
      .map(
        (sm) => `
      <tr>
        <td style="padding: 10px; border: 1px solid #cbd5e1; font-family: monospace; font-weight: bold; color: #1e40af;">${escapeHtml(sm.subjectCode)}</td>
        <td style="padding: 10px; border: 1px solid #cbd5e1; font-weight: 600;">${escapeHtml(sm.subjectName)}</td>
        <td style="padding: 10px; border: 1px solid #cbd5e1; text-align: center;">${sm.maxMarks}</td>
        <td style="padding: 10px; border: 1px solid #cbd5e1; text-align: center;">${sm.passMarks}</td>
        <td style="padding: 10px; border: 1px solid #cbd5e1; text-align: center; font-weight: bold;">${sm.isAbsent ? '<span style="color:#dc2626;">Absent</span>' : sm.marksObtained}</td>
        <td style="padding: 10px; border: 1px solid #cbd5e1; text-align: center;">${sm.isAbsent ? '0.0%' : sm.percentage.toFixed(1) + '%'}</td>
        <td style="padding: 10px; border: 1px solid #cbd5e1; text-align: center; font-weight: bold; color: #2563eb;">${escapeHtml(sm.gradeLetter)}</td>
        <td style="padding: 10px; border: 1px solid #cbd5e1; text-align: center; font-weight: bold; color: ${sm.isPassed ? '#16a34a' : '#dc2626'};">${sm.isPassed ? 'PASS' : sm.isAbsent ? 'ABSENT' : 'FAIL'}</td>
      </tr>
    `
      )
      .join('');

    printWindow.document.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Official Academic Result Card - ${escapeHtml(studentName)}</title>
  <style>
    @page { size: A4 portrait; margin: 12mm 15mm; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #0f172a; margin: 0; padding: 24px; background: #fff; }
    .card { max-width: 820px; margin: 0 auto; border: 2px solid #0f172a; border-radius: 8px; padding: 28px; }
    .header { text-align: center; border-bottom: 2px solid #e2e8f0; padding-bottom: 18px; margin-bottom: 20px; }
    .header h1 { margin: 0; font-size: 24px; color: #0f172a; text-transform: uppercase; letter-spacing: 0.5px; }
    .header p { margin: 6px 0 0; font-size: 13px; color: #64748b; }
    .badge-bar { display: inline-block; background: #0f172a; color: #fff; padding: 4px 16px; border-radius: 20px; font-size: 11px; font-weight: 700; text-transform: uppercase; margin-top: 10px; letter-spacing: 0.5px; }
    .info { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 14px; margin-bottom: 20px; font-size: 13px; }
    .info div { display: flex; }
    .info .lbl { width: 140px; color: #64748b; font-weight: 600; text-transform: uppercase; font-size: 11px; }
    .info .val { font-weight: 700; color: #0f172a; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 13px; }
    th { background: #0f172a; color: #fff; font-weight: 600; padding: 9px; text-align: left; border: 1px solid #0f172a; font-size: 11px; text-transform: uppercase; }
    .summary { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 14px; margin-bottom: 20px; text-align: center; }
    .sum-num { font-size: 20px; font-weight: 800; color: #0f172a; margin-top: 2px; }
    .sum-lbl { font-size: 10px; text-transform: uppercase; color: #64748b; font-weight: 700; }
    .footer { margin-top: 28px; padding-top: 16px; border-top: 1px dashed #cbd5e1; font-size: 11px; color: #64748b; display: flex; justify-content: space-between; align-items: flex-end; }
    .signature { font-family: monospace; font-size: 9px; word-break: break-all; max-width: 380px; margin-top: 4px; color: #334155; }
    .sig-line { width: 180px; border-top: 1px solid #0f172a; text-align: center; padding-top: 4px; font-weight: 600; color: #0f172a; }
    @media print { body { padding: 0; } .card { border: none; padding: 0; } }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>Official Student Academic Transcript</h1>
      <p>Certified Performance Record · ${escapeHtml(examName)} ${escapeHtml(sessionYear ? '· ' + sessionYear : '')}</p>
      <div class="badge-bar">Institutional Examination Result</div>
    </div>
    <div class="info">
      <div><span class="lbl">Student Name:</span><span class="val">${escapeHtml(studentName)}</span></div>
      <div><span class="lbl">Admission No:</span><span class="val">${escapeHtml(admissionNo)}</span></div>
      <div><span class="lbl">Class & Section:</span><span class="val">${escapeHtml(sectionName)}</span></div>
      <div><span class="lbl">Roll Number:</span><span class="val">${escapeHtml(rollNo)}</span></div>
    </div>
    <table>
      <thead>
        <tr>
          <th>Subject Code</th>
          <th>Subject Name</th>
          <th style="text-align:center;">Max Marks</th>
          <th style="text-align:center;">Pass Marks</th>
          <th style="text-align:center;">Score</th>
          <th style="text-align:center;">Percentage</th>
          <th style="text-align:center;">Grade</th>
          <th style="text-align:center;">Result</th>
        </tr>
      </thead>
      <tbody>
        ${subjectsRows.length > 0 ? subjectsRows : '<tr><td colspan="8" style="padding:16px;text-align:center;color:#64748b;">No individual subject marks available.</td></tr>'}
      </tbody>
    </table>
    <div class="summary">
      <div><div class="sum-lbl">Total Marks</div><div class="sum-num">${card.totalMarks}</div></div>
      <div><div class="sum-lbl">Percentage</div><div class="sum-num">${card.percentage.toFixed(1)}%</div></div>
      <div><div class="sum-lbl">Letter Grade</div><div class="sum-num" style="color:#2563eb;">${escapeHtml(card.gradeLetter)}</div></div>
      <div><div class="sum-lbl">GPA (0-4.0)</div><div class="sum-num">${card.gpa.toFixed(2)}</div></div>
      <div><div class="sum-lbl">Class Rank</div><div class="sum-num">${card.rank ? '#' + card.rank : '—'}</div></div>
    </div>
    <div class="footer">
      <div>
        <div style="font-weight:700;color:#0f172a;">Digital Cryptographic Signature</div>
        <div class="signature">${escapeHtml(card.verificationSignature || 'Verified Authentic Exam Record')}</div>
      </div>
      <div>
        <div class="sig-line">Controller of Examinations</div>
      </div>
    </div>
  </div>
</body>
</html>`);
    printWindow.document.close();
    printWindow.setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 250);
  };

  const inputClass =
    'mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20';

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-primary-600 bg-primary-50 px-2.5 py-1 rounded-md">
            ACADEMIC ASSESSMENT
          </span>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">Examinations & Results</h1>
          <p className="mt-1 text-sm text-slate-500">
            {isStudentOrParent
              ? 'View official exam schedules, timetables, and download certified academic result cards.'
              : 'Organize exam timetables, record student marks by class section, manage grade change governance, and publish tamper-proof result cards.'}
          </p>
        </div>
      </div>

      {/* Notices & Errors */}
      {notice && (
        <div role="status" className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-800">
          <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600" />
          <span>{notice}</span>
        </div>
      )}
      {error && (
        <div role="alert" className="flex items-center gap-2 rounded-xl bg-rose-50 border border-rose-200 p-4 text-sm text-rose-800">
          <AlertCircle className="w-5 h-5 shrink-0 text-rose-600" />
          <span>{error}</span>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
        <button
          type="button"
          onClick={() => setActiveTab('timetable')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
            activeTab === 'timetable'
              ? 'bg-primary-600 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Calendar className="w-4 h-4" />
          Exam Timetable & Schedule
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('results')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
            activeTab === 'results'
              ? 'bg-primary-600 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Award className="w-4 h-4" />
          {isStudentOrParent ? 'My Result Card' : 'Results & Report Cards'}
        </button>

        {canMark && (
          <button
            type="button"
            onClick={() => setActiveTab('marks')}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
              activeTab === 'marks'
                ? 'bg-primary-600 text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            Teacher Marks Entry
          </button>
        )}

        {(canReview || canChangeGrade) && (
          <button
            type="button"
            onClick={() => setActiveTab('corrections')}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
              activeTab === 'corrections'
                ? 'bg-primary-600 text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <CheckSquare className="w-4 h-4" />
            Grade Corrections
            {changesQuery.data && changesQuery.data.length > 0 && (
              <span className="ml-1 rounded-full bg-amber-500 px-2 py-0.5 text-xs text-white">
                {changesQuery.data.length}
              </span>
            )}
          </button>
        )}

        {canCreate && (
          <button
            type="button"
            onClick={() => setActiveTab('management')}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
              activeTab === 'management'
                ? 'bg-primary-600 text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Settings className="w-4 h-4" />
            Exam Management
          </button>
        )}

        <button
          type="button"
          onClick={() => navigate('/assessments')}
          className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 ml-auto"
        >
          <Layers className="w-4 h-4 text-indigo-600" />
          University Assessments & Schemes →
        </button>
      </div>

      {/* =========================================================================
          TAB 1: EXAM TIMETABLE & SCHEDULE (ALL ROLES)
          ========================================================================= */}
      {activeTab === 'timetable' && (
        <section className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Official Exam Timetable</h2>
              <p className="text-sm text-slate-500">
                View all scheduled exam papers, exam dates, room numbers, and pass criteria.
              </p>
            </div>
            {sessionsQuery.data && sessionsQuery.data.length > 0 && (
              <div className="flex items-center gap-2">
                <label htmlFor="timetable-session-select" className="text-xs font-semibold text-slate-700 whitespace-nowrap">
                  Exam Session:
                </label>
                <select
                  id="timetable-session-select"
                  value={selectedTimetableSessionId}
                  onChange={(e) => setSelectedTimetableSessionId(e.target.value)}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm focus:border-primary-500 focus:outline-none"
                >
                  {sessionsQuery.data.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.academicTerm.academicYear.name})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {sessionsQuery.isLoading && <p className="py-8 text-center text-sm text-slate-500">Loading exam sessions…</p>}
          {sessionsQuery.isError && (
            <div className="rounded-xl bg-rose-50 p-6 text-center text-rose-700 border border-rose-200">
              Could not load exam sessions. Please refresh the page or verify network connectivity.
            </div>
          )}

          {sessionsQuery.data && sessionsQuery.data.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
              <Calendar className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h3 className="text-base font-semibold text-slate-700">No Exam Sessions Scheduled</h3>
              <p className="text-sm text-slate-500 mt-1">
                The Examination Controller has not posted any active examination sessions yet.
              </p>
            </div>
          )}

          {currentTimetableSession && (
            <div className="space-y-4">
              {/* Session Meta Header */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-gradient-to-r from-slate-900 to-slate-800 text-white p-5 rounded-2xl shadow-sm">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-primary-300">
                    {currentTimetableSession.academicTerm.academicYear.name} · {currentTimetableSession.academicTerm.name}
                  </span>
                  <h3 className="text-xl font-bold mt-1">{currentTimetableSession.name}</h3>
                  <p className="text-xs text-slate-300 mt-1 flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5" />
                    Session Duration: {new Date(currentTimetableSession.startDate).toLocaleDateString()} –{' '}
                    {new Date(currentTimetableSession.endDate).toLocaleDateString()}
                  </p>
                </div>
                <span
                  className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${
                    currentTimetableSession.status === 'PUBLISHED'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30'
                      : 'bg-primary-500/20 text-primary-300 border border-primary-400/30'
                  }`}
                >
                  {currentTimetableSession.status}
                </span>
              </div>

              {/* Schedules Table */}
              {currentTimetableSession.schedules.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500">
                  No individual subject papers have been scheduled for this session yet.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <table className="w-full min-w-[700px] text-left text-sm">
                    <thead>
                      <tr className="border-b bg-slate-50/80 text-xs font-semibold uppercase text-slate-500">
                        <th className="px-4 py-3.5">Subject</th>
                        <th className="px-4 py-3.5">Exam Date</th>
                        <th className="px-4 py-3.5">Time</th>
                        <th className="px-4 py-3.5">Hall / Room</th>
                        <th className="px-4 py-3.5 text-center">Marks</th>
                        <th className="px-4 py-3.5 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {currentTimetableSession.schedules.map((sch) => {
                        const examDateObj = new Date(sch.examDate);
                        const isPast = examDateObj < new Date(new Date().setHours(0, 0, 0, 0));
                        return (
                          <tr key={sch.id} className="hover:bg-slate-50/60 transition">
                            <td className="px-4 py-3.5">
                              <span className="font-semibold text-slate-900 block">{sch.subject.name}</span>
                              <span className="text-xs font-mono font-medium text-primary-700">{sch.subject.code}</span>
                            </td>
                            <td className="px-4 py-3.5 font-medium text-slate-800">
                              {examDateObj.toLocaleDateString('en-US', {
                                weekday: 'short',
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              })}
                            </td>
                            <td className="px-4 py-3.5 text-slate-600 font-mono text-xs">
                              {sch.startTime} – {sch.endTime}
                            </td>
                            <td className="px-4 py-3.5 text-slate-700">
                              <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold">
                                <MapPin className="w-3.5 h-3.5 text-slate-500" />
                                {sch.roomNumber || 'Main Auditorium'}
                              </span>
                            </td>
                            <td className="px-4 py-3.5 text-center">
                              <span className="text-xs text-slate-600 font-medium">
                                Max: <strong className="text-slate-900">{sch.maxMarks}</strong> · Pass:{' '}
                                <strong className="text-emerald-700">{sch.passMarks}</strong>
                              </span>
                            </td>
                            <td className="px-4 py-3.5 text-center">
                              <span
                                className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                                  currentTimetableSession.status === 'PUBLISHED'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : isPast
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-blue-100 text-blue-800'
                                }`}
                              >
                                {currentTimetableSession.status === 'PUBLISHED' ? 'Completed' : isPast ? 'Conducted' : 'Scheduled'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* =========================================================================
          TAB 2: RESULTS & TRANSCRIPTS
          ========================================================================= */}
      {activeTab === 'results' && (
        <section className="space-y-6">
          {/* A. STUDENT & PARENT VIEW: PERSONAL CERTIFIED RESULT CARD */}
          {isStudentOrParent ? (
            <div className="space-y-6">
              {reportCardsQuery.isLoading && <p className="py-8 text-center text-sm text-slate-500">Loading your result cards…</p>}

              {reportCardsQuery.data && reportCardsQuery.data.length === 0 && (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
                  <Award className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <h3 className="text-base font-semibold text-slate-800">No Exam Results Published Yet</h3>
                  <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
                    Your official examination marks and GPA report cards will be visible here once the Examination Controller publishes results for your term.
                  </p>
                </div>
              )}

              {activeStudentCard && (
                <div className="space-y-6">
                  {/* Result Session Selector if multiple */}
                  {studentOnlyCards.length > 1 && (
                    <div className="flex items-center gap-2 bg-white p-4 rounded-xl border border-slate-200">
                      <span className="text-xs font-semibold text-slate-700">Select Exam Session:</span>
                      <select
                        value={activeStudentCard.id}
                        onChange={(e) => setSelectedResultCardId(e.target.value)}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold"
                      >
                        {studentOnlyCards.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.examSession.name} ({c.gradeLetter} · {c.percentage.toFixed(1)}%)
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Hero Transcript Summary Card */}
                  <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
                      <div>
                        <span className="text-xs font-semibold uppercase tracking-wider text-primary-600">
                          OFFICIAL ACADEMIC TRANSCRIPT
                        </span>
                        <h2 className="text-xl font-bold text-slate-900 mt-1">{activeStudentCard.examSession.name}</h2>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {activeStudentCard.student
                            ? `${activeStudentCard.student.user.firstName} ${activeStudentCard.student.user.lastName} (Adm: ${activeStudentCard.student.admissionNumber})`
                            : 'Student Result'}
                          {activeStudentCard.student?.section && ` · ${activeStudentCard.student.section.classGrade.name} - ${activeStudentCard.student.section.name}`}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => printReportCard(activeStudentCard)}
                        className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 transition"
                      >
                        <Printer className="w-4 h-4" />
                        Print / Download PDF
                      </button>
                    </div>

                    {/* Score Badges Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 my-6">
                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-center">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Total Marks</span>
                        <p className="text-2xl font-extrabold text-slate-900 mt-1">{activeStudentCard.totalMarks}</p>
                      </div>
                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-center">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Percentage</span>
                        <p className="text-2xl font-extrabold text-primary-600 mt-1">{activeStudentCard.percentage.toFixed(1)}%</p>
                      </div>
                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-center">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Grade Letter</span>
                        <p className="text-2xl font-extrabold text-blue-600 mt-1">{activeStudentCard.gradeLetter}</p>
                      </div>
                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-center">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">GPA</span>
                        <p className="text-2xl font-extrabold text-emerald-600 mt-1">{activeStudentCard.gpa.toFixed(2)}</p>
                      </div>
                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-center">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Class Rank</span>
                        <p className="text-2xl font-extrabold text-amber-600 mt-1">{activeStudentCard.rank ? `#${activeStudentCard.rank}` : '—'}</p>
                      </div>
                    </div>

                    {/* Subject Marks Table */}
                    <div className="overflow-x-auto rounded-xl border border-slate-200">
                      <table className="w-full min-w-[650px] text-left text-sm">
                        <thead>
                          <tr className="border-b bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                            <th className="px-4 py-3">Code</th>
                            <th className="px-4 py-3">Subject Name</th>
                            <th className="px-4 py-3 text-center">Max Marks</th>
                            <th className="px-4 py-3 text-center">Pass Marks</th>
                            <th className="px-4 py-3 text-center">Score</th>
                            <th className="px-4 py-3 text-center">Percentage</th>
                            <th className="px-4 py-3 text-center">Grade</th>
                            <th className="px-4 py-3 text-center">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {(activeStudentCard.subjectMarks || []).map((sm) => (
                            <tr key={sm.id} className="hover:bg-slate-50/60">
                              <td className="px-4 py-3 font-mono text-xs font-bold text-primary-700">{sm.subjectCode}</td>
                              <td className="px-4 py-3 font-semibold text-slate-800">{sm.subjectName}</td>
                              <td className="px-4 py-3 text-center text-slate-600">{sm.maxMarks}</td>
                              <td className="px-4 py-3 text-center text-slate-600">{sm.passMarks}</td>
                              <td className="px-4 py-3 text-center font-bold text-slate-900">
                                {sm.isAbsent ? <span className="text-rose-600">Absent</span> : sm.marksObtained}
                              </td>
                              <td className="px-4 py-3 text-center text-slate-700 font-medium">{sm.percentage.toFixed(1)}%</td>
                              <td className="px-4 py-3 text-center font-bold text-primary-600">{sm.gradeLetter}</td>
                              <td className="px-4 py-3 text-center">
                                <span
                                  className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${
                                    sm.isPassed ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                                  }`}
                                >
                                  {sm.isPassed ? 'PASS' : sm.isAbsent ? 'ABSENT' : 'FAIL'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Cryptographic Signature Footer */}
                    <div className="mt-5 p-3 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-500">
                      <div className="flex items-center gap-1.5 font-semibold text-slate-700">
                        <ShieldCheck className="w-4 h-4 text-emerald-600" />
                        Digital Verification HMAC-SHA256:
                        <span className="font-mono text-[10px] text-slate-500 truncate max-w-xs">
                          {activeStudentCard.verificationSignature || 'Verified Authentic'}
                        </span>
                      </div>
                      <span className="text-slate-400">Official Institutional Transcript</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* B. STAFF / CONTROLLER / ADMIN VIEW */
            <div className="space-y-6">
              {/* Publish Results Control for Controllers */}
              {canPublish && (
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-base font-bold text-slate-900">Publish Exam Session Results</h3>
                      <p className="text-xs text-slate-500">
                        Compiles all marks, calculates GPA & letter grades, ranks students, signs report cards with HMAC-SHA256, and releases them to student portals.
                      </p>
                    </div>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {(sessionsQuery.data ?? []).map((session) => (
                      <div key={session.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold text-slate-800">{session.name}</p>
                          <p className="text-xs text-slate-500">
                            {session.academicTerm.academicYear.name} · {session.academicTerm.name} · {session.schedules.length} Papers Scheduled
                          </p>
                        </div>
                        <div>
                          {session.status === 'PUBLISHED' ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Results Published
                            </span>
                          ) : (
                            <button
                              type="button"
                              disabled={publishMutation.isPending}
                              onClick={() => {
                                if (window.confirm(`Are you ready to publish final results for "${session.name}"? This will compute GPAs and release result cards to all students.`)) {
                                  publishMutation.mutate(session.id);
                                }
                              }}
                              className="rounded-xl bg-primary-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-primary-700 disabled:opacity-50"
                            >
                              Publish Results Now
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Results Browser for Controllers, Admins & Teachers */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-5">
                {/* Header & View Mode Switcher */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      {isTeacher && !isControllerOrAdmin ? 'My Assigned Class & Subject Results' : 'Published Academic Results & Transcripts'}
                    </h3>
                    <p className="text-xs text-slate-500">
                      {isTeacher && !isControllerOrAdmin
                        ? 'View student scores for the subject you teach by section, inspect marks, and export certified transcripts.'
                        : 'Filter by session, class section, or subject, and search easily by roll number, name, or admission number.'}
                    </p>
                  </div>

                  {/* View Mode Switcher Buttons */}
                  <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl self-start md:self-auto">
                    <button
                      type="button"
                      onClick={() => setResultViewMode('transcripts')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                        resultViewMode === 'transcripts'
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <FileText className="w-3.5 h-3.5" />
                      Student Transcripts ({filteredReportCards.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setResultViewMode('subject_marks')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                        resultViewMode === 'subject_marks'
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <BarChart3 className="w-3.5 h-3.5" />
                      Subject Performance Sheet ({filteredSubjectRows.length})
                    </button>
                  </div>
                </div>

                {/* Filter Toolbar */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                  {/* Session Filter */}
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                      Exam Session
                    </label>
                    <select
                      value={resultSessionFilter}
                      onChange={(e) => setResultSessionFilter(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 shadow-sm focus:border-primary-500 focus:outline-none"
                    >
                      <option value="ALL">All Exam Sessions</option>
                      {(sessionsQuery.data ?? []).map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.academicTerm.academicYear.name})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Section Filter */}
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                      Class & Section
                    </label>
                    <select
                      value={resultSectionFilter}
                      onChange={(e) => setResultSectionFilter(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 shadow-sm focus:border-primary-500 focus:outline-none"
                    >
                      <option value="ALL">All Classes & Sections ({availableSections.length})</option>
                      {availableSections.map((sec) => (
                        <option key={sec.id} value={sec.id}>
                          {sec.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Subject Filter (Active in Subject Sheet or for general subject filtering) */}
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                      Subject
                    </label>
                    <select
                      value={resultSubjectFilter}
                      onChange={(e) => setResultSubjectFilter(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 shadow-sm focus:border-primary-500 focus:outline-none"
                    >
                      <option value="ALL">All Subjects ({availableSubjects.length})</option>
                      {availableSubjects.map((sub) => (
                        <option key={sub.id} value={sub.id}>
                          {sub.name} ({sub.code})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Smart Search Input */}
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                      Search Roll No / Name
                    </label>
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
                      <input
                        type="text"
                        placeholder="Search roll no, name, admission..."
                        value={resultSearch}
                        onChange={(e) => setResultSearch(e.target.value)}
                        className="w-full pl-8 pr-7 py-1.5 text-xs rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                      />
                      {resultSearch && (
                        <button
                          type="button"
                          onClick={() => setResultSearch('')}
                          className="absolute right-2 top-2 text-slate-400 hover:text-slate-600"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* KPI Metrics Summary Strip */}
                {filteredReportCards.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-center">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Students Shown</span>
                      <p className="text-lg font-extrabold text-slate-900 mt-0.5">{filteredReportCards.length}</p>
                    </div>
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-center">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Class Average</span>
                      <p className="text-lg font-extrabold text-primary-600 mt-0.5">
                        {(
                          filteredReportCards.reduce((acc, c) => acc + c.percentage, 0) /
                          (filteredReportCards.length || 1)
                        ).toFixed(1)}%
                      </p>
                    </div>
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-center">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Average GPA</span>
                      <p className="text-lg font-extrabold text-emerald-600 mt-0.5">
                        {(
                          filteredReportCards.reduce((acc, c) => acc + c.gpa, 0) /
                          (filteredReportCards.length || 1)
                        ).toFixed(2)}
                      </p>
                    </div>
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-center">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Passing Rate</span>
                      <p className="text-lg font-extrabold text-blue-600 mt-0.5">
                        {(
                          (filteredReportCards.filter((c) => c.gradeLetter !== 'F').length /
                            (filteredReportCards.length || 1)) *
                          100
                        ).toFixed(1)}%
                      </p>
                    </div>
                  </div>
                )}

                {reportCardsQuery.isLoading && <p className="py-6 text-center text-sm text-slate-500">Loading published cards…</p>}

                {/* A. Overall Transcripts View */}
                {resultViewMode === 'transcripts' && (
                  <>
                    {filteredReportCards.length === 0 ? (
                      <div className="py-10 text-center text-sm text-slate-500 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                        <Filter className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                        <p className="font-semibold text-slate-700">No matching student result cards</p>
                        <p className="text-xs text-slate-400 mt-1">
                          Try adjusting your session filter, section filter, or search query.
                        </p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto rounded-xl border border-slate-200">
                        <table className="w-full min-w-[760px] text-left text-sm">
                          <thead>
                            <tr className="border-b bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                              <th className="px-3.5 py-3 text-center">Roll No</th>
                              <th className="px-3.5 py-3">Student Name</th>
                              <th className="px-3.5 py-3">Class & Section</th>
                              <th className="px-3.5 py-3">Session</th>
                              <th className="px-3.5 py-3 text-center">Score</th>
                              <th className="px-3.5 py-3 text-center">%</th>
                              <th className="px-3.5 py-3 text-center">Grade</th>
                              <th className="px-3.5 py-3 text-center">GPA</th>
                              <th className="px-3.5 py-3 text-center">Rank</th>
                              <th className="px-3.5 py-3 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {filteredReportCards.map((card) => {
                              const isExpanded = expandedCardId === card.id;
                              return (
                                <React.Fragment key={card.id}>
                                  <tr className="hover:bg-slate-50/70 transition">
                                    <td className="px-3.5 py-3 text-center">
                                      <span className="inline-block font-mono font-bold bg-slate-100 px-2 py-0.5 rounded text-xs text-slate-800">
                                        {card.student?.rollNumber || '—'}
                                      </span>
                                    </td>
                                    <td className="px-3.5 py-3">
                                      <span className="font-semibold text-slate-900 block">
                                        {card.student ? `${card.student.user.firstName} ${card.student.user.lastName}` : 'Student'}
                                      </span>
                                      <span className="text-[11px] font-mono text-slate-400">
                                        Adm: {card.student?.admissionNumber}
                                      </span>
                                    </td>
                                    <td className="px-3.5 py-3 text-xs text-slate-600">
                                      {card.student?.section
                                        ? `${card.student.section.classGrade.name} - ${card.student.section.name}`
                                        : '—'}
                                    </td>
                                    <td className="px-3.5 py-3 text-xs font-medium text-slate-700">{card.examSession.name}</td>
                                    <td className="px-3.5 py-3 text-center font-bold text-slate-900">{card.totalMarks}</td>
                                    <td className="px-3.5 py-3 text-center font-semibold text-slate-800">{card.percentage.toFixed(1)}%</td>
                                    <td className="px-3.5 py-3 text-center font-bold text-blue-600">{card.gradeLetter}</td>
                                    <td className="px-3.5 py-3 text-center font-medium text-emerald-600">{card.gpa.toFixed(2)}</td>
                                    <td className="px-3.5 py-3 text-center text-slate-600 font-semibold">{card.rank ? `#${card.rank}` : '—'}</td>
                                    <td className="px-3.5 py-3 text-right">
                                      <div className="flex items-center justify-end gap-1.5">
                                        <button
                                          type="button"
                                          onClick={() => setExpandedCardId(isExpanded ? null : card.id)}
                                          className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-semibold shadow-sm transition ${
                                            isExpanded
                                              ? 'border-primary-500 bg-primary-50 text-primary-700'
                                              : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                                          }`}
                                        >
                                          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                          Details
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => printReportCard(card)}
                                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                                        >
                                          <Printer className="w-3.5 h-3.5 text-slate-500" />
                                          Print
                                        </button>
                                      </div>
                                    </td>
                                  </tr>

                                  {/* Inline Expanded Subject Breakdown */}
                                  {isExpanded && (
                                    <tr className="bg-slate-50/80">
                                      <td colSpan={10} className="px-4 py-3">
                                        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-inner space-y-2">
                                          <div className="flex items-center justify-between text-xs font-semibold text-slate-700 border-b border-slate-100 pb-2">
                                            <span>Subject Score Breakdown for {card.student?.user.firstName} {card.student?.user.lastName}</span>
                                            <span className="text-[11px] font-mono text-slate-400">HMAC: {card.verificationSignature?.slice(0, 16)}…</span>
                                          </div>
                                          <table className="w-full text-xs text-left">
                                            <thead>
                                              <tr className="text-slate-400 font-semibold uppercase text-[10px]">
                                                <th className="py-1">Code</th>
                                                <th className="py-1">Subject</th>
                                                <th className="py-1 text-center">Max Marks</th>
                                                <th className="py-1 text-center">Pass Marks</th>
                                                <th className="py-1 text-center">Score</th>
                                                <th className="py-1 text-center">%</th>
                                                <th className="py-1 text-center">Grade</th>
                                                <th className="py-1 text-center">Status</th>
                                              </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                              {(card.subjectMarks || []).map((sm) => (
                                                <tr key={sm.id}>
                                                  <td className="py-1.5 font-mono font-bold text-primary-700">{sm.subjectCode}</td>
                                                  <td className="py-1.5 font-medium text-slate-800">{sm.subjectName}</td>
                                                  <td className="py-1.5 text-center text-slate-600">{sm.maxMarks}</td>
                                                  <td className="py-1.5 text-center text-slate-600">{sm.passMarks}</td>
                                                  <td className="py-1.5 text-center font-bold text-slate-900">
                                                    {sm.isAbsent ? <span className="text-rose-600">Absent</span> : sm.marksObtained}
                                                  </td>
                                                  <td className="py-1.5 text-center font-medium text-slate-700">{sm.percentage.toFixed(1)}%</td>
                                                  <td className="py-1.5 text-center font-bold text-blue-600">{sm.gradeLetter}</td>
                                                  <td className="py-1.5 text-center">
                                                    <span
                                                      className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                                        sm.isPassed ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                                                      }`}
                                                    >
                                                      {sm.isPassed ? 'PASS' : sm.isAbsent ? 'ABSENT' : 'FAIL'}
                                                    </span>
                                                  </td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                </React.Fragment>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                )}

                {/* B. Teacher Subject Performance Sheet View */}
                {resultViewMode === 'subject_marks' && (
                  <>
                    {filteredSubjectRows.length === 0 ? (
                      <div className="py-10 text-center text-sm text-slate-500 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                        <BarChart3 className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                        <p className="font-semibold text-slate-700">No subject marks records found</p>
                        <p className="text-xs text-slate-400 mt-1">
                          Select a different subject or class section from the filter bar above.
                        </p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto rounded-xl border border-slate-200">
                        <table className="w-full min-w-[760px] text-left text-sm">
                          <thead>
                            <tr className="border-b bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                              <th className="px-3.5 py-3 text-center">Roll No</th>
                              <th className="px-3.5 py-3">Student Name</th>
                              <th className="px-3.5 py-3">Class & Section</th>
                              <th className="px-3.5 py-3">Subject</th>
                              <th className="px-3.5 py-3 text-center">Score</th>
                              <th className="px-3.5 py-3 text-center">%</th>
                              <th className="px-3.5 py-3 text-center">Subject Grade</th>
                              <th className="px-3.5 py-3 text-center">Status</th>
                              <th className="px-3.5 py-3 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {filteredSubjectRows.map((row, idx) => (
                              <tr key={`${row.cardId}_${row.subjectId}_${idx}`} className="hover:bg-slate-50/70 transition">
                                <td className="px-3.5 py-3 text-center">
                                  <span className="inline-block font-mono font-bold bg-slate-100 px-2 py-0.5 rounded text-xs text-slate-800">
                                    {row.rollNumber}
                                  </span>
                                </td>
                                <td className="px-3.5 py-3 font-semibold text-slate-900">
                                  {row.studentName}
                                  <span className="block text-[11px] font-mono font-normal text-slate-400">
                                    Adm: {row.admissionNumber}
                                  </span>
                                </td>
                                <td className="px-3.5 py-3 text-xs text-slate-600">
                                  {row.className} - {row.sectionName}
                                </td>
                                <td className="px-3.5 py-3">
                                  <span className="font-semibold text-slate-800 block text-xs">{row.subjectName}</span>
                                  <span className="text-[10px] font-mono text-primary-700">{row.subjectCode}</span>
                                </td>
                                <td className="px-3.5 py-3 text-center font-bold text-slate-900">
                                  {row.isAbsent ? <span className="text-rose-600">Absent</span> : `${row.marksObtained} / ${row.maxMarks}`}
                                </td>
                                <td className="px-3.5 py-3 text-center font-medium text-slate-700">
                                  {row.isAbsent ? '0.0%' : `${row.percentage.toFixed(1)}%`}
                                </td>
                                <td className="px-3.5 py-3 text-center font-bold text-blue-600">{row.gradeLetter}</td>
                                <td className="px-3.5 py-3 text-center">
                                  <span
                                    className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${
                                      row.isPassed
                                        ? 'bg-emerald-100 text-emerald-800'
                                        : row.isAbsent
                                        ? 'bg-amber-100 text-amber-800'
                                        : 'bg-rose-100 text-rose-800'
                                    }`}
                                  >
                                    {row.isPassed ? 'PASS' : row.isAbsent ? 'ABSENT' : 'FAIL'}
                                  </span>
                                </td>
                                <td className="px-3.5 py-3 text-right">
                                  <button
                                    type="button"
                                    onClick={() => printReportCard(row.rawCard)}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                                  >
                                    <Printer className="w-3.5 h-3.5 text-slate-500" />
                                    Print Transcript
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      {/* =========================================================================
          TAB 3: TEACHER MARKS ENTRY (FOR TEACHERS & CONTROLLERS)
          ========================================================================= */}
      {activeTab === 'marks' && canMark && (
        <section className="space-y-6">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Student Marks Entry</h2>
                <p className="text-sm text-slate-500">
                  Select your exam schedule paper and filter by assigned class section to enter student marks.
                </p>
              </div>

              {/* Selectors */}
              <div className="flex flex-wrap items-center gap-3">
                <label className="text-xs font-semibold text-slate-700">
                  Exam Schedule:
                  <select
                    value={scheduleId}
                    onChange={(e) => setScheduleId(e.target.value)}
                    className="mt-1 block min-w-56 rounded-xl border border-slate-300 bg-white p-2 text-sm font-semibold text-slate-800 shadow-sm"
                  >
                    {(sessionsQuery.data ?? []).flatMap((s) =>
                      s.schedules.map((sch) => (
                        <option key={sch.id} value={sch.id}>
                          {s.name} · {sch.subject.name} ({new Date(sch.examDate).toLocaleDateString()})
                        </option>
                      ))
                    )}
                  </select>
                </label>

                {rosterQuery.data?.sections && rosterQuery.data.sections.length > 0 && (
                  <label className="text-xs font-semibold text-slate-700">
                    Section Filter:
                    <select
                      value={sectionFilter}
                      onChange={(e) => setSectionFilter(e.target.value)}
                      className="mt-1 block min-w-44 rounded-xl border border-slate-300 bg-white p-2 text-sm font-semibold text-slate-800 shadow-sm"
                    >
                      <option value="ALL">All Assigned Sections ({rosterQuery.data.students.length})</option>
                      {rosterQuery.data.sections.map((sec) => (
                        <option key={sec.id} value={sec.id}>
                          {sec.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            </div>

            {/* Quick CSV Toggle */}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setShowCsvImport(!showCsvImport)}
                className="text-xs font-semibold text-primary-600 hover:text-primary-700 flex items-center gap-1.5"
              >
                <Upload className="w-3.5 h-3.5" />
                {showCsvImport ? 'Hide Batch CSV Tool' : 'Batch Upload via CSV'}
              </button>
            </div>

            {showCsvImport && (
              <div className="rounded-xl bg-slate-50 p-4 border border-slate-200 space-y-2">
                <label className="block text-xs font-semibold text-slate-700">
                  CSV Format: <code className="bg-white px-1.5 py-0.5 rounded border font-mono">admissionNumber,marksObtained,isAbsent</code>
                  <textarea
                    value={csvText}
                    onChange={(e) => setCsvText(e.target.value)}
                    placeholder={'admissionNumber,marksObtained,isAbsent\nADM-2026-001,85,false\nADM-2026-002,0,true'}
                    rows={3}
                    className="mt-1.5 block w-full rounded-lg border border-slate-300 p-2 font-mono text-xs bg-white"
                  />
                </label>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={importCsv}
                    disabled={!csvText.trim()}
                    className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-sm disabled:opacity-50"
                  >
                    Apply CSV Data
                  </button>
                </div>
              </div>
            )}

            {/* Roster Table */}
            {rosterQuery.isLoading && <p className="py-8 text-center text-sm text-slate-500">Loading student roster…</p>}
            {rosterQuery.isError && <p className="py-4 text-center text-sm text-rose-700">Could not load the student marks roster.</p>}

            {rosterQuery.data && (
              <>
                {filteredStudents.length === 0 ? (
                  <p className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">
                    No active students found for the selected section.
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full min-w-[750px] text-left text-sm">
                      <thead>
                        <tr className="border-b bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                          <th className="px-4 py-3">Student Name</th>
                          <th className="px-4 py-3">Admission No</th>
                          <th className="px-4 py-3">Class & Section</th>
                          <th className="px-4 py-3 text-center">Absent</th>
                          <th className="px-4 py-3">Marks / {rosterQuery.data.schedule.maxMarks}</th>
                          <th className="px-4 py-3">Correction Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredStudents.map((student) => (
                          <tr key={student.id} className="hover:bg-slate-50/70">
                            <td className="px-4 py-3 font-semibold text-slate-900">
                              {student.user.firstName} {student.user.lastName}
                              {student.rollNumber && <span className="block text-xs font-normal text-slate-400">Roll: {student.rollNumber}</span>}
                            </td>
                            <td className="px-4 py-3 font-mono text-xs text-slate-600">{student.admissionNumber}</td>
                            <td className="px-4 py-3">
                              <span className="inline-block rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                                {student.section ? `${student.section.classGrade.name} - ${student.section.name}` : 'Enrolled'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              {student.mark ? (
                                student.mark.isAbsent ? (
                                  <span className="font-bold text-rose-600 text-xs">Absent</span>
                                ) : (
                                  <span className="text-xs text-slate-400">Present</span>
                                )
                              ) : (
                                <input
                                  type="checkbox"
                                  aria-label={`Absent toggle for ${student.user.firstName}`}
                                  checked={absentDrafts[student.id] ?? false}
                                  onChange={(e) => setAbsentDrafts((v) => ({ ...v, [student.id]: e.target.checked }))}
                                  className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500"
                                />
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {student.mark ? (
                                <span className="font-bold text-slate-900">
                                  {student.mark.isAbsent ? '0 (Absent)' : student.mark.marksObtained}
                                </span>
                              ) : (
                                <input
                                  aria-label={`Marks for ${student.user.firstName}`}
                                  type="number"
                                  min="0"
                                  max={rosterQuery.data!.schedule.maxMarks}
                                  disabled={absentDrafts[student.id]}
                                  value={absentDrafts[student.id] ? 0 : marks[student.id] ?? 0}
                                  onChange={(e) => setMarks((v) => ({ ...v, [student.id]: Number(e.target.value) }))}
                                  className="w-24 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold disabled:bg-slate-100"
                                />
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {student.mark && canChangeGrade ? (
                                <div className="flex min-w-64 gap-2">
                                  <input
                                    aria-label="Proposed marks"
                                    type="number"
                                    min="0"
                                    max={rosterQuery.data.schedule.maxMarks}
                                    value={gradeDrafts[student.id]?.proposedMarks ?? student.mark.marksObtained}
                                    onChange={(e) =>
                                      setGradeDrafts((v) => ({
                                        ...v,
                                        [student.id]: {
                                          proposedMarks: Number(e.target.value),
                                          reason: v[student.id]?.reason ?? '',
                                        },
                                      }))
                                    }
                                    className="w-18 rounded-lg border border-slate-300 px-2 py-1 text-xs"
                                  />
                                  <input
                                    aria-label="Grade change reason"
                                    placeholder="Correction reason..."
                                    value={gradeDrafts[student.id]?.reason ?? ''}
                                    onChange={(e) =>
                                      setGradeDrafts((v) => ({
                                        ...v,
                                        [student.id]: {
                                          proposedMarks: v[student.id]?.proposedMarks ?? student.mark!.marksObtained,
                                          reason: e.target.value,
                                        },
                                      }))
                                    }
                                    className="min-w-28 flex-1 rounded-lg border border-slate-300 px-2 py-1 text-xs"
                                  />
                                  <button
                                    type="button"
                                    disabled={
                                      gradeMutation.isPending || (gradeDrafts[student.id]?.reason.trim().length ?? 0) < 5
                                    }
                                    onClick={() =>
                                      gradeMutation.mutate({
                                        markId: student.mark!.id,
                                        proposedMarks: gradeDrafts[student.id]?.proposedMarks ?? student.mark!.marksObtained,
                                        reason: gradeDrafts[student.id]?.reason ?? '',
                                      })
                                    }
                                    className="rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-40"
                                  >
                                    Request
                                  </button>
                                </div>
                              ) : student.mark ? (
                                <span className="text-xs text-slate-400">Recorded</span>
                              ) : (
                                <span className="text-xs text-amber-600 font-medium">Pending Entry</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {filteredStudents.some((s) => !s.mark) && (
                  <div className="flex justify-end pt-2">
                    <button
                      type="button"
                      disabled={marksMutation.isPending || rosterQuery.data.schedule.examSession.status === 'PUBLISHED'}
                      onClick={() => marksMutation.mutate()}
                      className="rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 disabled:opacity-50"
                    >
                      Submit Unentered Marks
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      )}

      {/* =========================================================================
          TAB 4: GRADE CORRECTIONS (MAKER-CHECKER)
          ========================================================================= */}
      {activeTab === 'corrections' && (canReview || canChangeGrade) && (
        <section className="space-y-6">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Maker-Checker Grade Change Approvals</h2>
              <p className="text-sm text-slate-500">
                To prevent unauthorized grade manipulation, once marks are submitted they cannot be edited directly. Teachers submit correction requests with reasons, which must be approved by the Exam Controller or HOD.
              </p>
            </div>

            {changesQuery.isLoading && <p className="py-6 text-center text-sm text-slate-500">Loading pending requests…</p>}
            {changesQuery.data && changesQuery.data.length === 0 && (
              <div className="rounded-xl bg-slate-50 p-8 text-center text-slate-500">
                <CheckSquare className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm font-medium">No grade change requests are currently pending review.</p>
              </div>
            )}

            {changesQuery.data && changesQuery.data.length > 0 && (
              <div className="divide-y divide-slate-100">
                {changesQuery.data.map((change) => (
                  <div key={change.id} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900">
                          {change.examMark.student.user.firstName} {change.examMark.student.user.lastName}
                        </span>
                        <span className="text-xs font-mono text-slate-400">({change.examMark.student.admissionNumber})</span>
                      </div>
                      <p className="text-xs text-slate-600 mt-1">
                        <strong>{change.examMark.examSchedule.examSession.name}</strong> · {change.examMark.examSchedule.subject.name}
                      </p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="px-2 py-0.5 rounded text-xs font-bold bg-slate-100 text-slate-700">
                          Original: {change.originalMarks}
                        </span>
                        <span className="text-xs text-slate-400">→</span>
                        <span className="px-2 py-0.5 rounded text-xs font-bold bg-primary-100 text-primary-800">
                          Proposed: {change.proposedMarks}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 italic mt-1.5">Reason: "{change.reason}"</p>
                    </div>

                    {canReview && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={reviewMutation.isPending}
                          onClick={() => reviewMutation.mutate({ id: change.id, status: 'REJECTED' })}
                          className="rounded-xl border border-rose-300 px-3.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                        >
                          Reject
                        </button>
                        <button
                          type="button"
                          disabled={reviewMutation.isPending}
                          onClick={() => reviewMutation.mutate({ id: change.id, status: 'APPROVED' })}
                          className="rounded-xl bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700"
                        >
                          Approve Change
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* =========================================================================
          TAB 5: EXAM MANAGEMENT (EXAM CONTROLLER & ADMINS ONLY)
          ========================================================================= */}
      {activeTab === 'management' && canCreate && (
        <section className="space-y-6">
          {/* Creation Forms Grid */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* 1. Create Exam Session */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                sessionMutation.mutate();
              }}
              className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4"
            >
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <PlusCircle className="w-4 h-4 text-primary-600" />
                Create New Exam Session
              </h3>
              <label className="text-xs font-semibold text-slate-700">
                Academic Term
                <select
                  required
                  value={sessionForm.academicTermId}
                  onChange={(e) => setSessionForm({ ...sessionForm, academicTermId: e.target.value })}
                  className={inputClass}
                >
                  {termOptions.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-xs font-semibold text-slate-700">
                Session Name (e.g. Midterm Examinations 2026)
                <input
                  required
                  minLength={2}
                  maxLength={120}
                  value={sessionForm.name}
                  onChange={(e) => setSessionForm({ ...sessionForm, name: e.target.value })}
                  className={inputClass}
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs font-semibold text-slate-700">
                  Start Date
                  <input
                    required
                    type="date"
                    value={sessionForm.startDate}
                    onChange={(e) => setSessionForm({ ...sessionForm, startDate: e.target.value })}
                    className={inputClass}
                  />
                </label>
                <label className="text-xs font-semibold text-slate-700">
                  End Date
                  <input
                    required
                    type="date"
                    value={sessionForm.endDate}
                    onChange={(e) => setSessionForm({ ...sessionForm, endDate: e.target.value })}
                    className={inputClass}
                  />
                </label>
              </div>

              <button
                type="submit"
                disabled={sessionMutation.isPending || !sessionForm.academicTermId}
                className="w-full rounded-xl bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 disabled:opacity-50"
              >
                Create Exam Session
              </button>
            </form>

            {/* 2. Add Subject Schedule */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                scheduleMutation.mutate();
              }}
              className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4"
            >
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-primary-600" />
                Schedule Subject Exam Paper
              </h3>

              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs font-semibold text-slate-700">
                  Exam Session
                  <select
                    required
                    value={scheduleForm.examSessionId}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, examSessionId: e.target.value })}
                    className={inputClass}
                  >
                    {(sessionsQuery.data ?? []).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-xs font-semibold text-slate-700">
                  Subject
                  <select
                    required
                    value={scheduleForm.subjectId}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, subjectId: e.target.value })}
                    className={inputClass}
                  >
                    {(subjectsQuery.data ?? []).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.code} · {s.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <label className="text-xs font-semibold text-slate-700">
                  Date
                  <input
                    required
                    type="date"
                    value={scheduleForm.examDate}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, examDate: e.target.value })}
                    className={inputClass}
                  />
                </label>
                <label className="text-xs font-semibold text-slate-700">
                  Start Time
                  <input
                    required
                    type="time"
                    value={scheduleForm.startTime}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, startTime: e.target.value })}
                    className={inputClass}
                  />
                </label>
                <label className="text-xs font-semibold text-slate-700">
                  End Time
                  <input
                    required
                    type="time"
                    value={scheduleForm.endTime}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, endTime: e.target.value })}
                    className={inputClass}
                  />
                </label>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <label className="text-xs font-semibold text-slate-700">
                  Max Marks
                  <input
                    required
                    type="number"
                    min="1"
                    value={scheduleForm.maxMarks}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, maxMarks: Number(e.target.value) })}
                    className={inputClass}
                  />
                </label>
                <label className="text-xs font-semibold text-slate-700">
                  Pass Marks
                  <input
                    required
                    type="number"
                    min="1"
                    value={scheduleForm.passMarks}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, passMarks: Number(e.target.value) })}
                    className={inputClass}
                  />
                </label>
                <label className="text-xs font-semibold text-slate-700">
                  Room
                  <input
                    maxLength={40}
                    placeholder="e.g. 101"
                    value={scheduleForm.roomNumber}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, roomNumber: e.target.value })}
                    className={inputClass}
                  />
                </label>
              </div>

              <button
                type="submit"
                disabled={scheduleMutation.isPending || !scheduleForm.examSessionId || !scheduleForm.subjectId}
                className="w-full rounded-xl bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 disabled:opacity-50"
              >
                Add Schedule to Timetable
              </button>
            </form>
          </div>

          {/* 3. Assign Invigilators */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Invigilator Hall Roster</h3>
                <p className="text-xs text-slate-500">
                  Assign active staff members as exam invigilators. The system automatically detects and prevents double-booking conflicts across overlapping times.
                </p>
              </div>
              <label className="text-xs font-semibold text-slate-700">
                Exam Paper:
                <select
                  value={scheduleId}
                  onChange={(e) => setScheduleId(e.target.value)}
                  className="ml-2 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold"
                >
                  {(sessionsQuery.data ?? []).flatMap((s) =>
                    s.schedules.map((sch) => (
                      <option key={sch.id} value={sch.id}>
                        {s.name} · {sch.subject.name}
                      </option>
                    ))
                  )}
                </select>
              </label>
            </div>

            {invigilatorCandidatesQuery.isLoading || assignedInvigilatorsQuery.isLoading ? (
              <p className="py-4 text-center text-xs text-slate-500">Loading staff candidates…</p>
            ) : !invigilatorCandidatesQuery.data?.length ? (
              <p className="py-4 text-center text-xs text-slate-500">No active staff candidates available.</p>
            ) : (
              <div className="space-y-3">
                <div className="grid gap-2 sm:grid-cols-3 max-h-56 overflow-y-auto p-1">
                  {invigilatorCandidatesQuery.data.map(({ user: staff, employeeCode }) => (
                    <label key={staff.id} className="flex items-center gap-2 rounded-xl border border-slate-200 p-2.5 text-xs hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={selectedInvigilators.includes(staff.id)}
                        onChange={(e) =>
                          setSelectedInvigilators((ids) =>
                            e.target.checked ? [...ids, staff.id] : ids.filter((id) => id !== staff.id)
                          )
                        }
                      />
                      <span className="font-semibold text-slate-800">
                        {staff.firstName} {staff.lastName}
                        {employeeCode ? ` · ${employeeCode}` : ''}
                      </span>
                    </label>
                  ))}
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={invigilatorsMutation.isPending || !scheduleId}
                    onClick={() => invigilatorsMutation.mutate()}
                    className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50"
                  >
                    Save Invigilator Assignments ({selectedInvigilators.length})
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 4. Grading Scale Configuration */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Institution Grading Scale</h3>
                <p className="text-xs text-slate-500">
                  Percentage thresholds map to letter grades and GPA for term results. Published result cards remain immutable.
                </p>
              </div>
              {gradingScaleQuery.data && (
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
                  {gradingScaleQuery.data.source === 'default' ? 'Standard Default Scale' : 'Custom Institution Scale'}
                </span>
              )}
            </div>

            <div className="space-y-2">
              {gradeBands.map((band, index) => (
                <div key={`${index}-${band.gradeLetter}`} className="grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-2">
                  <label className="text-xs font-medium text-slate-700">
                    Minimum %
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={band.minimumPercentage}
                      onChange={(e) =>
                        setGradeBands((rows) =>
                          rows.map((row, i) => (i === index ? { ...row, minimumPercentage: Number(e.target.value) } : row))
                        )
                      }
                      className={inputClass}
                    />
                  </label>
                  <label className="text-xs font-medium text-slate-700">
                    Grade Letter
                    <input
                      maxLength={8}
                      value={band.gradeLetter}
                      onChange={(e) =>
                        setGradeBands((rows) =>
                          rows.map((row, i) => (i === index ? { ...row, gradeLetter: e.target.value.toUpperCase() } : row))
                        )
                      }
                      className={inputClass}
                    />
                  </label>
                  <label className="text-xs font-medium text-slate-700">
                    GPA (0–4.0)
                    <input
                      type="number"
                      min="0"
                      max="4"
                      step="0.01"
                      value={band.gpa}
                      onChange={(e) =>
                        setGradeBands((rows) =>
                          rows.map((row, i) => (i === index ? { ...row, gpa: Number(e.target.value) } : row))
                        )
                      }
                      className={inputClass}
                    />
                  </label>
                  <button
                    type="button"
                    disabled={gradeBands.length <= 2}
                    onClick={() => setGradeBands((rows) => rows.filter((_, i) => i !== index))}
                    className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-40"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <button
                type="button"
                onClick={() => setGradeBands((rows) => [...rows, { minimumPercentage: 0, gradeLetter: '', gpa: 0 }])}
                disabled={gradeBands.length >= 20}
                className="rounded-xl border border-slate-300 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Add Grade Band
              </button>
              <button
                type="button"
                onClick={() => gradingScaleMutation.mutate()}
                disabled={gradingScaleMutation.isPending || gradeBands.length < 2}
                className="rounded-xl bg-primary-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-primary-700 disabled:opacity-50"
              >
                Save Grading Scale
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
};
