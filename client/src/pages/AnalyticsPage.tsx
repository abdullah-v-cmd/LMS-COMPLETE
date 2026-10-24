import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';

type AttendanceSummary = { total: number; present: number; absent: number; late: number; excused: number; presentRate: number; dailySeries: { date: string; count: number }[] };
type FinanceSummary = { invoicesByStatus: Record<string, { count: number; total: number }>; totalCollected: number; paymentCount: number; overdueDefaulterCount: number };
type LmsCourse = { courseId: string; title: string; enrollments: number; modules: number; assignments: number; submissions: number; graded: number };
type TransportSummary = { byStatus: { status: string; count: number }[]; byRoute: { routeId: string; routeName: string; count: number }[]; billingCharges: number; totalBilled: number };
type LibrarySummary = { catalogBooks: number; copyStatus: { status: string; count: number }[]; loanStatus: { status: string; count: number }[]; waitingReservations: number; recentAudits: { id: string; auditedAt: string; notes: string | null; copiesAudited: number }[] };
type HostelSummary = { blocks: number; rooms: { type: string; count: number; capacity: number }[]; totalCapacity: number; activeResidents: number; occupancyRate: number; incidents: { category: string; count: number }[]; messCharges: { status: string; count: number; total: number }[] };
type HrSummary = { totalTeachers: number; leaveByStatus: { status: string; count: number }[]; recentPayrolls: { id: string; period: string; totalGross: number; status: string; staffCount: number }[] };
type DashboardStats = { student?: { enrollments: number; attendanceSummary: Record<string, number>; reportCards: number } | null; children?: { id: string; admissionNumber: string; user: { firstName: string; lastName: string } }[]; teacher?: { courses: number; assignments: number } | null; institution?: { students: number; teachers: number; courses: number; unpaidInvoices: number } };

const Stat: React.FC<{ label: string; value: string | number; sub?: string; color?: string }> = ({ label, value, sub, color = 'bg-primary-50 text-primary-700' }) => (
  <div className={`rounded-2xl p-5 ${color}`}>
    <p className="text-xs font-semibold uppercase tracking-wider opacity-70">{label}</p>
    <p className="mt-1 text-3xl font-bold">{value}</p>
    {sub && <p className="mt-1 text-xs opacity-60">{sub}</p>}
  </div>
);

const Card: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="rounded-2xl border bg-white p-5">
    <h2 className="mb-3 font-semibold text-slate-800">{title}</h2>
    {children}
  </section>
);

