import { PaymentMethod } from '@prisma/client';
import { z } from 'zod';

const money = z.number().finite().positive().max(9999999999.99).refine((n) => Math.round(n * 100) === n * 100, 'Amount must have at most two decimal places');

export const feeStructureSchema = z.object({
  academicYearId: z.string().uuid(),
  classGradeId: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  amount: money,
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  frequency: z.enum(['ONE_TIME', 'TERM', 'ANNUAL']).default('ANNUAL'),
});

export const generateInvoicesSchema = z.object({ feeStructureId: z.string().uuid() });
export const recordPaymentSchema = z.object({
  invoiceId: z.string().uuid(),
  amount: money,
  paymentMethod: z.nativeEnum(PaymentMethod).refine((method) => method !== PaymentMethod.ONLINE, 'Online payments require verified payment-provider integration'),
  transactionRef: z.string().trim().max(120).optional(),
});
export const waiverRequestSchema = z.object({
  invoiceId: z.string().uuid(),
  amount: money,
  reason: z.string().trim().min(5).max(1000),
});
export const waiverReviewSchema = z.object({ status: z.enum(['APPROVED', 'REJECTED']) });
export const waiverIdSchema = z.object({ id: z.string().uuid() });
export const refundRequestSchema = z.object({ paymentId: z.string().uuid(), amount: money, reason: z.string().trim().min(5).max(1000) });
