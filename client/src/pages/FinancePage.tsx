import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';
import {
  CreditCard,
  FileText,
  CheckCircle2,
  Clock,
  AlertCircle,
  Search,
  Filter,
  Download,
  Plus,
  RefreshCw,
  Layers,
  ArrowUpRight,
  ArrowDownLeft,
  Calendar,
  Building,
  User,
  Landmark,
  ShieldCheck,
  Copy,
  ExternalLink,
} from 'lucide-react';

export type BankIntegrationConfig = {
  institutionId: string;
  bankName: string;
  accountTitle: string;
  accountNumber: string;
  ibanOrRoutingNumber: string;
  swiftBicCode: string;
  branchName: string;
  branchCode: string;
  currency: string;
  depositInstructions: string;
  gatewayProvider: 'MANUAL_DEPOSIT' | 'STRIPE' | 'PAYPAL' | 'CUSTOM_GATEWAY';
  gatewayApiKey?: string;
  gatewayMerchantId?: string;
  isOnlinePaymentEnabled: boolean;
  updatedAt: string;
  updatedBy?: string;
};

type Payment = {
  id: string;
  receiptNumber: string;
  amountPaid: string | number;
  paymentMethod: string;
  transactionRef: string | null;
  paidAt: string;
};

type Invoice = {
  id: string;
  invoiceNumber: string;
  totalAmount: string | number;
  discountAmount: string | number;
  paidAmount: string | number;
  balanceAmount: string | number;
  status: string;
  dueDate: string;
  student?: {
    admissionNumber: string;
    rollNumber?: string | null;
    user?: { firstName: string; lastName: string; email?: string };
    section?: { name: string; classGrade?: { name: string } };
  } | null;
  feeStructure?: { name: string; frequency?: string } | null;
  payments?: Payment[];
  waivers?: { id: string; waiverAmount: string | number; status: string; reason?: string }[];
  refunds?: { id: string; amount: string | number; status: string; reason?: string }[];
};

type Structure = {
  id: string;
  name: string;
  amount: string | number;
  dueDate: string;
  frequency: string;
  classGrade?: { name: string } | null;
};

type Ledger = {
  id: string;
  transactionDate: string;
  accountCode: string;
  debitAmount: string | number;
  creditAmount: string | number;
  referenceType: string;
  referenceId: string;
  description: string;
};

type Waiver = {
  id: string;
  waiverAmount: string | number;
  reason: string;
  status: string;
  invoice?: {
    invoiceNumber: string;
    balanceAmount: string | number;
    student?: { admissionNumber: string; user?: { firstName: string; lastName: string } };
  } | null;
};

type Refund = {
  id: string;
  amount: string | number;
  reason: string;
  status: string;
  payment?: { receiptNumber: string; paymentMethod: string; amountPaid: string | number } | null;
  invoice?: {
    invoiceNumber: string;
    student?: { admissionNumber: string; user?: { firstName: string; lastName: string } };
  } | null;
};

type Year = { id: string; name: string };
type Grade = { id: string; name: string };

const errorText = (e: unknown) =>
  axios.isAxiosError(e)
    ? e.response?.data?.error?.message ?? 'The request could not be completed.'
    : 'The request could not be completed.';

const money = (value: string | number | undefined | null) =>
  Number(value ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const localDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
};

