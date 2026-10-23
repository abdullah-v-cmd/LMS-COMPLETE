import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';

type LeaveRequest = { id: string; leaveType: string; startDate: string; endDate: string; reason: string; status: string; createdAt: string; teacher?: { employeeCode: string; user: { firstName: string; lastName: string } } };
const errorMessage = (error: unknown) => axios.isAxiosError(error) ? error.response?.data?.error?.message ?? 'Request failed. Try again.' : 'Request failed. Try again.';
const localDate = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export const LeavePage: React.FC = () => {
  const { hasPermission } = useAuth();
  const cache = useQueryClient();
  const canRequest = hasPermission('leave:request');
  const canApprove = hasPermission('leave:approve');
  const [form, setForm] = useState({ leaveType: 'SICK', startDate: localDate(), endDate: localDate(), reason: '' });
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const query = useQuery({ queryKey: ['leave-requests'], queryFn: async () => (await apiClient.get('/hr/requests')).data.data as LeaveRequest[], enabled: canRequest });
  const requestMutation = useMutation({ mutationFn: async () => apiClient.post('/hr/requests', form), onSuccess: async () => { setError(''); setNotice('Leave request submitted.'); setForm((v) => ({ ...v, reason: '' })); await cache.invalidateQueries({ queryKey: ['leave-requests'] }); }, onError: (e) => { setNotice(''); setError(errorMessage(e)); } });
  const reviewMutation = useMutation({ mutationFn: async ({ id, status }: { id: string; status: 'APPROVED' | 'REJECTED' }) => apiClient.post(`/hr/requests/${id}/review`, { status }), onSuccess: async () => { setError(''); setNotice('Leave request reviewed; the staff member was notified.'); await cache.invalidateQueries({ queryKey: ['leave-requests'] }); }, onError: (e) => { setNotice(''); setError(errorMessage(e)); } });
  return <div className="mx-auto max-w-5xl space-y-6">
    <header><p className="text-sm font-semibold text-primary-700">STAFF SERVICES</p><h1 className="mt-1 text-2xl font-bold text-slate-900">Leave requests</h1><p className="mt-1 text-sm text-slate-600">Submit a staff leave request or review requests for your institution.</p></header>
    {notice && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}{error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {canRequest && <form onSubmit={(e) => { e.preventDefault(); requestMutation.mutate(); }} className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-2">
      <h2 className="text-lg font-semibold sm:col-span-2">New request</h2>
      <label className="text-sm font-medium">Leave type<select value={form.leaveType} onChange={(e) => setForm({ ...form, leaveType: e.target.value })} className="mt-1 block w-full rounded-lg border border-slate-300 p-2"><option>SICK</option><option>CASUAL</option><option>ANNUAL</option><option>MATERNITY</option><option>OTHER</option></select></label>
      <label className="text-sm font-medium">Start date<input required type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className="mt-1 block w-full rounded-lg border border-slate-300 p-2"/></label>
      <label className="text-sm font-medium">End date<input required type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className="mt-1 block w-full rounded-lg border border-slate-300 p-2"/></label>
      <label className="text-sm font-medium sm:col-span-2">Reason<textarea required minLength={5} maxLength={1000} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} className="mt-1 block w-full rounded-lg border border-slate-300 p-2" rows={3}/></label>
      <button disabled={requestMutation.isPending || form.reason.trim().length < 5} className="rounded-lg bg-primary-600 px-4 py-2 font-semibold text-white disabled:opacity-50 sm:col-span-2">{requestMutation.isPending ? 'Submitting…' : 'Submit request'}</button>
    </form>}
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="mb-4 text-lg font-semibold">{canApprove ? 'Institution leave requests' : 'My requests'}</h2>
      {query.isLoading && <p className="py-6 text-center text-sm text-slate-500">Loading leave requests…</p>}{query.isError && <p role="alert" className="py-6 text-sm text-rose-700">Could not load leave requests.</p>}{query.data && !query.data.length && <p className="rounded-lg bg-slate-50 p-5 text-center text-sm text-slate-600">No leave requests yet.</p>}
      {!!query.data?.length && <div className="divide-y divide-slate-100">{query.data.map((item) => <article key={item.id} className="flex flex-wrap items-center justify-between gap-4 py-4"><div><p className="font-semibold text-slate-800">{item.teacher ? `${item.teacher.user.firstName} ${item.teacher.user.lastName} · ${item.teacher.employeeCode}` : item.leaveType}</p><p className="text-sm text-slate-600">{item.leaveType} · {new Date(item.startDate).toLocaleDateString()} – {new Date(item.endDate).toLocaleDateString()} · <span className="font-semibold">{item.status}</span></p><p className="mt-1 text-sm text-slate-500">{item.reason}</p></div>{canApprove && item.status === 'PENDING' && <div className="flex gap-2"><button disabled={reviewMutation.isPending} onClick={() => reviewMutation.mutate({ id: item.id, status: 'REJECTED' })} className="rounded-lg border border-rose-300 px-3 py-2 text-sm font-semibold text-rose-700">Reject</button><button disabled={reviewMutation.isPending} onClick={() => reviewMutation.mutate({ id: item.id, status: 'APPROVED' })} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white">Approve</button></div>}</article>)}</div>}
    </section>
  </div>;
};
