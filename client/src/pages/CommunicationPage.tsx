import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { UserRole } from '../types';

type Announcement = { id: string; title: string; content: string; targetRole: UserRole | null; isPinned: boolean; createdAt: string; author: { firstName: string; lastName: string } };
type Recipient = { id: string; firstName: string; lastName: string; role: UserRole };
type Message = { id: string; subject: string | null; body: string; createdAt: string; senderId: string; receiverId: string; sender: Recipient; receiver: Recipient };
type Notification = { id: string; title: string; message: string; type: string; isRead: boolean; createdAt: string };

const roles: UserRole[] = ['ROLE_SUPER_ADMIN', 'ROLE_INSTITUTION_ADMIN', 'ROLE_ACADEMIC_HEAD', 'ROLE_CLASS_TEACHER', 'ROLE_SUBJECT_TEACHER', 'ROLE_TEACHING_ASSISTANT', 'ROLE_EXAM_CONTROLLER', 'ROLE_FINANCE_HEAD', 'ROLE_FEE_CLERK', 'ROLE_LIBRARIAN', 'ROLE_TRANSPORT_COORDINATOR', 'ROLE_HOSTEL_WARDEN', 'ROLE_COUNSELOR', 'ROLE_PARENT', 'ROLE_STUDENT', 'ROLE_AUDITOR'];
const apiError = (error: unknown) => axios.isAxiosError(error) ? error.response?.data?.error?.message ?? 'Request failed. Please try again.' : 'Request failed. Please try again.';
const niceRole = (role: UserRole) => role.replace('ROLE_', '').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c: string) => c.toUpperCase());

