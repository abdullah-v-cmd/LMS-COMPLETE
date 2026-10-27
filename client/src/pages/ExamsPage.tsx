import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';

type Schedule = { id: string; subjectId: string; subject: { id: string; name: string; code: string }; examDate: string; startTime: string; endTime: string; maxMarks: number; passMarks: number; roomNumber: string | null };
type Session = { id: string; name: string; academicTermId: string; startDate: string; endDate: string; status: string; schedules: Schedule[]; academicTerm: { name: string; academicYear: { name: string } } };
type SubjectMark = { id: string; subjectId: string; subjectName: string; subjectCode: string; maxMarks: number; passMarks: number; marksObtained: number; percentage: number; isAbsent: boolean; isPassed: boolean; gradeLetter: string; remarks: string | null };
type StudentRow = { id: string; admissionNumber: string; rollNumber: string | null; sectionId: string; section?: { id: string; name: string; classGrade: { id: string; name: string; level: number } }; user: { firstName: string; lastName: string }; mark: { id: string; marksObtained: number; isAbsent: boolean; remarks: string | null } | null };
type GradeChange = { id: string; proposedMarks: number; originalMarks: number; reason: string; examMark: { student: { admissionNumber: string; user: { firstName: string; lastName: string } }; examSchedule: { subject: { name: string }; examSession: { name: string } } } };
type AcademicYear = { id: string; name: string; terms: { id: string; name: string }[] };
type Subject = { id: string; name: string; code: string };
type ReportCard = { id: string; percentage: number; gradeLetter: string; gpa: number; rank: number | null; totalMarks: number; verificationSignature: string | null; examSession: { name: string; academicTerm?: { name: string; academicYear: { name: string } } }; student?: { admissionNumber: string; rollNumber?: string | null; user: { firstName: string; lastName: string; email?: string }; section?: { name: string; classGrade: { name: string } } }; subjectMarks?: SubjectMark[] };
type Invigilator = { user: { id: string; firstName: string; lastName: string; role: string; teacherProfile?: { employeeCode: string | null } | null } };
type GradeBand = { minimumPercentage: number; gradeLetter: string; gpa: number };
type SectionOption = { id: string; name: string; className: string; label: string };
const errorText = (e: unknown) => axios.isAxiosError(e) ? e.response?.data?.error?.message ?? 'The request could not be completed.' : 'The request could not be completed.';
const localDate = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