export const AnalyticsPage: React.FC = () => {
  const { user } = useAuth();
  const [attendanceFrom, setAttendanceFrom] = useState('');
  const [attendanceTo, setAttendanceTo] = useState('');
  const [financeFrom, setFinanceFrom] = useState('');
  const [financeTo, setFinanceTo] = useState('');
  const [transportFrom, setTransportFrom] = useState('');
  const [transportTo, setTransportTo] = useState('');

  const role = user?.role ?? '';

  const dashboard = useQuery<DashboardStats>({
    queryKey: ['analytics-dashboard'],
    queryFn: async () => (await apiClient.get('/analytics/dashboard')).data.data,
  });

  const attendance = useQuery<AttendanceSummary>({
    queryKey: ['analytics-attendance', attendanceFrom, attendanceTo],
    queryFn: async () => (await apiClient.get('/analytics/attendance', { params: { from: attendanceFrom || undefined, to: attendanceTo || undefined } })).data.data,
  });

  const finance = useQuery<FinanceSummary>({
    queryKey: ['analytics-finance', financeFrom, financeTo],
    queryFn: async () => (await apiClient.get('/analytics/finance', { params: { from: financeFrom || undefined, to: financeTo || undefined } })).data.data,
    enabled: ['ROLE_FINANCE_HEAD', 'ROLE_FEE_CLERK', 'ROLE_INSTITUTION_ADMIN', 'ROLE_AUDITOR', 'ROLE_SUPER_ADMIN'].includes(role),
    retry: false,
  });

  const lms = useQuery<LmsCourse[]>({
    queryKey: ['analytics-lms'],
    queryFn: async () => (await apiClient.get('/analytics/lms')).data.data,
    enabled: ['ROLE_SUBJECT_TEACHER', 'ROLE_TEACHING_ASSISTANT', 'ROLE_INSTITUTION_ADMIN', 'ROLE_ACADEMIC_HEAD', 'ROLE_AUDITOR', 'ROLE_SUPER_ADMIN'].includes(role),
    retry: false,
  });

  const transport = useQuery<TransportSummary>({
    queryKey: ['analytics-transport', transportFrom, transportTo],
    queryFn: async () => (await apiClient.get('/analytics/transport', { params: { from: transportFrom || undefined, to: transportTo || undefined } })).data.data,
    enabled: ['ROLE_TRANSPORT_COORDINATOR', 'ROLE_INSTITUTION_ADMIN', 'ROLE_AUDITOR', 'ROLE_SUPER_ADMIN'].includes(role),
    retry: false,
  });

  const library = useQuery<LibrarySummary>({
    queryKey: ['analytics-library'],
    queryFn: async () => (await apiClient.get('/analytics/library')).data.data,
    enabled: ['ROLE_LIBRARIAN', 'ROLE_INSTITUTION_ADMIN', 'ROLE_AUDITOR', 'ROLE_SUPER_ADMIN'].includes(role),
    retry: false,
  });

  const hostel = useQuery<HostelSummary>({
    queryKey: ['analytics-hostel'],
    queryFn: async () => (await apiClient.get('/analytics/hostel')).data.data,
    enabled: ['ROLE_HOSTEL_WARDEN', 'ROLE_INSTITUTION_ADMIN', 'ROLE_AUDITOR', 'ROLE_SUPER_ADMIN'].includes(role),
    retry: false,
  });

  const hr = useQuery<HrSummary>({
    queryKey: ['analytics-hr'],
    queryFn: async () => (await apiClient.get('/analytics/hr')).data.data,
    enabled: ['ROLE_INSTITUTION_ADMIN', 'ROLE_ACADEMIC_HEAD', 'ROLE_AUDITOR', 'ROLE_SUPER_ADMIN'].includes(role),
    retry: false,
  });

  const d = dashboard.data;

  return (
    <main className="mx-auto max-w-6xl space-y-6">
      <header>
        <p className="text-sm font-semibold text-primary-700">REPORTING &amp; ANALYTICS</p>
        <h1 className="mt-1 text-2xl font-bold">Institution Analytics Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">
          Aggregated from persisted records — filtered to your role and tenant scope.
        </p>
      </header>

      {/* ── Dashboard Summary ── */}
      {dashboard.isLoading && <p className="text-sm text-slate-500">Loading dashboard…</p>}
      {d?.institution && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Students" value={d.institution.students} color="bg-blue-50 text-blue-700" />
          <Stat label="Teachers" value={d.institution.teachers} color="bg-emerald-50 text-emerald-700" />
          <Stat label="Active courses" value={d.institution.courses} color="bg-violet-50 text-violet-700" />
          <Stat label="Unpaid invoices" value={d.institution.unpaidInvoices} color="bg-rose-50 text-rose-700" />
        </div>
      )}
      {d?.teacher && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat label="My courses" value={d.teacher.courses} />
          <Stat label="My assignments" value={d.teacher.assignments} />
        </div>
      )}
      {d?.student && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat label="Enrolled courses" value={d.student.enrollments} />
          <Stat label="Report cards" value={d.student.reportCards} />
          <Stat label="Present days" value={d.student.attendanceSummary['PRESENT'] ?? 0} />
        </div>
      )}
      {d?.children && d.children.length > 0 && (
        <Card title="My Children">
          {d.children.map(c => (
            <p key={c.id} className="border-t py-2 text-sm">{c.user.firstName} {c.user.lastName} · {c.admissionNumber}</p>
          ))}
        </Card>
      )}

      {/* ── Attendance ── */}
      <Card title="Attendance Summary">
        <div className="mb-3 flex flex-wrap gap-2">
          <label className="flex items-center gap-1 text-xs">From<input type="date" className="rounded border px-2 py-1 text-xs" value={attendanceFrom} onChange={e => setAttendanceFrom(e.target.value)} /></label>
          <label className="flex items-center gap-1 text-xs">To<input type="date" className="rounded border px-2 py-1 text-xs" value={attendanceTo} onChange={e => setAttendanceTo(e.target.value)} /></label>
        </div>
        {attendance.isLoading && <p className="text-sm text-slate-500">Loading…</p>}
        {attendance.data && (
          <div>
            <div className="grid gap-3 sm:grid-cols-4">
              <Stat label="Total records" value={attendance.data.total} color="bg-slate-50 text-slate-700" />
              <Stat label="Present" value={attendance.data.present} color="bg-emerald-50 text-emerald-700" />
              <Stat label="Absent" value={attendance.data.absent} color="bg-rose-50 text-rose-700" />
              <Stat label="Presence rate" value={`${attendance.data.presentRate}%`} color="bg-blue-50 text-blue-700" />
            </div>
            {attendance.data.dailySeries.length > 0 && (
              <div className="mt-4">
                <p className="mb-1 text-xs font-semibold text-slate-500">Daily records (last 90 days)</p>
                <div className="flex flex-wrap gap-1">
                  {attendance.data.dailySeries.map(d => (
                    <span key={d.date} title={`${d.date}: ${d.count}`} className="inline-block h-4 w-4 rounded-sm bg-primary-400 opacity-75" style={{ opacity: Math.min(1, d.count / 30) }} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* ── Finance ── */}
      {!finance.isError && (
        <Card title="Financial Summary">
          <div className="mb-3 flex flex-wrap gap-2">
            <label className="flex items-center gap-1 text-xs">From<input type="date" className="rounded border px-2 py-1 text-xs" value={financeFrom} onChange={e => setFinanceFrom(e.target.value)} /></label>
            <label className="flex items-center gap-1 text-xs">To<input type="date" className="rounded border px-2 py-1 text-xs" value={financeTo} onChange={e => setFinanceTo(e.target.value)} /></label>
          </div>
          {finance.isLoading && <p className="text-sm text-slate-500">Loading…</p>}
          {finance.data && (
            <div className="grid gap-3 sm:grid-cols-3">
              <Stat label="Total collected" value={`${finance.data.totalCollected.toFixed(2)}`} color="bg-emerald-50 text-emerald-700" />
              <Stat label="Payments" value={finance.data.paymentCount} color="bg-blue-50 text-blue-700" />
              <Stat label="Overdue defaulters" value={finance.data.overdueDefaulterCount} color="bg-rose-50 text-rose-700" />
              {Object.entries(finance.data.invoicesByStatus).map(([status, data]) => (
                <Stat key={status} label={`Invoices: ${status}`} value={data.count} sub={`Total: ${data.total.toFixed(2)}`} color="bg-slate-50 text-slate-700" />
              ))}
            </div>
          )}
        </Card>
      )}

      {/* ── LMS ── */}
      {!lms.isError && lms.data && (
        <Card title="Course Analytics">
          <div className="space-y-2">
            {lms.data.map(c => (
              <div key={c.courseId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-4 py-3">
                <span className="font-medium">{c.title}</span>
                <div className="flex gap-4 text-xs text-slate-500">
                  <span>{c.enrollments} enrolled</span>
                  <span>{c.submissions} submissions</span>
                  <span>{c.graded} graded</span>
                </div>
              </div>
            ))}
            {lms.data.length === 0 && <p className="text-sm text-slate-500">No course data available.</p>}
          </div>
        </Card>
      )}

      {/* ── Transport ── */}
      {!transport.isError && (
        <Card title="Transport Analytics">
          <div className="mb-3 flex flex-wrap gap-2">
            <label className="flex items-center gap-1 text-xs">From<input type="date" className="rounded border px-2 py-1 text-xs" value={transportFrom} onChange={e => setTransportFrom(e.target.value)} /></label>
            <label className="flex items-center gap-1 text-xs">To<input type="date" className="rounded border px-2 py-1 text-xs" value={transportTo} onChange={e => setTransportTo(e.target.value)} /></label>
          </div>
          {transport.isLoading && <p className="text-sm text-slate-500">Loading…</p>}
          {transport.data && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-xs font-semibold text-slate-500">Attendance by status</p>
                {transport.data.byStatus.map(s => (
                  <p key={s.status} className="flex justify-between border-t py-1 text-sm"><span>{s.status}</span><span className="font-semibold">{s.count}</span></p>
                ))}
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold text-slate-500">By route</p>
                {transport.data.byRoute.map(r => (
                  <p key={r.routeId} className="flex justify-between border-t py-1 text-sm"><span>{r.routeName}</span><span className="font-semibold">{r.count}</span></p>
                ))}
                <p className="mt-2 text-xs text-slate-500">Billing charges: {transport.data.billingCharges} · Total billed: {transport.data.totalBilled.toFixed(2)}</p>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* ── Library ── */}
      {!library.isError && library.data && (
        <Card title="Library Analytics">
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Books in catalog" value={library.data.catalogBooks} color="bg-amber-50 text-amber-700" />
            <Stat label="Waiting reservations" value={library.data.waitingReservations} color="bg-violet-50 text-violet-700" />
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-xs font-semibold text-slate-500">Copy status</p>
              {library.data.copyStatus.map(s => (
                <p key={s.status} className="flex justify-between border-t py-1 text-sm"><span>{s.status}</span><span>{s.count}</span></p>
              ))}
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold text-slate-500">Loan status</p>
              {library.data.loanStatus.map(s => (
                <p key={s.status} className="flex justify-between border-t py-1 text-sm"><span>{s.status}</span><span>{s.count}</span></p>
              ))}
            </div>
          </div>
          {library.data.recentAudits.length > 0 && (
            <div className="mt-3">
              <p className="mb-1 text-xs font-semibold text-slate-500">Recent inventory audits</p>
              {library.data.recentAudits.map(a => (
                <p key={a.id} className="border-t py-1 text-xs text-slate-500">{new Date(a.auditedAt).toLocaleDateString()} · {a.copiesAudited} copies{a.notes ? ` · ${a.notes}` : ''}</p>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* ── Hostel ── */}
      {!hostel.isError && hostel.data && (
        <Card title="Hostel Analytics">
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Blocks" value={hostel.data.blocks} color="bg-teal-50 text-teal-700" />
            <Stat label="Active residents" value={hostel.data.activeResidents} color="bg-emerald-50 text-emerald-700" />
            <Stat label="Occupancy rate" value={`${hostel.data.occupancyRate}%`} color="bg-blue-50 text-blue-700" />
          </div>
          {hostel.data.incidents.length > 0 && (
            <div className="mt-3">
              <p className="mb-1 text-xs font-semibold text-slate-500">Incidents by category</p>
              <div className="flex flex-wrap gap-2">
                {hostel.data.incidents.map(i => (
                  <span key={i.category} className="rounded-full bg-slate-100 px-2 py-1 text-xs">{i.category}: {i.count}</span>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* ── HR / Payroll ── */}
      {!hr.isError && hr.data && (
        <Card title="HR & Payroll Analytics">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Stat label="Total teachers" value={hr.data.totalTeachers} />
              <div className="mt-3">
                <p className="mb-1 text-xs font-semibold text-slate-500">Leave requests</p>
                {hr.data.leaveByStatus.map(s => (
                  <p key={s.status} className="flex justify-between border-t py-1 text-sm"><span>{s.status}</span><span>{s.count}</span></p>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold text-slate-500">Recent payroll runs</p>
              {hr.data.recentPayrolls.map(p => (
                <div key={p.id} className="border-t py-2 text-sm">
                  <p className="font-medium">{p.period}</p>
                  <p className="text-xs text-slate-500">{p.staffCount} staff · {p.totalGross.toFixed(2)} gross · {p.status}</p>
                </div>
              ))}
              {hr.data.recentPayrolls.length === 0 && <p className="text-sm text-slate-500">No payroll runs.</p>}
            </div>
          </div>
        </Card>
      )}
    </main>
  );
};
