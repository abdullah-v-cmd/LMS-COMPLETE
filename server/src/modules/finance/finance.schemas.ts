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
  paymentMethod: z.enum([PaymentMethod.CASH, PaymentMethod.CHEQUE, PaymentMethod.BANK_TRANSFER]),
  transactionRef: z.string().trim().max(120).optional(),
});
export const bankIntegrationSchema = z.object({
  bankName: z.string().trim().min(2, 'Bank name is required').max(150),
  accountTitle: z.string().trim().min(2, 'Account title is required').max(150),
  accountNumber: z.string().trim().min(2, 'Account number is required').max(100),
  ibanOrRoutingNumber: z.string().trim().max(100).optional().default(''),
  swiftBicCode: z.string().trim().max(50).optional().default(''),
  branchName: z.string().trim().max(150).optional().default(''),
  branchCode: z.string().trim().max(50).optional().default(''),
  currency: z.string().trim().max(10).default('USD'),
  depositInstructions: z.string().trim().max(2000).optional().default(''),
  gatewayProvider: z.enum(['MANUAL_DEPOSIT', 'STRIPE', 'PAYPAL', 'CUSTOM_GATEWAY']).default('MANUAL_DEPOSIT'),
  gatewayApiKey: z.string().trim().max(255).optional(),
  gatewayMerchantId: z.string().trim().max(255).optional(),
  isOnlinePaymentEnabled: z.boolean().default(true),
});
export const waiverRequestSchema = z.object({
  invoiceId: z.string().uuid(),
  amount: money,
  reason: z.string().trim().min(5).max(1000),
});
export const waiverReviewSchema = z.object({ status: z.enum(['APPROVED', 'REJECTED']) });
export const waiverIdSchema = z.object({ id: z.string().uuid() });
export const refundRequestSchema = z.object({ paymentId: z.string().uuid(), amount: money, reason: z.string().trim().min(5).max(1000) });
