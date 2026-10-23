import { z } from 'zod';

export const bookSchema = z.object({ title: z.string().trim().min(1).max(200), author: z.string().trim().min(1).max(160), isbn: z.string().trim().max(32).optional(), category: z.string().trim().min(1).max(80), totalCopies: z.number().int().min(1).max(10000) });
export const borrowSchema = z.object({ bookId: z.string().uuid(), studentId: z.string().uuid(), dueDate: z.string().date() });
export const recordIdSchema = z.object({ id: z.string().uuid() });
export const finePolicySchema = z.object({ dailyFine: z.number().finite().min(0).max(100000).refine((n) => Math.round(n * 100) === n * 100, 'Fine rate must have at most two decimal places'), currencyCode: z.string().regex(/^[A-Z]{3}$/) });

export const barcodeSchema = z.object({ barcode: z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9-]+$/) });