export const ExamsPage: React.FC = () => {
  const { user, hasPermission } = useAuth();
  const cache = useQueryClient();
  const canCreate = hasPermission('exam:create');
  const canMark = hasPermission('exam:marks:entry');
  const canChangeGrade = hasPermission('grade:update');
  const canReview = hasPermission('grade:approve');
  const canPublish = hasPermission('result:release');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [sessionForm, setSessionForm] = useState({ academicTermId: '', name: '', startDate: localDate(), endDate: localDate() });
  const [scheduleForm, setScheduleForm] = useState({ examSessionId: '', subjectId: '', examDate: localDate(), startTime: '09:00', endTime: '12:00', maxMarks: 100, passMarks: 40, roomNumber: '' });
  const [scheduleId, setScheduleId] = useState('');
  const [sectionFilter, setSectionFilter] = useState('ALL');
  const [previewCard, setPreviewCard] = useState<ReportCard | null>(null);
  const [marks, setMarks] = useState<Record<string, number>>({});
  const [absentDrafts, setAbsentDrafts] = useState<Record<string, boolean>>({});
  const [csvText, setCsvText] = useState('');
  const [gradeDrafts, setGradeDrafts] = useState<Record<string, { proposedMarks: number; reason: string }>>({});
  const [selectedInvigilators, setSelectedInvigilators] = useState<string[]>([]);
  const [gradeBands, setGradeBands] = useState<GradeBand[]>([]);

  const sessionsQuery = useQuery({ queryKey: ['exam-sessions'], queryFn: async () => (await apiClient.get('/exams/sessions')).data.data as Session[] });
  const yearsQuery = useQuery({ queryKey: ['academic-years'], queryFn: async () => (await apiClient.get('/academic/years')).data.data as AcademicYear[], enabled: canCreate });
  const subjectsQuery = useQuery({ queryKey: ['academic-subjects'], queryFn: async () => (await apiClient.get('/academic/subjects')).data.data as Subject[], enabled: canCreate });
  const reportCardsQuery = useQuery({ queryKey: ['report-cards'], queryFn: async () => (await apiClient.get('/exams/report-cards')).data.data as ReportCard[] });
  const gradingScaleQuery = useQuery({ queryKey: ['exam-grading-scale'], queryFn: async () => (await apiClient.get('/exams/grading-scale')).data.data as { source: string; bands: GradeBand[] }, enabled: canCreate });
  const invigilatorCandidatesQuery = useQuery({ queryKey: ['invigilator-candidates'], queryFn: async () => (await apiClient.get('/exams/invigilators/candidates')).data.data as { user: { id: string; firstName: string; lastName: string; role: string; }; employeeCode: string | null }[], enabled: canCreate });
  const assignedInvigilatorsQuery = useQuery({ queryKey: ['schedule-invigilators', scheduleId], queryFn: async () => (await apiClient.get(`/exams/schedules/${scheduleId}/invigilators`)).data.data as Invigilator[], enabled: canCreate && Boolean(scheduleId) });
  const rosterQuery = useQuery({ queryKey: ['exam-mark-roster', scheduleId], queryFn: async () => (await apiClient.get(`/exams/schedules/${scheduleId}/roster`)).data.data as { schedule: { maxMarks: number; examSession: { status: string; name: string } }; sections?: SectionOption[]; students: StudentRow[] }, enabled: canMark && Boolean(scheduleId) });
  const changesQuery = useQuery({ queryKey: ['grade-change-queue'], queryFn: async () => (await apiClient.get('/exams/grade-changes')).data.data as GradeChange[], enabled: canReview });
  const termOptions = useMemo(() => yearsQuery.data?.flatMap((year) => year.terms.map((term) => ({ id: term.id, label: `${year.name} · ${term.name}` }))) ?? [], [yearsQuery.data]);
  useEffect(() => { if (!sessionForm.academicTermId && termOptions.length) setSessionForm((f) => ({ ...f, academicTermId: termOptions[0].id })); }, [sessionForm.academicTermId, termOptions]);
  useEffect(() => { if (!scheduleForm.examSessionId && sessionsQuery.data?.length) setScheduleForm((f) => ({ ...f, examSessionId: sessionsQuery.data![0].id })); }, [scheduleForm.examSessionId, sessionsQuery.data]);
  useEffect(() => { if (!scheduleForm.subjectId && subjectsQuery.data?.length) setScheduleForm((f) => ({ ...f, subjectId: subjectsQuery.data![0].id })); }, [scheduleForm.subjectId, subjectsQuery.data]);
  useEffect(() => { if (!scheduleId && sessionsQuery.data?.some((s) => s.schedules.length)) setScheduleId(sessionsQuery.data.find((s) => s.schedules.length)!.schedules[0].id); }, [scheduleId, sessionsQuery.data]);
  useEffect(() => { if (rosterQuery.data) { setMarks(Object.fromEntries(rosterQuery.data.students.filter((s) => !s.mark).map((s) => [s.id, 0]))); setAbsentDrafts(Object.fromEntries(rosterQuery.data.students.filter((s) => !s.mark).map((s) => [s.id, false]))); } }, [rosterQuery.data]);

  const invalidate = async () => { await Promise.all([cache.invalidateQueries({ queryKey: ['exam-sessions'] }), cache.invalidateQueries({ queryKey: ['exam-mark-roster'] }), cache.invalidateQueries({ queryKey: ['report-cards'] }), cache.invalidateQueries({ queryKey: ['grade-change-queue'] }), cache.invalidateQueries({ queryKey: ['schedule-invigilators'] }), cache.invalidateQueries({ queryKey: ['exam-grading-scale'] })]); };
  const mutate = <TVariables = void,>(fn: (variables: TVariables) => Promise<unknown>, success: string) => ({ mutationFn: fn, onSuccess: async () => { setError(''); setNotice(success); await invalidate(); }, onError: (e: unknown) => { setNotice(''); setError(errorText(e)); } });
  const sessionMutation = useMutation(mutate(async () => apiClient.post('/exams/sessions', sessionForm), 'Exam session created.'));
  const scheduleMutation = useMutation(mutate(async () => apiClient.post('/exams/schedules', { ...scheduleForm, maxMarks: Number(scheduleForm.maxMarks), passMarks: Number(scheduleForm.passMarks), roomNumber: scheduleForm.roomNumber || undefined }), 'Exam schedule created.'));
  const marksMutation = useMutation(mutate(async () => {
    const rows = rosterQuery.data?.students.filter((student) => !student.mark) ?? [];
    if (!rows.length) throw new Error('There are no unmarked students in this schedule.');
    return apiClient.post('/exams/marks', { examScheduleId: scheduleId, marks: rows.map((student) => ({ studentId: student.id, marksObtained: absentDrafts[student.id] ? 0 : Number(marks[student.id] ?? 0), isAbsent: absentDrafts[student.id] ?? false })) });
  }, 'Marks submitted. Existing marks require the grade correction workflow.'));
  const gradeMutation = useMutation(mutate(async ({ markId, proposedMarks, reason }: { markId: string; proposedMarks: number; reason: string }) => apiClient.post('/exams/grade-changes', { examMarkId: markId, proposedMarks, reason }), 'Grade change submitted for approval.'));
  const reviewMutation = useMutation(mutate(async ({ id, status }: { id: string; status: 'APPROVED' | 'REJECTED' }) => apiClient.post(`/exams/grade-changes/${id}/review`, { status }), 'Grade change reviewed.'));
  const publishMutation = useMutation(mutate(async (examSessionId: string) => apiClient.post('/exams/results/publish', { examSessionId }), 'Results published and report cards generated.'));
  const invigilatorsMutation = useMutation(mutate(async () => apiClient.put(`/exams/schedules/${scheduleId}/invigilators`, { userIds: selectedInvigilators }), 'Invigilator assignments saved.'));
  useEffect(() => { if (assignedInvigilatorsQuery.data) setSelectedInvigilators(assignedInvigilatorsQuery.data.map((item) => item.user.id)); }, [assignedInvigilatorsQuery.data]);
  useEffect(() => { if (gradingScaleQuery.data) setGradeBands(gradingScaleQuery.data.bands.map(({ minimumPercentage, gradeLetter, gpa }) => ({ minimumPercentage, gradeLetter, gpa }))); }, [gradingScaleQuery.data]);
  const gradingScaleMutation = useMutation(mutate(async () => apiClient.put('/exams/grading-scale', { bands: gradeBands.map((band) => ({ ...band, minimumPercentage: Number(band.minimumPercentage), gpa: Number(band.gpa) })) }), 'Institution grading scale saved. New published results will use this scale.'));

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
      if (!student || student.mark || Object.prototype.hasOwnProperty.call(imported, student.id) || !Number.isFinite(score) || score < 0 || score > (rosterQuery.data?.schedule.maxMarks ?? 0) || !['true', 'false', '1', '0', ''].includes(rawAbsent.toLowerCase())) {
        setError(`CSV line ${index + 1} is invalid, duplicated, already marked, or outside the allowed range.`); setNotice(''); return;
      }
      const isAbsent = ['true', '1'].includes(rawAbsent.toLowerCase());
      imported[student.id] = score;
      importedAbsences[student.id] = isAbsent;
    }
    setMarks((prev) => ({ ...prev, ...imported }));
    setAbsentDrafts((prev) => ({ ...prev, ...importedAbsences }));
    setNotice(`Imported ${Object.keys(imported).length} rows from CSV.`);
    setError('');
  };

  const filteredStudents = useMemo(() => {
    if (!rosterQuery.data?.students) return [];
    if (sectionFilter === 'ALL') return rosterQuery.data.students;
    return rosterQuery.data.students.filter((s) => s.sectionId === sectionFilter);
  }, [rosterQuery.data?.students, sectionFilter]);

  const printReportCard = (card: ReportCard) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) { setError('Allow pop-ups to print or download the PDF result card.'); return; }
    const studentName = card.student ? `${card.student.user.firstName} ${card.student.user.lastName}` : 'Official Student Result Card';
    const admissionNo = card.student?.admissionNumber || '—';
    const rollNo = card.student?.rollNumber || '—';
    const sectionName = card.student?.section ? `${card.student.section.classGrade.name} - ${card.student.section.name}` : '—';
    const examName = card.examSession?.name || 'Academic Term Examination';
    const sessionYear = card.examSession?.academicTerm ? `${card.examSession.academicTerm.academicYear.name} · ${card.examSession.academicTerm.name}` : '';

    const subjectsRows = (card.subjectMarks || []).map((sm) => `
      <tr>
        <td style="padding: 10px; border: 1px solid #cbd5e1; font-family: monospace; font-weight: bold; color: #1e40af;">${escapeHtml(sm.subjectCode)}</td>
        <td style="padding: 10px; border: 1px solid #cbd5e1; font-weight: 600;">${escapeHtml(sm.subjectName)}</td>
        <td style="padding: 10px; border: 1px solid #cbd5e1; text-align: center;">${sm.maxMarks}</td>
        <td style="padding: 10px; border: 1px solid #cbd5e1; text-align: center;">${sm.passMarks}</td>
        <td style="padding: 10px; border: 1px solid #cbd5e1; text-align: center; font-weight: bold;">${sm.isAbsent ? '<span style=\"color:#dc2626;\">Absent</span>' : sm.marksObtained}</td>
        <td style="padding: 10px; border: 1px solid #cbd5e1; text-align: center;">${sm.isAbsent ? '0.0%' : sm.percentage.toFixed(1) + '%'}</td>
        <td style="padding: 10px; border: 1px solid #cbd5e1; text-align: center; font-weight: bold; color: #2563eb;">${escapeHtml(sm.gradeLetter)}</td>
        <td style="padding: 10px; border: 1px solid #cbd5e1; text-align: center; font-weight: bold; color: ${sm.isPassed ? '#16a34a' : '#dc2626'};">${sm.isPassed ? 'PASS' : sm.isAbsent ? 'ABSENT' : 'FAIL'}</td>
      </tr>
    `).join('');

    printWindow.document.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Result Card - ${escapeHtml(studentName)}</title>
  <style>
    @page { size: A4 portrait; margin: 12mm 15mm; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #0f172a; margin: 0; padding: 24px; background: #fff; }
    .card { max-width: 820px; margin: 0 auto; border: 2px solid #0f172a; border-radius: 8px; padding: 28px; }
    .header { text-align: center; border-bottom: 2px solid #e2e8f0; padding-bottom: 18px; margin-bottom: 20px; }
    .header h1 { margin: 0; font-size: 24px; color: #0f172a; text-transform: uppercase; }
    .header p { margin: 4px 0 0; font-size: 13px; color: #64748b; }
    .badge-bar { display: inline-block; background: #0f172a; color: #fff; padding: 4px 16px; border-radius: 20px; font-size: 11px; font-weight: 700; text-transform: uppercase; margin-top: 10px; }
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
    .signature { font-family: monospace; font-size: 9px; word-break: break-all; max-width: 380px; margin-top: 4px; }
    .sig-line { width: 170px; border-top: 1px solid #0f172a; text-align: center; padding-top: 4px; font-weight: 600; color: #0f172a; }
    @media print { body { padding: 0; } .card { border: none; padding: 0; } }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>Official Student Result Card</h1>
      <p>Certified Performance Record · ${escapeHtml(examName)} ${escapeHtml(sessionYear ? '· ' + sessionYear : '')}</p>
      <div class="badge-bar">Official Academic Transcript</div>
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
          <th>Code</th>
          <th>Subject Name</th>
          <th style="text-align:center;">Max</th>
          <th style="text-align:center;">Pass</th>
          <th style="text-align:center;">Marks</th>
          <th style="text-align:center;">Percentage</th>
          <th style="text-align:center;">Grade</th>
          <th style="text-align:center;">Result</th>
        </tr>
      </thead>
      <tbody>
        ${subjectsRows.length > 0 ? subjectsRows : '<tr><td colspan=\"8\" style=\"padding:16px;text-align:center;color:#64748b;\">No individual subject marks available.</td></tr>'}
      </tbody>
    </table>
    <div class="summary">
      <div><div class="sum-lbl">Total Marks</div><div class="sum-num">${card.totalMarks}</div></div>
      <div><div class="sum-lbl">Percentage</div><div class="sum-num">${card.percentage.toFixed(1)}%</div></div>
      <div><div class="sum-lbl">Overall Grade</div><div class="sum-num" style="color:#2563eb;">${escapeHtml(card.gradeLetter)}</div></div>
      <div><div class="sum-lbl">GPA (0-4)</div><div class="sum-num">${card.gpa.toFixed(2)}</div></div>
      <div><div class="sum-lbl">Rank</div><div class="sum-num">${card.rank ? '#' + card.rank : '—'}</div></div>
    </div>
    <div class="footer">
      <div>
        <div style="font-weight:700;color:#0f172a;">Digital Cryptographic Signature</div>
        <div class="signature">${escapeHtml(card.verificationSignature || 'Signature Verified: LMS-SECURE-KEY')}</div>
      </div>
      <div>
        <div class="sig-line">Controller of Examinations</div>
      </div>
    </div>
  </div>
</body>
</html>`);
    printWindow.document.close();
    printWindow.setTimeout(() => { printWindow.focus(); printWindow.print(); }, 250);
    setError('');
  };

  const inputClass = 'mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500';
  return <div className="mx-auto max-w-6xl space-y-6">
    <header><p className="text-sm font-semibold text-primary-700">ASSESSMENT</p><h1 className="mt-1 text-2xl font-bold text-slate-900">Exams and results</h1><p className="mt-1 text-sm text-slate-600">Enter marks filtered by section, manage grading scales, review corrections, and generate printable PDF result cards.</p></header>
    {notice && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}{error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {sessionsQuery.isError && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">Could not load exam sessions.</p>}
    {canCreate && <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">Institution grading scale</h2><p className="text-sm text-slate-600">Percentage thresholds map to letter grades and GPA for future result publications. Existing published cards remain unchanged.</p></div>{gradingScaleQuery.data && <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">{gradingScaleQuery.data.source === 'default' ? 'Using default scale until saved' : 'Institution scale'}</span>}</div>{gradingScaleQuery.isLoading ? <p className="py-4 text-sm text-slate-500">Loading grading scale…</p> : gradingScaleQuery.isError ? <p role="alert" className="py-3 text-sm text-rose-700">Could not load grading scale.</p> : <><div className="my-4 space-y-2">{gradeBands.map((band, index) => <div key={`${index}-${band.gradeLetter}`} className="grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-2"><label className="text-xs font-medium">Minimum %<input type="number" min="0" max="100" step="0.1" value={band.minimumPercentage} onChange={(e) => setGradeBands((rows) => rows.map((row, i) => i === index ? { ...row, minimumPercentage: Number(e.target.value) } : row))} className={inputClass}/></label><label className="text-xs font-medium">Grade<input maxLength={8} value={band.gradeLetter} onChange={(e) => setGradeBands((rows) => rows.map((row, i) => i === index ? { ...row, gradeLetter: e.target.value.toUpperCase() } : row))} className={inputClass}/></label><label className="text-xs font-medium">GPA (0–4)<input type="number" min="0" max="4" step="0.01" value={band.gpa} onChange={(e) => setGradeBands((rows) => rows.map((row, i) => i === index ? { ...row, gpa: Number(e.target.value) } : row))} className={inputClass}/></label><button type="button" aria-label={`Remove grade band ${band.gradeLetter}`} disabled={gradeBands.length <= 2} onClick={() => setGradeBands((rows) => rows.filter((_, i) => i !== index))} className="rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-40">Remove</button></div>)}</div><div className="flex gap-2"><button type="button" onClick={() => setGradeBands((rows) => [...rows, { minimumPercentage: 0, gradeLetter: '', gpa: 0 }])} disabled={gradeBands.length >= 20} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50">Add band</button><button type="button" onClick={() => gradingScaleMutation.mutate()} disabled={gradingScaleMutation.isPending || gradeBands.length < 2} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Save grading scale</button></div></>}</section>}
    {canCreate && <section className="grid gap-5 lg:grid-cols-2">
      <form onSubmit={(e) => { e.preventDefault(); sessionMutation.mutate(); }} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-semibold">Create exam session</h2><label className="text-sm font-medium">Academic term<select required value={sessionForm.academicTermId} onChange={(e) => setSessionForm({ ...sessionForm, academicTermId: e.target.value })} className={inputClass}>{termOptions.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select></label><label className="text-sm font-medium">Session name<input required minLength={2} maxLength={120} value={sessionForm.name} onChange={(e) => setSessionForm({ ...sessionForm, name: e.target.value })} className={inputClass}/></label><div className="grid grid-cols-2 gap-3"><label className="text-sm font-medium">Start<input required type="date" value={sessionForm.startDate} onChange={(e) => setSessionForm({ ...sessionForm, startDate: e.target.value })} className={inputClass}/></label><label className="text-sm font-medium">End<input required type="date" value={sessionForm.endDate} onChange={(e) => setSessionForm({ ...sessionForm, endDate: e.target.value })} className={inputClass}/></label></div><button disabled={sessionMutation.isPending || !sessionForm.academicTermId} className="rounded-lg bg-primary-600 px-4 py-2 font-semibold text-white disabled:opacity-50">Create session</button></form>
      <form onSubmit={(e) => { e.preventDefault(); scheduleMutation.mutate(); }} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-semibold">Add subject schedule</h2><label className="text-sm font-medium">Exam session<select required value={scheduleForm.examSessionId} onChange={(e) => setScheduleForm({ ...scheduleForm, examSessionId: e.target.value })} className={inputClass}>{(sessionsQuery.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label className="text-sm font-medium">Subject<select required value={scheduleForm.subjectId} onChange={(e) => setScheduleForm({ ...scheduleForm, subjectId: e.target.value })} className={inputClass}>{(subjectsQuery.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.code} · {s.name}</option>)}</select></label><div className="grid grid-cols-3 gap-3"><label className="text-sm font-medium">Exam date<input required type="date" value={scheduleForm.examDate} onChange={(e) => setScheduleForm({ ...scheduleForm, examDate: e.target.value })} className={inputClass}/></label><label className="text-sm font-medium">Start<input required type="time" value={scheduleForm.startTime} onChange={(e) => setScheduleForm({ ...scheduleForm, startTime: e.target.value })} className={inputClass}/></label><label className="text-sm font-medium">End<input required type="time" value={scheduleForm.endTime} onChange={(e) => setScheduleForm({ ...scheduleForm, endTime: e.target.value })} className={inputClass}/></label></div><div className="grid grid-cols-3 gap-3"><label className="text-sm font-medium">Maximum marks<input required type="number" min="1" value={scheduleForm.maxMarks} onChange={(e) => setScheduleForm({ ...scheduleForm, maxMarks: Number(e.target.value) })} className={inputClass}/></label><label className="text-sm font-medium">Pass marks<input required type="number" min="1" value={scheduleForm.passMarks} onChange={(e) => setScheduleForm({ ...scheduleForm, passMarks: Number(e.target.value) })} className={inputClass}/></label><label className="text-sm font-medium">Room<input maxLength={40} value={scheduleForm.roomNumber} onChange={(e) => setScheduleForm({ ...scheduleForm, roomNumber: e.target.value })} className={inputClass}/></label></div><button disabled={scheduleMutation.isPending || !scheduleForm.examSessionId || !scheduleForm.subjectId} className="rounded-lg bg-primary-600 px-4 py-2 font-semibold text-white disabled:opacity-50">Add schedule</button></form>
    </section>}

    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Teacher Marks Entry by Section</h2>
          <p className="text-sm text-slate-500">Select an exam subject schedule and filter by class section (e.g. Class 10 Sec A) to input student marks.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {(canMark || canCreate) && (
            <label className="text-xs font-semibold text-slate-700">
              Exam Schedule
              <select value={scheduleId} onChange={(e) => setScheduleId(e.target.value)} className="mt-1 block min-w-56 rounded-lg border border-slate-300 p-2 text-sm">
                {(sessionsQuery.data ?? []).flatMap((s) => s.schedules.map((sch) => (
                  <option key={sch.id} value={sch.id}>
                    {s.name} · {sch.subject.name} ({new Date(sch.examDate).toLocaleDateString()})
                  </option>
                )))}
              </select>
            </label>
          )}

          {canMark && rosterQuery.data?.sections && rosterQuery.data.sections.length > 0 && (
            <label className="text-xs font-semibold text-slate-700">
              Section Filter
              <select value={sectionFilter} onChange={(e) => setSectionFilter(e.target.value)} className="mt-1 block min-w-44 rounded-lg border border-slate-300 p-2 text-sm">
                <option value="ALL">All Sections ({rosterQuery.data.students.length} students)</option>
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

      {canCreate && <div className="mb-5 rounded-lg border border-slate-200 p-4"><h3 className="font-semibold">Invigilator roster</h3>{invigilatorCandidatesQuery.isLoading || assignedInvigilatorsQuery.isLoading ? <p className="py-2 text-sm text-slate-500">Loading staff roster…</p> : invigilatorCandidatesQuery.isError || assignedInvigilatorsQuery.isError ? <p role="alert" className="py-2 text-sm text-rose-700">Could not load invigilator assignments.</p> : !invigilatorCandidatesQuery.data?.length ? <p className="py-2 text-sm text-slate-600">No active staff profiles are available.</p> : <><div className="my-3 grid gap-2 sm:grid-cols-2">{invigilatorCandidatesQuery.data.map(({ user: staff, employeeCode }) => <label key={staff.id} className="flex items-center gap-2 rounded border p-2 text-sm"><input type="checkbox" checked={selectedInvigilators.includes(staff.id)} onChange={(e) => setSelectedInvigilators((ids) => e.target.checked ? [...ids, staff.id] : ids.filter((id) => id !== staff.id))}/><span>{staff.firstName} {staff.lastName}{employeeCode ? ` · ${employeeCode}` : ''}</span><span className="ml-auto text-xs text-slate-500">{staff.role.replace('ROLE_', '').replace(/_/g, ' ')}</span></label>)}</div><button disabled={invigilatorsMutation.isPending || !scheduleId} onClick={() => invigilatorsMutation.mutate()} className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Save invigilators ({selectedInvigilators.length})</button></>}</div>}
      {sessionsQuery.isLoading && <p className="py-6 text-center text-sm text-slate-500">Loading exam schedule…</p>}{sessionsQuery.data && !sessionsQuery.data.some((s) => s.schedules.length) && <p className="rounded-lg bg-slate-50 p-5 text-center text-sm text-slate-600">No exam schedules have been created.</p>}
      {canMark && rosterQuery.isLoading && <p className="py-5 text-sm text-slate-500">Loading eligible students…</p>}{canMark && rosterQuery.isError && <p role="alert" className="py-5 text-sm text-rose-700">Could not load the marks roster.</p>}
      
      {canMark && rosterQuery.data && (
        <>
          {filteredStudents.length === 0 ? (
            <p className="rounded-lg bg-slate-50 p-5 text-center text-sm text-slate-600">
              No students found for the selected section.
            </p>
          ) : (
            <>
              <div className="mb-3 rounded-lg bg-slate-50 p-3">
                <label className="block text-sm font-medium">
                  Quick CSV Import: admissionNumber,marksObtained,isAbsent (true/false)
                  <textarea value={csvText} onChange={(e) => setCsvText(e.target.value)} placeholder={'admissionNumber,marksObtained,isAbsent\nADM-2026-001,75,false'} rows={2} className="mt-1 block w-full rounded-md border border-slate-300 p-2 font-mono text-xs"/>
                </label>
                <button type="button" onClick={importCsv} disabled={!csvText.trim()} className="mt-2 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold">
                  Import CSV Rows
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[780px] text-left text-sm">
                  <thead>
                    <tr className="border-b text-xs font-semibold uppercase text-slate-500">
                      <th className="px-3 py-3">Student Name</th>
                      <th className="px-3 py-3">Admission</th>
                      <th className="px-3 py-3">Section</th>
                      <th className="px-3 py-3">Absent</th>
                      <th className="px-3 py-3">Marks / {rosterQuery.data.schedule.maxMarks}</th>
                      <th className="px-3 py-3">Grade Correction</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredStudents.map((student) => (
                      <tr key={student.id} className="hover:bg-slate-50/60">
                        <td className="px-3 py-3 font-medium text-slate-900">
                          {student.user.firstName} {student.user.lastName}
                        </td>
                        <td className="px-3 py-3 font-mono text-xs text-slate-600">{student.admissionNumber}</td>
                        <td className="px-3 py-3">
                          <span className="inline-flex rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                            {student.section ? `${student.section.classGrade.name} - ${student.section.name}` : 'Enrolled'}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          {student.mark ? (
                            student.mark.isAbsent ? <span className="font-semibold text-rose-600">Yes</span> : 'No'
                          ) : (
                            <input
                              type="checkbox"
                              aria-label={`Absent: ${student.user.firstName}`}
                              checked={absentDrafts[student.id] ?? false}
                              onChange={(e) => setAbsentDrafts((v) => ({ ...v, [student.id]: e.target.checked }))}
                            />
                          )}
                        </td>
                        <td className="px-3 py-3">
                          {student.mark ? (
                            <span className="font-bold text-slate-900">
                              {student.mark.isAbsent ? 'Absent' : student.mark.marksObtained}
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
                              className="w-24 rounded-md border px-2 py-1.5 text-sm font-medium disabled:bg-slate-100"
                            />
                          )}
                        </td>
                        <td className="px-3 py-3">
                          {student.mark && canChangeGrade ? (
                            <div className="flex min-w-64 gap-2">
                              <input
                                aria-label="Proposed marks"
                                type="number"
                                min="0"
                                max={rosterQuery.data.schedule.maxMarks}
                                value={gradeDrafts[student.id]?.proposedMarks ?? student.mark.marksObtained}
                                onChange={(e) => setGradeDrafts((v) => ({ ...v, [student.id]: { proposedMarks: Number(e.target.value), reason: v[student.id]?.reason ?? '' } }))}
                                className="w-20 rounded-md border px-2 py-1 text-xs"
                              />
                              <input
                                aria-label="Grade change reason"
                                placeholder="Reason"
                                value={gradeDrafts[student.id]?.reason ?? ''}
                                onChange={(e) => setGradeDrafts((v) => ({ ...v, [student.id]: { proposedMarks: v[student.id]?.proposedMarks ?? student.mark!.marksObtained, reason: e.target.value } }))}
                                className="min-w-24 flex-1 rounded-md border px-2 py-1 text-xs"
                              />
                              <button
                                disabled={gradeMutation.isPending || (gradeDrafts[student.id]?.reason.trim().length ?? 0) < 5}
                                onClick={() => gradeMutation.mutate({ markId: student.mark!.id, proposedMarks: gradeDrafts[student.id]?.proposedMarks ?? student.mark!.marksObtained, reason: gradeDrafts[student.id]?.reason ?? '' })}
                                className="rounded-md bg-slate-800 px-2.5 py-1 text-xs font-semibold text-white"
                              >
                                Request
                              </button>
                            </div>
                          ) : student.mark ? (
                            '—'
                          ) : (
                            <span className="text-xs text-amber-600 font-medium">Pending entry</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {filteredStudents.some((s) => !s.mark) && (
                <div className="mt-4 flex justify-end">
                  <button
                    disabled={marksMutation.isPending || rosterQuery.data.schedule.examSession.status === 'PUBLISHED'}
                    onClick={() => marksMutation.mutate()}
                    className="rounded-xl bg-primary-600 px-4 py-2 font-semibold text-white shadow-sm hover:bg-primary-700 disabled:opacity-50 text-sm"
                  >
                    Submit Unentered Marks
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </section>

    {canReview && <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="mb-3 text-lg font-semibold">Pending grade change approvals</h2>{changesQuery.isLoading && <p className="py-5 text-sm text-slate-500">Loading approvals…</p>}{changesQuery.isError && <p role="alert" className="py-4 text-sm text-rose-700">Could not load pending changes.</p>}{changesQuery.data && !changesQuery.data.length && <p className="rounded-lg bg-slate-50 p-5 text-sm text-slate-600">No grade changes pending review.</p>}{!!changesQuery.data?.length && changesQuery.data.map((change) => <article key={change.id} className="flex flex-wrap items-center justify-between gap-3 border-t py-4"><div><p className="font-semibold">{change.examMark.student.user.firstName} {change.examMark.student.user.lastName} · {change.examMark.student.admissionNumber}</p><p className="text-sm text-slate-600">{change.examMark.examSchedule.examSession.name} · {change.examMark.examSchedule.subject.name}: {change.originalMarks} → {change.proposedMarks}</p><p className="text-sm text-slate-500">{change.reason}</p></div><div className="flex gap-2"><button disabled={reviewMutation.isPending} onClick={() => reviewMutation.mutate({ id: change.id, status: 'REJECTED' })} className="rounded-lg border border-rose-300 px-3 py-2 text-sm text-rose-700">Reject</button><button disabled={reviewMutation.isPending} onClick={() => reviewMutation.mutate({ id: change.id, status: 'APPROVED' })} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm text-white">Approve</button></div></article>)}</section>}
    {canPublish && <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="mb-3 text-lg font-semibold">Publish results</h2>{(sessionsQuery.data ?? []).map((session) => <div key={session.id} className="flex flex-wrap items-center justify-between gap-3 border-t py-3"><div><p className="font-semibold">{session.name}</p><p className="text-sm text-slate-500">{session.academicTerm.academicYear.name} · {session.academicTerm.name} · {session.status}</p></div>{session.status !== 'PUBLISHED' && <button disabled={publishMutation.isPending} onClick={() => publishMutation.mutate(session.id)} className="rounded-lg bg-primary-600 px-3 py-2 text-sm font-semibold text-white">Publish results</button>}</div>)}</section>}

    {/* Report Cards / Result Cards Section */}
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            {user?.role === 'ROLE_PARENT' || user?.role === 'ROLE_STUDENT' ? 'My Official Result Cards' : 'Published Student Result Cards'}
          </h2>
          <p className="text-sm text-slate-500">Official transcripts with all subject marks, percentages, letter grades, and printable PDF cards.</p>
        </div>
      </div>

      {reportCardsQuery.isLoading && <p className="py-6 text-center text-sm text-slate-500">Loading report cards…</p>}
      {reportCardsQuery.isError && <p role="alert" className="py-4 text-sm text-rose-700">Could not load report cards.</p>}
      {reportCardsQuery.data && !reportCardsQuery.data.length && <p className="rounded-lg bg-slate-50 p-5 text-center text-sm text-slate-600">No published report cards are available.</p>}
      
      {!!reportCardsQuery.data?.length && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[740px] text-left text-sm">
            <thead>
              <tr className="border-b text-xs font-semibold uppercase text-slate-500">
                <th className="px-3 py-3">Student</th>
                <th className="px-3 py-3">Class & Section</th>
                <th className="px-3 py-3">Exam Session</th>
                <th className="px-3 py-3">Total Marks</th>
                <th className="px-3 py-3">Percentage</th>
                <th className="px-3 py-3">Grade</th>
                <th className="px-3 py-3">GPA</th>
                <th className="px-3 py-3">Rank</th>
                <th className="px-3 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {reportCardsQuery.data.map((card) => (
                <tr key={card.id} className="hover:bg-slate-50/80">
                  <td className="px-3 py-3 font-medium text-slate-900">
                    {card.student ? `${card.student.user.firstName} ${card.student.user.lastName}` : 'My Report Card'}
                    <span className="block text-xs text-slate-400 font-mono">{card.student?.admissionNumber}</span>
                  </td>
                  <td className="px-3 py-3 text-xs text-slate-600">
                    {card.student?.section ? `${card.student.section.classGrade.name} - ${card.student.section.name}` : '—'}
                  </td>
                  <td className="px-3 py-3 text-slate-700">{card.examSession.name}</td>
                  <td className="px-3 py-3 font-semibold text-slate-900">{card.totalMarks}</td>
                  <td className="px-3 py-3 font-semibold text-slate-900">{card.percentage.toFixed(1)}%</td>
                  <td className="px-3 py-3">
                    <span className="inline-block rounded-md bg-primary-100 px-2 py-0.5 text-xs font-bold text-primary-700">
                      {card.gradeLetter}
                    </span>
                  </td>
                  <td className="px-3 py-3 font-medium text-slate-700">{card.gpa.toFixed(2)}</td>
                  <td className="px-3 py-3 text-slate-600">{card.rank ? '#' + card.rank : '—'}</td>
                  <td className="px-3 py-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => setPreviewCard(card)}
                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                      >
                        View Card
                      </button>
                      <button
                        type="button"
                        onClick={() => printReportCard(card)}
                        className="rounded-lg bg-primary-600 px-2.5 py-1 text-xs font-semibold text-white shadow-sm hover:bg-primary-700"
                      >
                        Download PDF
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>

    {/* Interactive Result Card Preview Modal */}
    {previewCard && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
        <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Official Result Card</h3>
              <p className="text-xs text-slate-500">
                {previewCard.student ? `${previewCard.student.user.firstName} ${previewCard.student.user.lastName}` : 'Student Performance'} · {previewCard.examSession.name}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setPreviewCard(null)}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              ✕
            </button>
          </div>

          <div className="my-4 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-4 text-xs">
            <div>
              <span className="text-slate-500 font-medium">Student Name:</span>{' '}
              <span className="font-bold text-slate-900">
                {previewCard.student ? `${previewCard.student.user.firstName} ${previewCard.student.user.lastName}` : 'N/A'}
              </span>
            </div>
            <div>
              <span className="text-slate-500 font-medium">Admission No:</span>{' '}
              <span className="font-mono font-bold text-slate-900">{previewCard.student?.admissionNumber || 'N/A'}</span>
            </div>
            <div>
              <span className="text-slate-500 font-medium">Class & Section:</span>{' '}
              <span className="font-bold text-slate-900">
                {previewCard.student?.section ? `${previewCard.student.section.classGrade.name} - ${previewCard.student.section.name}` : 'N/A'}
              </span>
            </div>
            <div>
              <span className="text-slate-500 font-medium">Roll Number:</span>{' '}
              <span className="font-bold text-slate-900">{previewCard.student?.rollNumber || '—'}</span>
            </div>
          </div>

          {/* Subject-Wise Marks Breakdown Table */}
          <div className="mb-4 overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead className="border-b bg-slate-100 text-slate-600 font-semibold uppercase">
                <tr>
                  <th className="p-2.5">Code</th>
                  <th className="p-2.5">Subject</th>
                  <th className="p-2.5 text-center">Max</th>
                  <th className="p-2.5 text-center">Marks</th>
                  <th className="p-2.5 text-center">%</th>
                  <th className="p-2.5 text-center">Grade</th>
                  <th className="p-2.5 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(previewCard.subjectMarks || []).length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-4 text-center text-slate-400 italic">
                      No individual subjects recorded.
                    </td>
                  </tr>
                ) : (
                  previewCard.subjectMarks!.map((sm) => (
                    <tr key={sm.id}>
                      <td className="p-2.5 font-mono font-bold text-primary-700">{sm.subjectCode}</td>
                      <td className="p-2.5 font-medium text-slate-800">{sm.subjectName}</td>
                      <td className="p-2.5 text-center text-slate-600">{sm.maxMarks}</td>
                      <td className="p-2.5 text-center font-bold text-slate-900">
                        {sm.isAbsent ? <span className="text-rose-600">Absent</span> : sm.marksObtained}
                      </td>
                      <td className="p-2.5 text-center font-medium">{sm.percentage.toFixed(1)}%</td>
                      <td className="p-2.5 text-center font-bold text-primary-600">{sm.gradeLetter}</td>
                      <td className="p-2.5 text-center font-bold">
                        <span
                          className={`inline-block rounded px-2 py-0.5 text-[11px] ${
                            sm.isPassed ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {sm.isPassed ? 'PASS' : sm.isAbsent ? 'ABSENT' : 'FAIL'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Overall Summary Bar */}
          <div className="grid grid-cols-4 gap-2 rounded-xl bg-slate-900 p-4 text-center text-white">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-400">Total Marks</p>
              <p className="text-lg font-bold">{previewCard.totalMarks}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-400">Percentage</p>
              <p className="text-lg font-bold">{previewCard.percentage.toFixed(1)}%</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-400">GPA (0-4)</p>
              <p className="text-lg font-bold">{previewCard.gpa.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-400">Final Grade</p>
              <p className="text-lg font-bold text-primary-400">{previewCard.gradeLetter}</p>
            </div>
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setPreviewCard(null)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => {
                const card = previewCard;
                setPreviewCard(null);
                printReportCard(card);
              }}
              className="rounded-xl bg-primary-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-primary-700"
            >
              Download PDF / Print
            </button>
          </div>
        </div>
      </div>
    )}
  </div>;
};