export const FinancePage: React.FC = () => {
  const { hasPermission, user } = useAuth();
  const cache = useQueryClient();

  // Role permissions
  const canManage =
    hasPermission('fee:structure:manage') ||
    user?.role === 'ROLE_SUPER_ADMIN' ||
    user?.role === 'ROLE_INSTITUTION_ADMIN' ||
    user?.role === 'ROLE_FINANCE_HEAD';

  const canCollect =
    hasPermission('fee:collect') ||
    user?.role === 'ROLE_SUPER_ADMIN' ||
    user?.role === 'ROLE_INSTITUTION_ADMIN' ||
    user?.role === 'ROLE_FINANCE_HEAD' ||
    user?.role === 'ROLE_FEE_CLERK';

  const canWaive = hasPermission('fee:waiver:request');
  const canApproveWaiver = hasPermission('fee:waiver:approve');
  const canRefund = hasPermission('fee:refund:request');
  const canApproveRefund = hasPermission('fee:refund:approve');
  const canReadLedger =
    hasPermission('ledger:read') ||
    user?.role === 'ROLE_SUPER_ADMIN' ||
    user?.role === 'ROLE_FINANCE_HEAD';

  const canReadStructures = canManage;
  const canReadInvoices = true; // Always allow view if route accessible

  // Navigation tab state
  const [activeTab, setActiveTab] = useState<'invoices' | 'structures' | 'waivers' | 'ledger' | 'bank'>('invoices');

  // Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Alerts
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Bank Integration State
  const [bankForm, setBankForm] = useState<Partial<BankIntegrationConfig>>({});
  const [isCopied, setIsCopied] = useState(false);

  // Form states
  const [structure, setStructure] = useState({
    academicYearId: '',
    classGradeId: '',
    name: '',
    amount: '',
    dueDate: localDate(),
    frequency: 'ANNUAL',
  });

  const [paymentDrafts, setPaymentDrafts] = useState<
    Record<string, { amount: string; method: string; reference: string }>
  >({});
  const [waiverDrafts, setWaiverDrafts] = useState<
    Record<string, { amount: string; reason: string }>
  >({});
  const [refundDrafts, setRefundDrafts] = useState<
    Record<string, { amount: string; reason: string }>
  >({});

  // Bank settings query
  const bankSettingsQuery = useQuery({
    queryKey: ['bank-settings'],
    queryFn: async () => {
      try {
        const res = await apiClient.get('/finance/bank-settings');
        return res.data?.data as BankIntegrationConfig;
      } catch (err) {
        console.warn('Failed to load bank settings:', err);
        return null;
      }
    },
  });

  React.useEffect(() => {
    if (bankSettingsQuery.data) {
      setBankForm(bankSettingsQuery.data);
    }
  }, [bankSettingsQuery.data]);

  const updateBankMutation = useMutation({
    mutationFn: async (payload: Partial<BankIntegrationConfig>) => {
      const res = await apiClient.put('/finance/bank-settings', payload);
      return res.data?.data;
    },
    onSuccess: (updated) => {
      setError('');
      setNotice('Bank and payment gateway integration settings saved successfully! Official bank details are now updated across all invoices and fee receipts.');
      cache.setQueryData(['bank-settings'], updated);
      cache.invalidateQueries({ queryKey: ['bank-settings'] });
    },
    onError: (err) => {
      setNotice('');
      setError(errorText(err));
    },
  });

  // Queries
  const invoicesQuery = useQuery({
    queryKey: ['finance-invoices'],
    queryFn: async () => {
      try {
        const res = await apiClient.get('/finance/invoices');
        return (res.data?.data || []) as Invoice[];
      } catch (err) {
        console.warn('Failed to load invoices:', err);
        return [] as Invoice[];
      }
    },
    enabled: canReadInvoices,
  });

  const structuresQuery = useQuery({
    queryKey: ['fee-structures'],
    queryFn: async () => {
      try {
        const res = await apiClient.get('/finance/structures');
        return (res.data?.data || []) as Structure[];
      } catch (err) {
        console.warn('Failed to load fee structures:', err);
        return [] as Structure[];
      }
    },
    enabled: canReadStructures,
  });

  const ledgerQuery = useQuery({
    queryKey: ['finance-ledger'],
    queryFn: async () => {
      try {
        const res = await apiClient.get('/finance/ledger');
        return (res.data?.data || []) as Ledger[];
      } catch (err) {
        console.warn('Failed to load ledger:', err);
        return [] as Ledger[];
      }
    },
    enabled: canReadLedger,
  });

  const waiversQuery = useQuery({
    queryKey: ['finance-waivers'],
    queryFn: async () => {
      try {
        const res = await apiClient.get('/finance/waivers');
        return (res.data?.data || []) as Waiver[];
      } catch (err) {
        return [] as Waiver[];
      }
    },
    enabled: canApproveWaiver || canWaive,
  });

  const refundsQuery = useQuery({
    queryKey: ['finance-refunds'],
    queryFn: async () => {
      try {
        const res = await apiClient.get('/finance/refunds');
        return (res.data?.data || []) as Refund[];
      } catch (err) {
        return [] as Refund[];
      }
    },
    enabled: canApproveRefund || canRefund,
  });

  const yearsQuery = useQuery({
    queryKey: ['academic-years'],
    queryFn: async () => {
      try {
        const res = await apiClient.get('/academic/years');
        return (res.data?.data || []) as Year[];
      } catch {
        return [] as Year[];
      }
    },
    enabled: canManage,
  });

  const gradesQuery = useQuery({
    queryKey: ['academic-classes'],
    queryFn: async () => {
      try {
        const res = await apiClient.get('/academic/classes');
        return (res.data?.data || []) as Grade[];
      } catch {
        return [] as Grade[];
      }
    },
    enabled: canManage,
  });

  // Actions & Mutations
  const reload = async () => {
    await Promise.all([
      cache.invalidateQueries({ queryKey: ['finance-invoices'] }),
      cache.invalidateQueries({ queryKey: ['finance-ledger'] }),
      cache.invalidateQueries({ queryKey: ['finance-waivers'] }),
      cache.invalidateQueries({ queryKey: ['finance-refunds'] }),
      cache.invalidateQueries({ queryKey: ['fee-structures'] }),
      cache.invalidateQueries({ queryKey: ['bank-settings'] }),
    ]);
  };

  const action = <T,>(fn: (value: T) => Promise<unknown>, success: string) => ({
    mutationFn: fn,
    onSuccess: async () => {
      setError('');
      setNotice(success);
      await reload();
    },
    onError: (e: unknown) => {
      setNotice('');
      setError(errorText(e));
    },
  });

  const structureMutation = useMutation(
    action(
      async () =>
        apiClient.post('/finance/structures', {
          ...structure,
          amount: Number(structure.amount),
        }),
      'Fee structure successfully created.'
    )
  );

  const generateMutation = useMutation(
    action(
      async (feeStructureId: string) =>
        apiClient.post('/finance/invoices/generate', { feeStructureId }),
      'Invoices generated for all eligible enrolled students.'
    )
  );

  const paymentMutation = useMutation(
    action(
      async ({
        invoiceId,
        amount,
        method,
        reference,
      }: {
        invoiceId: string;
        amount: number;
        method: string;
        reference: string;
      }) =>
        apiClient.post('/finance/payments', {
          invoiceId,
          amount,
          paymentMethod: method,
          ...(reference ? { transactionRef: reference } : {}),
        }),
      'Payment recorded and official receipt created.'
    )
  );

  const waiverMutation = useMutation(
    action(
      async ({
        invoiceId,
        amount,
        reason,
      }: {
        invoiceId: string;
        amount: number;
        reason: string;
      }) =>
        apiClient.post('/finance/waivers', { invoiceId, amount, reason }),
      'Waiver request submitted for review.'
    )
  );

  const waiverReviewMutation = useMutation(
    action(
      async ({ id, status }: { id: string; status: 'APPROVED' | 'REJECTED' }) =>
        apiClient.post(`/finance/waivers/${id}/review`, { status }),
      'Waiver request reviewed.'
    )
  );

  const refundMutation = useMutation(
    action(
      async ({
        paymentId,
        amount,
        reason,
      }: {
        paymentId: string;
        amount: number;
        reason: string;
      }) =>
        apiClient.post('/finance/refunds', { paymentId, amount, reason }),
      'Refund request submitted for approval.'
    )
  );

  const refundReviewMutation = useMutation(
    action(
      async ({ id, status }: { id: string; status: 'APPROVED' | 'REJECTED' }) =>
        apiClient.post(`/finance/refunds/${id}/review`, { status }),
      'Refund request reviewed and financial ledger updated.'
    )
  );

  // Filtered invoices
  const invoicesList = useMemo(() => invoicesQuery.data ?? [], [invoicesQuery.data]);

  const filteredInvoices = useMemo(() => {
    return invoicesList.filter((inv) => {
      const studentName = inv.student?.user
        ? `${inv.student.user.firstName} ${inv.student.user.lastName}`.toLowerCase()
        : '';
      const admNo = (inv.student?.admissionNumber || '').toLowerCase();
      const invNo = (inv.invoiceNumber || '').toLowerCase();
      const feeName = (inv.feeStructure?.name || '').toLowerCase();
      const term = searchTerm.toLowerCase();

      const matchesSearch =
        !term ||
        studentName.includes(term) ||
        admNo.includes(term) ||
        invNo.includes(term) ||
        feeName.includes(term);

      const matchesStatus =
        statusFilter === 'ALL' ||
        inv.status?.toUpperCase() === statusFilter.toUpperCase();

      return matchesSearch && matchesStatus;
    });
  }, [invoicesList, searchTerm, statusFilter]);

  // Overall statistics
  const stats = useMemo(() => {
    let totalInvoiced = 0;
    let totalPaid = 0;
    let totalBalance = 0;
    for (const inv of invoicesList) {
      totalInvoiced += Number(inv.totalAmount || 0);
      totalPaid += Number(inv.paidAmount || 0);
      totalBalance += Number(inv.balanceAmount || 0);
    }
    return {
      count: invoicesList.length,
      totalInvoiced,
      totalPaid,
      totalBalance,
    };
  }, [invoicesList]);

  // Ledger totals
  const ledgerTotals = useMemo(
    () =>
      (ledgerQuery.data ?? []).reduce(
        (total, row) => ({
          debit: total.debit + Number(row.debitAmount || 0),
          credit: total.credit + Number(row.creditAmount || 0),
        }),
        { debit: 0, credit: 0 }
      ),
    [ledgerQuery.data]
  );

  // Print / Download Receipt
  const printReceipt = (invoice: Invoice, payment: Payment) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      setError('Please allow pop-ups to print or download the fee receipt.');
      return;
    }
    const studentName = invoice.student?.user
      ? `${invoice.student.user.firstName} ${invoice.student.user.lastName}`
      : 'Student';
    const admNo = invoice.student?.admissionNumber || '—';
    const feeName = invoice.feeStructure?.name || 'Academic Fee';

    printWindow.document.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Fee Receipt - ${payment.receiptNumber}</title>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #0f172a; padding: 30px; margin: 0; background: #fff; }
    .card { max-width: 650px; margin: 0 auto; border: 2px solid #0f172a; border-radius: 8px; padding: 25px; }
    .header { text-align: center; border-bottom: 2px solid #e2e8f0; padding-bottom: 15px; margin-bottom: 18px; }
    .header h1 { margin: 0; font-size: 20px; text-transform: uppercase; color: #0f172a; }
    .badge { display: inline-block; background: #16a34a; color: white; padding: 3px 12px; border-radius: 12px; font-size: 11px; font-weight: bold; margin-top: 6px; }
    .info { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 13px; background: #f8fafc; padding: 12px; border-radius: 6px; margin-bottom: 18px; }
    .info div { display: flex; }
    .lbl { width: 130px; color: #64748b; font-weight: 600; font-size: 11px; text-transform: uppercase; }
    .val { font-weight: bold; color: #0f172a; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 18px; font-size: 13px; }
    th { background: #0f172a; color: white; padding: 8px; text-align: left; }
    td { padding: 8px; border: 1px solid #cbd5e1; }
    .footer { margin-top: 25px; border-top: 1px dashed #cbd5e1; padding-top: 12px; display: flex; justify-content: space-between; font-size: 11px; color: #64748b; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>Official Fee Payment Receipt</h1>
      <p style="margin: 3px 0 0; font-size: 12px; color: #64748b;">Educational Institution · Finance & Treasury Department</p>
      <div class="badge">Payment Acknowledged</div>
    </div>
    <div class="info">
      <div><span class="lbl">Receipt Number:</span><span class="val">${payment.receiptNumber}</span></div>
      <div><span class="lbl">Invoice Number:</span><span class="val">${invoice.invoiceNumber}</span></div>
      <div><span class="lbl">Student Name:</span><span class="val">${studentName}</span></div>
      <div><span class="lbl">Admission No:</span><span class="val">${admNo}</span></div>
      <div><span class="lbl">Payment Date:</span><span class="val">${new Date(payment.paidAt).toLocaleDateString()}</span></div>
      <div><span class="lbl">Payment Method:</span><span class="val">${payment.paymentMethod}</span></div>
    </div>
    <table>
      <thead>
        <tr><th>Particulars</th><th style="text-align:right;">Amount Paid</th></tr>
      </thead>
      <tbody>
        <tr><td>${feeName}</td><td style="text-align:right; font-weight: bold;">$${money(payment.amountPaid)}</td></tr>
      </tbody>
    </table>
    <div style="text-align:right; font-size: 13px; font-weight: bold; color: #0f172a;">
      Remaining Invoice Balance: $${money(invoice.balanceAmount)}
    </div>
    ${bankSettingsQuery.data ? `
    <div style="margin-top: 15px; padding: 10px 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 11px; color: #334155;">
      <strong style="color: #0f172a;">Official Institutional Bank Details for Direct Deposit:</strong><br/>
      ${bankSettingsQuery.data.bankName} | Title: <strong>${bankSettingsQuery.data.accountTitle}</strong> | Acc #: <strong>${bankSettingsQuery.data.accountNumber}</strong> | IBAN: ${bankSettingsQuery.data.ibanOrRoutingNumber || 'N/A'}<br/>
      <span style="color: #64748b; font-size: 10px;">${bankSettingsQuery.data.depositInstructions || 'Please specify Student Admission No. on deposit reference.'}</span>
    </div>
    ` : ''}
    <div class="footer">
      <div>Transaction Ref: ${payment.transactionRef || 'N/A'}<br/>System Verified: LMS-FIN-OFFICIAL</div>
      <div style="border-top: 1px solid #0f172a; width: 160px; text-align: center; padding-top: 3px; font-weight: bold; color: #0f172a;">Authorized Signature</div>
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

  const field =
    'mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-800 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20';

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-xs font-bold tracking-wider text-primary-600 uppercase">FINANCE & BILLING</p>
          <h1 className="mt-1 text-2xl sm:text-3xl font-extrabold text-slate-900">
            Fee Management & Accounts
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Manage fee structures, issue student invoices, record offline payments, and track institutional ledgers.
          </p>
        </div>
        <button
          onClick={() => reload()}
          disabled={invoicesQuery.isFetching}
          className="inline-flex items-center gap-2 self-start rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${invoicesQuery.isFetching ? 'animate-spin' : ''}`} />
          Refresh Data
        </button>
      </div>

      {/* Global Alerts */}
      {notice && (
        <div role="status" className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-sm font-medium text-emerald-800">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          <span>{notice}</span>
        </div>
      )}
      {error && (
        <div role="alert" className="flex items-center gap-2 rounded-xl bg-rose-50 border border-rose-200 p-4 text-sm font-medium text-rose-800">
          <AlertCircle className="h-5 w-5 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase">Total Invoiced</span>
            <div className="rounded-xl bg-primary-50 p-2 text-primary-600">
              <CreditCard className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-black text-slate-900">${money(stats.totalInvoiced)}</p>
          <p className="mt-1 text-xs text-slate-500">{stats.count} Total Invoices</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase">Total Collected</span>
            <div className="rounded-xl bg-emerald-50 p-2 text-emerald-600">
              <ArrowDownLeft className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-black text-emerald-600">${money(stats.totalPaid)}</p>
          <p className="mt-1 text-xs text-slate-500">Recorded Payments</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase">Outstanding Balance</span>
            <div className="rounded-xl bg-amber-50 p-2 text-amber-600">
              <Clock className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-black text-amber-600">${money(stats.totalBalance)}</p>
          <p className="mt-1 text-xs text-slate-500">Unpaid / Pending</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase">Fee Structures</span>
            <div className="rounded-xl bg-indigo-50 p-2 text-indigo-600">
              <Layers className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-black text-slate-900">
            {structuresQuery.data?.length ?? 0}
          </p>
          <p className="mt-1 text-xs text-slate-500">Active Templates</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab('invoices')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-colors ${
            activeTab === 'invoices'
              ? 'bg-primary-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <FileText className="h-4 w-4" />
          Invoices & Collections ({invoicesList.length})
        </button>

        {canManage && (
          <button
            onClick={() => setActiveTab('structures')}
            className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-colors ${
              activeTab === 'structures'
                ? 'bg-primary-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Layers className="h-4 w-4" />
            Fee Structures ({structuresQuery.data?.length ?? 0})
          </button>
        )}

        {(canApproveWaiver || canWaive || canApproveRefund || canRefund) && (
          <button
            onClick={() => setActiveTab('waivers')}
            className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-colors ${
              activeTab === 'waivers'
                ? 'bg-primary-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <ArrowUpRight className="h-4 w-4" />
            Waivers & Refunds ({waiversQuery.data?.length ?? 0} / {refundsQuery.data?.length ?? 0})
          </button>
        )}

        {canReadLedger && (
          <button
            onClick={() => setActiveTab('ledger')}
            className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-colors ${
              activeTab === 'ledger'
                ? 'bg-primary-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <CreditCard className="h-4 w-4" />
            General Ledger ({ledgerQuery.data?.length ?? 0})
          </button>
        )}

        {canManage && (
          <button
            onClick={() => setActiveTab('bank')}
            className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-colors ${
              activeTab === 'bank'
                ? 'bg-primary-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Landmark className="h-4 w-4" />
            Bank & Payment Integration
          </button>
        )}
      </div>

      {/* TAB 1: INVOICES & COLLECTIONS */}
      {activeTab === 'invoices' && (
        <div className="space-y-4">
          {/* Institutional Bank Details Callout */}
          {bankSettingsQuery.data && (
            <div className="rounded-2xl border border-primary-200 bg-gradient-to-r from-primary-50/70 to-indigo-50/60 p-5 shadow-sm">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-primary-100">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-primary-600 p-2.5 text-white shadow-sm">
                    <Landmark className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">
                        Official Bank Details for Fee Deposit
                      </h3>
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                        <ShieldCheck className="h-3 w-3" />
                        Verified Account
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Students and parents can deposit fee dues directly via counter bank deposit slip or online banking transfer.
                    </p>
                  </div>
                </div>
                {canManage && (
                  <button
                    onClick={() => setActiveTab('bank')}
                    className="inline-flex items-center gap-1.5 self-start text-xs font-bold text-primary-700 hover:text-primary-800 bg-white/80 border border-primary-200 px-3 py-1.5 rounded-lg shadow-2xs hover:bg-white"
                  >
                    Edit Bank Integration &rarr;
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-3 text-xs">
                <div className="rounded-xl bg-white/80 p-3 border border-primary-100/70">
                  <span className="font-bold text-slate-400 uppercase text-[10px] block">Bank Name</span>
                  <span className="text-sm font-bold text-slate-900 block mt-0.5">{bankSettingsQuery.data.bankName}</span>
                  <span className="text-[11px] text-slate-500">{bankSettingsQuery.data.branchName} ({bankSettingsQuery.data.branchCode})</span>
                </div>
                <div className="rounded-xl bg-white/80 p-3 border border-primary-100/70">
                  <span className="font-bold text-slate-400 uppercase text-[10px] block">Account Title</span>
                  <span className="text-sm font-bold text-slate-900 block mt-0.5">{bankSettingsQuery.data.accountTitle}</span>
                  <span className="text-[11px] text-slate-500">Currency: {bankSettingsQuery.data.currency}</span>
                </div>
                <div className="rounded-xl bg-white/80 p-3 border border-primary-100/70">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-400 uppercase text-[10px] block">Account Number</span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(bankSettingsQuery.data!.accountNumber);
                        setIsCopied(true);
                        setTimeout(() => setIsCopied(false), 2000);
                      }}
                      className="text-primary-600 hover:text-primary-800"
                      title="Copy Account Number"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <span className="text-sm font-mono font-bold text-slate-900 block mt-0.5">{bankSettingsQuery.data.accountNumber}</span>
                  <span className="text-[11px] text-slate-500">Swift / BIC: {bankSettingsQuery.data.swiftBicCode || 'N/A'}</span>
                </div>
                <div className="rounded-xl bg-white/80 p-3 border border-primary-100/70">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-400 uppercase text-[10px] block">IBAN / Routing #</span>
                    {bankSettingsQuery.data.ibanOrRoutingNumber && (
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(bankSettingsQuery.data!.ibanOrRoutingNumber);
                          setIsCopied(true);
                          setTimeout(() => setIsCopied(false), 2000);
                        }}
                        className="text-primary-600 hover:text-primary-800"
                        title="Copy IBAN"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <span className="text-sm font-mono font-bold text-slate-900 block mt-0.5 truncate" title={bankSettingsQuery.data.ibanOrRoutingNumber}>
                    {bankSettingsQuery.data.ibanOrRoutingNumber || 'N/A'}
                  </span>
                  <span className="text-[10px] text-emerald-700 font-semibold">
                    {isCopied ? 'Copied to clipboard!' : bankSettingsQuery.data.isOnlinePaymentEnabled ? 'Online Payments Active' : 'Manual Deposit Only'}
                  </span>
                </div>
              </div>
              {bankSettingsQuery.data.depositInstructions && (
                <div className="mt-2.5 rounded-lg bg-white/60 px-3 py-2 text-xs text-slate-600 border border-primary-100/50 flex items-start gap-2">
                  <span className="font-bold text-slate-700 shrink-0">Deposit Note:</span>
                  <span>{bankSettingsQuery.data.depositInstructions}</span>
                </div>
              )}
            </div>
          )}
          {/* Search & Filter Bar */}
          <div className="flex flex-col sm:flex-row gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search by student name, admission number, or invoice #..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-slate-50/50 pl-10 pr-4 py-2 text-sm text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-slate-400" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-xl border border-slate-300 bg-slate-50/50 px-3 py-2 text-sm font-semibold text-slate-700 focus:bg-white focus:outline-none"
              >
                <option value="ALL">All Statuses</option>
                <option value="PENDING">Pending</option>
                <option value="PARTIALLY_PAID">Partially Paid</option>
                <option value="PAID">Paid</option>
                <option value="OVERDUE">Overdue</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>
          </div>

          {/* Invoices List */}
          {invoicesQuery.isLoading ? (
            <div className="flex justify-center py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
            </div>
          ) : filteredInvoices.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
              <CreditCard className="mx-auto h-12 w-12 text-slate-400" />
              <h3 className="mt-3 text-lg font-bold text-slate-800">No Invoices Found</h3>
              <p className="mt-1 text-sm text-slate-500 max-w-md mx-auto">
                {searchTerm || statusFilter !== 'ALL'
                  ? 'No invoices match your current search and filter criteria.'
                  : canManage
                  ? 'No invoices have been generated yet. Go to Fee Structures to generate invoices for enrolled students.'
                  : 'You have no fee invoices on record at this time.'}
              </p>
            </div>
          ) : (
            <div className="grid gap-4">
              {filteredInvoices.map((invoice) => {
                const studentName = invoice.student?.user
                  ? `${invoice.student.user.firstName} ${invoice.student.user.lastName}`
                  : 'Enrolled Student';
                const admNo = invoice.student?.admissionNumber || '—';
                const feeName = invoice.feeStructure?.name || 'Tuition / Term Fee';
                const balance = Number(invoice.balanceAmount || 0);
                const isPaid = invoice.status === 'PAID' || balance <= 0;
                const isPending = invoice.status === 'PENDING';
                const isPartial = invoice.status === 'PARTIALLY_PAID';

                return (
                  <div
                    key={invoice.id}
                    className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:border-slate-300 transition-all"
                  >
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-4 border-b border-slate-100">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-bold text-slate-900">{studentName}</h3>
                          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-mono font-bold text-slate-600">
                            {admNo}
                          </span>
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-xs font-bold uppercase ${
                              isPaid
                                ? 'bg-emerald-100 text-emerald-800'
                                : isPartial
                                ? 'bg-blue-100 text-blue-800'
                                : isPending
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {invoice.status}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500 font-medium">
                          Invoice #{invoice.invoiceNumber} · {feeName} · Due:{' '}
                          {new Date(invoice.dueDate).toLocaleDateString()}
                        </p>
                      </div>

                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <p className="text-xs text-slate-500 font-medium">Total Invoiced</p>
                          <p className="text-base font-extrabold text-slate-900">
                            ${money(invoice.totalAmount)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-slate-500 font-medium">Paid</p>
                          <p className="text-base font-extrabold text-emerald-600">
                            ${money(invoice.paidAmount)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-slate-500 font-medium">Remaining Balance</p>
                          <p
                            className={`text-base font-black ${
                              balance > 0 ? 'text-amber-600' : 'text-slate-900'
                            }`}
                          >
                            ${money(invoice.balanceAmount)}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Offline Payment Recording Section */}
                    {canCollect && balance > 0 && invoice.status !== 'CANCELLED' && (
                      <div className="mt-4 rounded-xl bg-slate-50 p-3.5 border border-slate-200/70">
                        <p className="text-xs font-bold text-slate-700 uppercase mb-2">
                          Record Offline Fee Collection
                        </p>
                        <div className="flex flex-wrap items-end gap-3">
                          <label className="text-xs font-semibold text-slate-600">
                            Amount ($)
                            <input
                              type="number"
                              min="0.01"
                              max={balance}
                              step="0.01"
                              placeholder={balance.toFixed(2)}
                              value={paymentDrafts[invoice.id]?.amount ?? ''}
                              onChange={(e) =>
                                setPaymentDrafts((v) => ({
                                  ...v,
                                  [invoice.id]: {
                                    amount: e.target.value,
                                    method: v[invoice.id]?.method ?? 'CASH',
                                    reference: v[invoice.id]?.reference ?? '',
                                  },
                                }))
                              }
                              className="mt-1 block w-32 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm"
                            />
                          </label>

                          <label className="text-xs font-semibold text-slate-600">
                            Payment Method
                            <select
                              value={paymentDrafts[invoice.id]?.method ?? 'CASH'}
                              onChange={(e) =>
                                setPaymentDrafts((v) => ({
                                  ...v,
                                  [invoice.id]: {
                                    amount: v[invoice.id]?.amount ?? '',
                                    method: e.target.value,
                                    reference: v[invoice.id]?.reference ?? '',
                                  },
                                }))
                              }
                              className="mt-1 block rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm"
                            >
                              <option value="CASH">Cash</option>
                              <option value="CHEQUE">Cheque</option>
                              <option value="BANK_TRANSFER">Bank Transfer</option>
                            </select>
                          </label>

                          <label className="text-xs font-semibold text-slate-600 flex-1 min-w-[140px]">
                            Transaction / Cheque Ref
                            <input
                              type="text"
                              maxLength={120}
                              placeholder="e.g. CHQ-98214"
                              value={paymentDrafts[invoice.id]?.reference ?? ''}
                              onChange={(e) =>
                                setPaymentDrafts((v) => ({
                                  ...v,
                                  [invoice.id]: {
                                    amount: v[invoice.id]?.amount ?? '',
                                    method: v[invoice.id]?.method ?? 'CASH',
                                    reference: e.target.value,
                                  },
                                }))
                              }
                              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm"
                            />
                          </label>

                          <button
                            disabled={
                              paymentMutation.isPending ||
                              Number(paymentDrafts[invoice.id]?.amount) <= 0 ||
                              Number(paymentDrafts[invoice.id]?.amount) > balance
                            }
                            onClick={() =>
                              paymentMutation.mutate({
                                invoiceId: invoice.id,
                                amount: Number(paymentDrafts[invoice.id]?.amount),
                                method: paymentDrafts[invoice.id]?.method ?? 'CASH',
                                reference: paymentDrafts[invoice.id]?.reference ?? '',
                              })
                            }
                            className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                          >
                            {paymentMutation.isPending ? 'Recording...' : 'Record Payment'}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Existing Payments & Receipts */}
                    {invoice.payments && invoice.payments.length > 0 && (
                      <div className="mt-4 pt-3 border-t border-slate-100">
                        <p className="text-xs font-bold text-slate-700 uppercase mb-2">
                          Payment History & Receipts ({invoice.payments.length})
                        </p>
                        <div className="space-y-2">
                          {invoice.payments.map((p) => (
                            <div
                              key={p.id}
                              className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 px-3.5 py-2.5 border border-slate-100"
                            >
                              <div className="flex items-center gap-2">
                                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                                <span className="text-xs font-mono font-bold text-slate-900">
                                  {p.receiptNumber}
                                </span>
                                <span className="text-xs text-slate-500">
                                  · {p.paymentMethod} · ${money(p.amountPaid)} ·{' '}
                                  {new Date(p.paidAt).toLocaleDateString()}
                                </span>
                              </div>

                              <button
                                type="button"
                                onClick={() => printReceipt(invoice, p)}
                                className="inline-flex items-center gap-1 rounded-lg border border-primary-200 bg-primary-50 px-2.5 py-1 text-xs font-bold text-primary-700 hover:bg-primary-100"
                              >
                                <Download className="h-3.5 w-3.5" />
                                Download / Print Receipt
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: FEE STRUCTURES */}
      {activeTab === 'structures' && canManage && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Create Structure Form */}
          <div className="lg:col-span-1 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Plus className="h-5 w-5 text-primary-600" />
              New Fee Structure
            </h2>
            <p className="mt-1 text-xs text-slate-500 mb-4">
              Define reusable billing templates per academic year and class level.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                structureMutation.mutate();
              }}
              className="space-y-3"
            >
              <label className="text-xs font-bold text-slate-700">
                Academic Year
                <select
                  required
                  value={structure.academicYearId}
                  onChange={(e) =>
                    setStructure({ ...structure, academicYearId: e.target.value })
                  }
                  className={field}
                >
                  <option value="">Select Academic Year</option>
                  {(yearsQuery.data ?? []).map((y) => (
                    <option key={y.id} value={y.id}>
                      {y.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-xs font-bold text-slate-700">
                Target Class Grade
                <select
                  required
                  value={structure.classGradeId}
                  onChange={(e) =>
                    setStructure({ ...structure, classGradeId: e.target.value })
                  }
                  className={field}
                >
                  <option value="">Select Class Grade</option>
                  {(gradesQuery.data ?? []).map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-xs font-bold text-slate-700">
                Fee Name / Label
                <input
                  required
                  placeholder="e.g. Term 1 Tuition Fee"
                  value={structure.name}
                  onChange={(e) => setStructure({ ...structure, name: e.target.value })}
                  className={field}
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs font-bold text-slate-700">
                  Amount ($)
                  <input
                    required
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder="1200.00"
                    value={structure.amount}
                    onChange={(e) => setStructure({ ...structure, amount: e.target.value })}
                    className={field}
                  />
                </label>

                <label className="text-xs font-bold text-slate-700">
                  Frequency
                  <select
                    value={structure.frequency}
                    onChange={(e) => setStructure({ ...structure, frequency: e.target.value })}
                    className={field}
                  >
                    <option value="ANNUAL">Annual</option>
                    <option value="TERM">Per Term</option>
                    <option value="ONE_TIME">One Time</option>
                  </select>
                </label>
              </div>

              <label className="text-xs font-bold text-slate-700">
                Default Due Date
                <input
                  required
                  type="date"
                  value={structure.dueDate}
                  onChange={(e) => setStructure({ ...structure, dueDate: e.target.value })}
                  className={field}
                />
              </label>

              <button
                type="submit"
                disabled={
                  structureMutation.isPending ||
                  !structure.academicYearId ||
                  !structure.classGradeId ||
                  !structure.name ||
                  !structure.amount
                }
                className="w-full mt-2 rounded-xl bg-primary-600 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-primary-700 disabled:opacity-50"
              >
                {structureMutation.isPending ? 'Saving...' : 'Save Fee Structure'}
              </button>
            </form>
          </div>

          {/* Existing Structures List */}
          <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900 mb-1">Active Fee Templates</h2>
            <p className="text-xs text-slate-500 mb-4">
              Click &quot;Generate Invoices&quot; to issue billing statements to all actively enrolled students in that class.
            </p>

            {structuresQuery.isLoading ? (
              <p className="text-center py-8 text-sm text-slate-500">Loading fee structures...</p>
            ) : (structuresQuery.data ?? []).length === 0 ? (
              <div className="rounded-xl bg-slate-50 p-8 text-center border border-dashed border-slate-200">
                <Layers className="mx-auto h-8 w-8 text-slate-400" />
                <p className="mt-2 text-sm font-semibold text-slate-600">No fee structures yet</p>
                <p className="text-xs text-slate-400">Use the form on the left to define your first template.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {(structuresQuery.data ?? []).map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-4"
                  >
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">
                        {item.name} · {item.classGrade?.name || 'Class Grade'}
                      </h4>
                      <p className="text-xs text-slate-500 font-medium mt-0.5">
                        ${money(item.amount)} · Frequency: {item.frequency} · Due Date:{' '}
                        {new Date(item.dueDate).toLocaleDateString()}
                      </p>
                    </div>

                    <button
                      type="button"
                      disabled={generateMutation.isPending}
                      onClick={() => generateMutation.mutate(item.id)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-primary-300 bg-primary-50 px-3.5 py-2 text-xs font-bold text-primary-700 hover:bg-primary-100 disabled:opacity-50"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Generate Invoices
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: WAIVERS & REFUNDS */}
      {activeTab === 'waivers' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Waivers */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900 mb-1">Fee Waiver Requests</h2>
            <p className="text-xs text-slate-500 mb-4">
              Special allowances and financial concessions requested for students.
            </p>

            {(waiversQuery.data ?? []).length === 0 ? (
              <p className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">
                No waiver requests found.
              </p>
            ) : (
              <div className="space-y-3">
                {(waiversQuery.data ?? []).map((w) => {
                  const sName = w.invoice?.student?.user
                    ? `${w.invoice.student.user.firstName} ${w.invoice.student.user.lastName}`
                    : 'Student';
                  return (
                    <div
                      key={w.id}
                      className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5 text-sm"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-bold text-slate-900">
                            {sName} · ${money(w.waiverAmount)}
                          </p>
                          <p className="text-xs text-slate-500">
                            Invoice #{w.invoice?.invoiceNumber || '—'} · Status: {w.status}
                          </p>
                          <p className="text-xs text-slate-700 mt-1 italic">&quot;{w.reason}&quot;</p>
                        </div>
                        {canApproveWaiver && w.status === 'PENDING' && (
                          <div className="flex gap-1.5 shrink-0">
                            <button
                              onClick={() =>
                                waiverReviewMutation.mutate({ id: w.id, status: 'REJECTED' })
                              }
                              className="rounded-lg border border-rose-300 bg-white px-2.5 py-1 text-xs font-bold text-rose-700 hover:bg-rose-50"
                            >
                              Reject
                            </button>
                            <button
                              onClick={() =>
                                waiverReviewMutation.mutate({ id: w.id, status: 'APPROVED' })
                              }
                              className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-emerald-700"
                            >
                              Approve
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Refunds */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900 mb-1">Fee Refund Requests</h2>
            <p className="text-xs text-slate-500 mb-4">
              Approved refunds automatically adjust invoices and post reverse ledger entries.
            </p>

            {(refundsQuery.data ?? []).length === 0 ? (
              <p className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">
                No refund requests found.
              </p>
            ) : (
              <div className="space-y-3">
                {(refundsQuery.data ?? []).map((r) => {
                  const sName = r.invoice?.student?.user
                    ? `${r.invoice.student.user.firstName} ${r.invoice.student.user.lastName}`
                    : 'Student';
                  return (
                    <div
                      key={r.id}
                      className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5 text-sm"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-bold text-slate-900">
                            {sName} · ${money(r.amount)}
                          </p>
                          <p className="text-xs text-slate-500">
                            Receipt #{r.payment?.receiptNumber || '—'} · Status: {r.status}
                          </p>
                          <p className="text-xs text-slate-700 mt-1 italic">&quot;{r.reason}&quot;</p>
                        </div>
                        {canApproveRefund && r.status === 'PENDING' && (
                          <div className="flex gap-1.5 shrink-0">
                            <button
                              onClick={() =>
                                refundReviewMutation.mutate({ id: r.id, status: 'REJECTED' })
                              }
                              className="rounded-lg border border-rose-300 bg-white px-2.5 py-1 text-xs font-bold text-rose-700 hover:bg-rose-50"
                            >
                              Reject
                            </button>
                            <button
                              onClick={() =>
                                refundReviewMutation.mutate({ id: r.id, status: 'APPROVED' })
                              }
                              className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-emerald-700"
                            >
                              Approve & Post
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: GENERAL LEDGER */}
      {activeTab === 'ledger' && canReadLedger && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Double-Entry Financial Ledger</h2>
              <p className="text-xs text-slate-500">
                Audited transaction journal with strict debits and credits reconciliation.
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs font-bold">
              <span className="rounded-lg bg-slate-100 px-3 py-1 text-slate-700">
                Total Debits: ${money(ledgerTotals.debit)}
              </span>
              <span className="rounded-lg bg-slate-100 px-3 py-1 text-slate-700">
                Total Credits: ${money(ledgerTotals.credit)}
              </span>
              <span
                className={`rounded-lg px-3 py-1 ${
                  Math.abs(ledgerTotals.debit - ledgerTotals.credit) < 0.01
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-rose-100 text-rose-800'
                }`}
              >
                {Math.abs(ledgerTotals.debit - ledgerTotals.credit) < 0.01
                  ? 'Balanced (Zero-Sum)'
                  : 'Out of Balance'}
              </span>
            </div>
          </div>

          {(ledgerQuery.data ?? []).length === 0 ? (
            <p className="text-center py-8 text-sm text-slate-500">No ledger entries recorded yet.</p>
          ) : (
            <div className="overflow-x-auto max-h-[500px]">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-2.5">Date</th>
                    <th className="p-2.5">Account Code</th>
                    <th className="p-2.5">Reference Type</th>
                    <th className="p-2.5 text-right">Debit ($)</th>
                    <th className="p-2.5 text-right">Credit ($)</th>
                    <th className="p-2.5">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {(ledgerQuery.data ?? []).map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50/50">
                      <td className="p-2.5 font-sans">
                        {new Date(row.transactionDate).toLocaleDateString()}
                      </td>
                      <td className="p-2.5 font-bold text-primary-700">{row.accountCode}</td>
                      <td className="p-2.5 font-sans text-slate-600">
                        {row.referenceType} ({row.referenceId.slice(0, 8)})
                      </td>
                      <td className="p-2.5 text-right font-bold text-slate-900">
                        {money(row.debitAmount)}
                      </td>
                      <td className="p-2.5 text-right font-bold text-slate-900">
                        {money(row.creditAmount)}
                      </td>
                      <td className="p-2.5 font-sans text-slate-600">{row.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 5: BANK & PAYMENT GATEWAY INTEGRATION */}
      {activeTab === 'bank' && canManage && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
            <div>
              <div className="flex items-center gap-2">
                <div className="rounded-xl bg-primary-100 p-2 text-primary-700">
                  <Landmark className="h-5 w-5" />
                </div>
                <h2 className="text-xl font-bold text-slate-900">Institutional Bank & Gateway Integration</h2>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                Configure your institution's receiving bank account and payment gateway settings. No code modifications required. These details appear directly on all student and parent fee vouchers, invoices, and payment receipts.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
                <ShieldCheck className="h-3.5 w-3.5" />
                Persistent Configuration
              </span>
            </div>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              updateBankMutation.mutate({
                bankName: bankForm.bankName || '',
                accountTitle: bankForm.accountTitle || '',
                accountNumber: bankForm.accountNumber || '',
                ibanOrRoutingNumber: bankForm.ibanOrRoutingNumber || '',
                swiftBicCode: bankForm.swiftBicCode || '',
                branchName: bankForm.branchName || '',
                branchCode: bankForm.branchCode || '',
                currency: bankForm.currency || 'USD',
                depositInstructions: bankForm.depositInstructions || '',
                gatewayProvider: bankForm.gatewayProvider || 'MANUAL_DEPOSIT',
                gatewayApiKey: bankForm.gatewayApiKey || '',
                gatewayMerchantId: bankForm.gatewayMerchantId || '',
                isOnlinePaymentEnabled: Boolean(bankForm.isOnlinePaymentEnabled),
              });
            }}
            className="space-y-6"
          >
            {/* Bank Account Info Section */}
            <div>
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-3">
                1. Institutional Bank Account Details
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-700">Bank Name *</label>
                  <input
                    type="text"
                    required
                    value={bankForm.bankName || ''}
                    onChange={(e) => setBankForm((b) => ({ ...b, bankName: e.target.value }))}
                    placeholder="e.g. JPMorgan Chase, Barclays, HBL..."
                    className={field}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700">Account Title / Beneficiary *</label>
                  <input
                    type="text"
                    required
                    value={bankForm.accountTitle || ''}
                    onChange={(e) => setBankForm((b) => ({ ...b, accountTitle: e.target.value }))}
                    placeholder="e.g. EduFlow Academy Tuition Account"
                    className={field}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700">Account Number *</label>
                  <input
                    type="text"
                    required
                    value={bankForm.accountNumber || ''}
                    onChange={(e) => setBankForm((b) => ({ ...b, accountNumber: e.target.value }))}
                    placeholder="e.g. 0129-84729104-01"
                    className={field}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700">IBAN or Routing / Sort Code</label>
                  <input
                    type="text"
                    value={bankForm.ibanOrRoutingNumber || ''}
                    onChange={(e) => setBankForm((b) => ({ ...b, ibanOrRoutingNumber: e.target.value }))}
                    placeholder="e.g. PK82NEBK01298472910401 or 021000021"
                    className={field}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700">SWIFT / BIC Code</label>
                  <input
                    type="text"
                    value={bankForm.swiftBicCode || ''}
                    onChange={(e) => setBankForm((b) => ({ ...b, swiftBicCode: e.target.value }))}
                    placeholder="e.g. CHASUS33XXX"
                    className={field}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700">Currency</label>
                  <input
                    type="text"
                    value={bankForm.currency || 'USD'}
                    onChange={(e) => setBankForm((b) => ({ ...b, currency: e.target.value }))}
                    placeholder="USD, EUR, GBP, PKR, INR, AED..."
                    className={field}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700">Branch Name</label>
                  <input
                    type="text"
                    value={bankForm.branchName || ''}
                    onChange={(e) => setBankForm((b) => ({ ...b, branchName: e.target.value }))}
                    placeholder="e.g. Main Campus Boulevard Branch"
                    className={field}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700">Branch Code</label>
                  <input
                    type="text"
                    value={bankForm.branchCode || ''}
                    onChange={(e) => setBankForm((b) => ({ ...b, branchCode: e.target.value }))}
                    placeholder="e.g. 0129"
                    className={field}
                  />
                </div>
              </div>
            </div>

            {/* Deposit Instructions */}
            <div>
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-2">
                2. Fee Deposit Instructions for Students & Parents
              </h3>
              <p className="text-xs text-slate-500 mb-2">
                These notes will appear on fee invoices and receipts so depositors clearly know how to submit their payments.
              </p>
              <textarea
                rows={3}
                value={bankForm.depositInstructions || ''}
                onChange={(e) => setBankForm((b) => ({ ...b, depositInstructions: e.target.value }))}
                placeholder="e.g. Please specify the Student Admission Number and Invoice Number on your bank deposit slip or wire transfer reference."
                className={field}
              />
            </div>

            {/* Gateway & Online Integration */}
            <div>
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-3">
                3. Online Gateway & Digital Deposits
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-700">Gateway Provider</label>
                  <select
                    value={bankForm.gatewayProvider || 'MANUAL_DEPOSIT'}
                    onChange={(e) =>
                      setBankForm((b) => ({
                        ...b,
                        gatewayProvider: e.target.value as any,
                      }))
                    }
                    className={field}
                  >
                    <option value="MANUAL_DEPOSIT">Direct Bank Transfer / Wire / Counter Deposit</option>
                    <option value="STRIPE">Stripe Connect / Gateway</option>
                    <option value="PAYPAL">PayPal Business Integration</option>
                    <option value="CUSTOM_GATEWAY">Custom Bank Webhook / API Gateway</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700">Online Payment Gateway Status</label>
                  <div className="mt-2 flex items-center gap-3">
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(bankForm.isOnlinePaymentEnabled)}
                        onChange={(e) =>
                          setBankForm((b) => ({ ...b, isOnlinePaymentEnabled: e.target.checked }))
                        }
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                      <span className="ml-3 text-xs font-bold text-slate-700">
                        {bankForm.isOnlinePaymentEnabled ? 'Online Payments Enabled' : 'Disabled (Offline/Teller Only)'}
                      </span>
                    </label>
                  </div>
                </div>
                {bankForm.gatewayProvider !== 'MANUAL_DEPOSIT' && (
                  <>
                    <div>
                      <label className="text-xs font-bold text-slate-700">Gateway API Key / Publishable Key</label>
                      <input
                        type="password"
                        value={bankForm.gatewayApiKey || ''}
                        onChange={(e) => setBankForm((b) => ({ ...b, gatewayApiKey: e.target.value }))}
                        placeholder="pk_live_..."
                        className={field}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-700">Merchant Account ID / Client ID</label>
                      <input
                        type="text"
                        value={bankForm.gatewayMerchantId || ''}
                        onChange={(e) => setBankForm((b) => ({ ...b, gatewayMerchantId: e.target.value }))}
                        placeholder="acct_... or merchant_id"
                        className={field}
                      />
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Last Updated metadata */}
            {bankSettingsQuery.data?.updatedAt && (
              <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500 flex items-center justify-between">
                <span>Last Updated: {new Date(bankSettingsQuery.data.updatedAt).toLocaleString()}</span>
                <span>Configured by: {bankSettingsQuery.data.updatedBy || 'System Admin'}</span>
              </div>
            )}

            {/* Submit Button */}
            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={updateBankMutation.isPending}
                className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-6 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-primary-700 disabled:opacity-50"
              >
                <CheckCircle2 className="h-4 w-4" />
                {updateBankMutation.isPending ? 'Saving Bank Settings...' : 'Save Bank Integration'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