export const CommunicationPage: React.FC = () => {
  const { user, hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const canAnnounce = hasPermission('communication:announce');
  const canMessage = hasPermission('communication:message');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [targetRole, setTargetRole] = useState('');
  const [pinned, setPinned] = useState(false);
  const [receiverId, setReceiverId] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const announcements = useQuery({ queryKey: ['announcements'], queryFn: async () => (await apiClient.get('/communication/announcements')).data.data as Announcement[] });
  const messages = useQuery({ queryKey: ['messages'], queryFn: async () => (await apiClient.get('/communication/messages')).data.data as Message[] });
  const notifications = useQuery({ queryKey: ['notifications'], queryFn: async () => (await apiClient.get('/communication/notifications')).data.data as Notification[] });
  const recipients = useQuery({ queryKey: ['message-recipients'], queryFn: async () => (await apiClient.get('/communication/recipients')).data.data as Recipient[], enabled: canMessage });

  const createAnnouncement = useMutation({
    mutationFn: () => apiClient.post('/communication/announcements', { title, content, ...(targetRole ? { targetRole } : {}), isPinned: pinned }),
    onSuccess: async () => { setTitle(''); setContent(''); setTargetRole(''); setPinned(false); setError(''); setNotice('Announcement published.'); await queryClient.invalidateQueries({ queryKey: ['announcements'] }); },
    onError: (err) => { setNotice(''); setError(apiError(err)); },
  });
  const sendMessage = useMutation({
    mutationFn: () => apiClient.post('/communication/messages', { receiverId, subject: subject || undefined, body }),
    onSuccess: async () => { setBody(''); setSubject(''); setError(''); setNotice('Message sent.'); await queryClient.invalidateQueries({ queryKey: ['messages'] }); await queryClient.invalidateQueries({ queryKey: ['notifications'] }); },
    onError: (err) => { setNotice(''); setError(apiError(err)); },
  });
  const markRead = useMutation({
    mutationFn: (id: string) => apiClient.patch(`/communication/notifications/${id}/read`),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
    onError: (err) => { setNotice(''); setError(apiError(err)); },
  });

  const displayName = (recipient: Recipient) => `${recipient.firstName} ${recipient.lastName}`.trim() || niceRole(recipient.role);
  const formatDate = (value: string) => new Date(value).toLocaleString();

  return <div className="space-y-6">
    <header><p className="text-sm font-semibold text-primary-700">COMMUNITY</p><h1 className="mt-1 text-2xl font-bold text-slate-900">Announcements & messages</h1><p className="mt-1 text-sm text-slate-600">Institution notices, approved teacher-family conversations, and your notifications.</p></header>
    {notice && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div>}
    {error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>}

    {canAnnounce && <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">Publish an announcement</h2><p className="mb-4 text-sm text-slate-500">Choose a role audience or leave it open to all institution users.</p>
      <form className="grid gap-4 md:grid-cols-2" onSubmit={(e) => { e.preventDefault(); setError(''); setNotice(''); createAnnouncement.mutate(); }}>
        <label className="text-sm font-medium text-slate-700">Title<input required minLength={2} maxLength={160} value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500" /></label>
        <label className="text-sm font-medium text-slate-700">Audience<select value={targetRole} onChange={(e) => setTargetRole(e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"><option value="">Everyone in institution</option>{roles.map((role) => <option key={role} value={role}>{niceRole(role)}</option>)}</select></label>
        <label className="text-sm font-medium text-slate-700 md:col-span-2">Announcement<textarea required minLength={5} maxLength={10000} rows={3} value={content} onChange={(e) => setContent(e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500" /></label>
        <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />Pin to top</label>
        <div className="flex justify-end"><button disabled={createAnnouncement.isPending} className="rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{createAnnouncement.isPending ? 'Publishing…' : 'Publish announcement'}</button></div>
      </form>
    </section>}

    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-semibold text-slate-900">Announcements</h2>
      {announcements.isLoading && <p className="py-6 text-sm text-slate-500">Loading announcements…</p>}{announcements.isError && <p role="alert" className="py-6 text-sm text-rose-700">Could not load announcements.</p>}
      {announcements.data && !announcements.data.length && <p className="mt-3 rounded-lg bg-slate-50 p-5 text-center text-sm text-slate-600">No announcements yet.</p>}
      <div className="mt-3 space-y-3">{announcements.data?.map((item) => <article key={item.id} className="rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-slate-900">{item.title}</h3>{item.isPinned && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">Pinned</span>}{item.targetRole && <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-800">{niceRole(item.targetRole)}</span>}</div><p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{item.content}</p><p className="mt-3 text-xs text-slate-500">{item.author.firstName} {item.author.lastName} · {formatDate(item.createdAt)}</p></article>)}</div>
    </section>

    {canMessage && <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-semibold text-slate-900">Send a message</h2><p className="mb-4 text-sm text-slate-500">Recipients are limited to people connected through assigned school relationships.</p>
      {recipients.isLoading && <p className="text-sm text-slate-500">Loading eligible recipients…</p>}{recipients.isError && <p role="alert" className="text-sm text-rose-700">Could not load eligible recipients.</p>}
      {recipients.data && recipients.data.length === 0 && <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">No linked recipients are available for your account.</p>}
      {!!recipients.data?.length && <form className="grid gap-4 md:grid-cols-2" onSubmit={(e) => { e.preventDefault(); setError(''); setNotice(''); sendMessage.mutate(); }}>
        <label className="text-sm font-medium text-slate-700">To<select required value={receiverId} onChange={(e) => setReceiverId(e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"><option value="">Select a recipient</option>{recipients.data.map((recipient) => <option key={recipient.id} value={recipient.id}>{displayName(recipient)} · {niceRole(recipient.role)}</option>)}</select></label>
        <label className="text-sm font-medium text-slate-700">Subject (optional)<input maxLength={200} value={subject} onChange={(e) => setSubject(e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
        <label className="text-sm font-medium text-slate-700 md:col-span-2">Message<textarea required minLength={1} maxLength={10000} rows={3} value={body} onChange={(e) => setBody(e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500" /></label>
        <div className="md:col-span-2 flex justify-end"><button disabled={sendMessage.isPending || !receiverId} className="rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{sendMessage.isPending ? 'Sending…' : 'Send message'}</button></div>
      </form>}
    </section>}

    <div className="grid gap-6 xl:grid-cols-2">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-semibold text-slate-900">Your messages</h2>{messages.isLoading && <p className="py-5 text-sm text-slate-500">Loading messages…</p>}{messages.isError && <p role="alert" className="py-5 text-sm text-rose-700">Could not load messages.</p>}{messages.data && !messages.data.length && <p className="mt-3 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">No messages yet.</p>}<div className="mt-3 max-h-[32rem] space-y-3 overflow-y-auto">{messages.data?.map((item) => { const sent = item.senderId === user?.id; return <article key={item.id} className="rounded-xl border border-slate-200 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{sent ? `To ${displayName(item.receiver)}` : `From ${displayName(item.sender)}`}</p>{item.subject && <h3 className="mt-1 font-semibold text-slate-900">{item.subject}</h3>}<p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{item.body}</p><p className="mt-3 text-xs text-slate-500">{formatDate(item.createdAt)}</p></article>; })}</div></section>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-semibold text-slate-900">Notifications</h2>{notifications.isLoading && <p className="py-5 text-sm text-slate-500">Loading notifications…</p>}{notifications.isError && <p role="alert" className="py-5 text-sm text-rose-700">Could not load notifications.</p>}{notifications.data && !notifications.data.length && <p className="mt-3 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">No notifications yet.</p>}<div className="mt-3 max-h-[32rem] space-y-2 overflow-y-auto">{notifications.data?.map((item) => <article key={item.id} className={`rounded-xl border p-4 ${item.isRead ? 'border-slate-200 bg-white' : 'border-primary-200 bg-primary-50'}`}><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold text-slate-900">{item.title}</h3><p className="mt-1 text-sm text-slate-700">{item.message}</p><p className="mt-2 text-xs text-slate-500">{formatDate(item.createdAt)}</p></div>{!item.isRead && <button disabled={markRead.isPending} onClick={() => markRead.mutate(item.id)} className="shrink-0 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50">Mark read</button>}</div></article>)}</div></section>
    </div>
  </div>;
};
