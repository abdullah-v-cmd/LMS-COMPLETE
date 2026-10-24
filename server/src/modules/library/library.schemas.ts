import { z } from 'zod';

export const bookSchema = z.object({ title: z.string().trim().min(1).max(200), author: z.string().trim().min(1).max(160), isbn: z.string().trim().max(32).optional(), category: z.string().trim().min(1).max(80), totalCopies: z.number().int().min(1).max(10000) });
export const borrowSchema = z.object({ bookId: z.string().uuid(), studentId: z.string().uuid(), dueDate: z.string().date() });
export const recordIdSchema = z.object({ id: z.string().uuid() });
export const finePolicySchema = z.object({ dailyFine: z.number().finite().min(0).max(100000).refine((n) => Math.round(n * 100) === n * 100, 'Fine rate must have at most two decimal places'), currencyCode: z.string().regex(/^[A-Z]{3}$/) });

export const barcodeSchema = z.object({ barcode: z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9-]+$/) });
export const reservationSchema = z.object({ bookId: z.string().uuid() }).strict();
export const inventoryAuditSchema = z.object({ bookId: z.string().uuid(), barcodes: z.array(z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9-]+$/)).max(20000) }).strict().superRefine((data, ctx) => {
  if (new Set(data.barcodes).size !== data.barcodes.length) ctx.addIssue({ code: 'custom', path: ['barcodes'], message: 'A barcode may only be scanned once per audit' });
});
export const renewalSchema = z.object({ dueDate: z.string().date() }).strict();
export const circulationReportQuerySchema = z.object({
  from: z.string().date().optional(),
  to: z.string().date().optional(),
}).strict().superRefine((data, ctx) => {
  if (data.from && data.to && data.from > data.to) ctx.addIssue({ code: 'custom', path: ['to'], message: 'End date must not be before start date' });
});
