import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';

type PayrollStaff = { teacherProfileId: string; employeeCode: string; department: string | null; firstName: string; lastName: string; currentCompensation: { monthlySalary: string; effectiveFrom: string } | null };
type PayrollRun = { id: string; period: string; currencyCode: string; totalGross: string; entries: { id: string; employeeCode: string; staffName: string; monthlySalary: string }[] };
const currentMonth = () => new Date().toISOString().slice(0, 7);
const apiError = (error: unknown) => axios.isAxiosError(error) ? error.response?.data?.error?.message ?? 'Request failed.' : 'Request failed.';

export const PayrollPage: React.FC = () => {
  const { user, hasPermission } = useAuth();
  const cache = useQueryClient();
  const canManage = hasPermission('payroll:manage');
  const [teacherProfileId, setTeacherProfileId] = useState('');
  const [monthlySalary, setMonthlySalary] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().slice(0, 10));
  const [period, setPeriod] = useState(currentMonth());
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const staff = useQuery({ queryKey: ['payroll-staff'], queryFn: async () => (await apiClient.get('/payroll/staff')).data.data as PayrollStaff[] });
  const runs = useQuery({ queryKey: ['payroll-runs'], queryFn: async () => (await apiClient.get('/payroll/runs')).data.data as PayrollRun[] });
  const finish = async (success: string) => { setMessage(success); setError(''); await Promise.all([cache.invalidateQueries({ queryKey: ['payroll-staff'] }), cache.invalidateQueries({ queryKey: ['payroll-runs'] })]); };
  const saveSalary = useMutation({ mutationFn: () => apiClient.post('/payroll/compensations', { teacherProfileId, monthlySalary: Number(monthlySalary), effectiveFrom }), onSuccess: () => finish('Salary record saved.'), onError: (e) => { setMessage(''); setError(apiError(e)); } });
  const generate = useMutation({ mutationFn: () => apiClient.post('/payroll/runs', { period }), onSuccess: () => finish('Monthly payroll snapshot generated.'), onError: (e) => { setMessage(''); setError(apiError(e)); } });

  return <main className="mx-auto max-w-6xl space-y-6">
    <header><p className="text-sm font-semibold text-primary-700">HUMAN RESOURCES</p><h1 className="mt-1 text-2xl font-bold">Payroll</h1><p className="mt-1 text-sm text-slate-600">Confidential salary records and immutable monthly gross-pay snapshots. Visible only to the institution principal and finance head.</p></header>
    {message && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}{error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {staff.isLoading && <p className="text-sm text-slate-500">Loading confidential payroll data…</p>}{staff.isError && <p role="alert" className="text-sm text-rose-700">Could not load salary records.</p>}
    {canManage && <section className="rounded-2xl border bg-white p-5 shadow-sm"><h2 className="text-lg font-semibold">Add salary structure</h2><p className="mb-3 text-sm text-slate-500">Salary changes are effective dated and retained as history.</p><form className="grid gap-3 md:grid-cols-4" onSubmit={(e) => { e.preventDefault(); saveSalary.mutate(); }}><label className="text-sm font-medium">Staff member<select required value={teacherProfileId} onChange={(e) => setTeacherProfileId(e.target.value)} className="mt-1 w-full rounded-lg border p-2"><option value="">Select</option>{staff.data?.map((person) => <option key={person.teacherProfileId} value={person.teacherProfileId}>{person.firstName} {person.lastName} · {person.employeeCode}</option>)}</select></label><label className="text-sm font-medium">Monthly salary<input required type="number" min="0.01" max="100000000" step="0.01" value={monthlySalary} onChange={(e) => setMonthlySalary(e.target.value)} className="mt-1 w-full rounded-lg border p-2"/></label><label className="text-sm font-medium">Effective from<input required type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} className="mt-1 w-full rounded-lg border p-2"/></label><button disabled={saveSalary.isPending || !teacherProfileId} className="self-end rounded-lg bg-primary-600 px-4 py-2 font-semibold text-white disabled:opacity-50">Save salary</button></form></section>}
    {canManage && <section className="flex flex-wrap items-end gap-3 rounded-2xl border bg-white p-5 shadow-sm"><div><h2 className="text-lg font-semibold">Generate monthly summary</h2><p className="text-sm text-slate-500">Snapshots active staff with salary effective on the first day of the selected month.</p></div><label className="text-sm font-medium">Period<input type="month" max={currentMonth()} value={period} onChange={(e) => setPeriod(e.target.value)} className="mt-1 block rounded-lg border p-2"/></label><button disabled={generate.isPending} onClick={() => generate.mutate()} className="rounded-lg bg-slate-800 px-4 py-2 font-semibold text-white disabled:opacity-50">Generate</button></section>}
    <section className="space-y-4"><h2 className="text-lg font-semibold">Monthly payroll summaries</h2>{runs.isLoading && <p className="text-sm text-slate-500">Loading payroll history…</p>}{runs.isError && <p role="alert" className="text-sm text-rose-700">Could not load payroll history.</p>}{runs.data?.length === 0 && <p className="rounded-lg bg-slate-50 p-5 text-sm text-slate-600">No monthly summaries have been generated.</p>}{runs.data?.map((run) => <details key={run.id} className="rounded-xl border bg-white p-4"><summary className="cursor-pointer font-semibold">{run.period} · {run.currencyCode} {Number(run.totalGross).toFixed(2)} gross · {run.entries.length} staff</summary><div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b text-xs uppercase text-slate-500"><th className="py-2">Staff member</th><th className="py-2">Employee code</th><th className="py-2 text-right">Monthly gross</th></tr></thead><tbody>{run.entries.map((entry) => <tr key={entry.id} className="border-b"><td className="py-2">{entry.staffName}</td><td className="py-2">{entry.employeeCode}</td><td className="py-2 text-right">{run.currencyCode} {Number(entry.monthlySalary).toFixed(2)}</td></tr>)}</tbody></table></div></details>)}</section>
    <p className="text-xs text-slate-500">Signed in as {user?.firstName} {user?.lastName}. This module records gross salary only; tax and deduction rules are not configured.</p>
  </main>;
};
