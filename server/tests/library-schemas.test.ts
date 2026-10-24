import { describe, expect, it } from 'vitest';
import { bookSchema, borrowSchema, finePolicySchema, barcodeSchema, inventoryAuditSchema, renewalSchema, circulationReportQuerySchema } from '../src/modules/library/library.schemas';

describe('Library request validation', () => {
  it('validates catalog fields and positive integer inventory', () => {
    const valid = { title: 'Learning TypeScript', author: 'A. Author', category: 'Technology', totalCopies: 3 };
    expect(bookSchema.safeParse(valid).success).toBe(true);
    expect(bookSchema.safeParse({ ...valid, totalCopies: 0 }).success).toBe(false);
    expect(bookSchema.safeParse({ ...valid, title: ' ' }).success).toBe(false);
  });

  it('requires inventory audit scans to be unique and bounded', () => {
    const bookId = 'a0184c98-7f09-4b16-a22c-95b8dbf2a010';
    expect(inventoryAuditSchema.safeParse({ bookId, barcodes: ['LIB-a-1', 'LIB-a-2'] }).success).toBe(true);
    expect(inventoryAuditSchema.safeParse({ bookId, barcodes: ['LIB-a-1', 'LIB-a-1'] }).success).toBe(false);
  });
  it('validates scanner-friendly barcode identifiers', () => {
    expect(barcodeSchema.safeParse({ barcode: 'LIB-book-1' }).success).toBe(true);
    expect(barcodeSchema.safeParse({ barcode: 'bad barcode' }).success).toBe(false);
  });
  it('requires valid tenant-scoped checkout identifiers and calendar dates', () => {
    const valid = { bookId: 'a0184c98-7f09-4b16-a22c-95b8dbf2a010', studentId: 'b0184c98-7f09-4b16-a22c-95b8dbf2a010', dueDate: '2026-11-01' };
    expect(borrowSchema.safeParse(valid).success).toBe(true);
    expect(borrowSchema.safeParse({ ...valid, dueDate: '2026-02-30' }).success).toBe(false);
  });

  it('requires a nonnegative currency amount with two decimal precision', () => {
    expect(finePolicySchema.safeParse({ dailyFine: 1.25, currencyCode: 'PKR' }).success).toBe(true);
    expect(finePolicySchema.safeParse({ dailyFine: -1, currencyCode: 'PKR' }).success).toBe(false);
    expect(finePolicySchema.safeParse({ dailyFine: 1.256, currencyCode: 'PKR' }).success).toBe(false);
  });

  it('accepts a calendar renewal date and rejects malformed values', () => {
    expect(renewalSchema.safeParse({ dueDate: '2026-11-30' }).success).toBe(true);
    expect(renewalSchema.safeParse({ dueDate: '2026-02-30' }).success).toBe(false);
    expect(renewalSchema.safeParse({ dueDate: '2026-11-30', extra: true }).success).toBe(false);
  });

  it('validates circulation-report date boundaries', () => {
    expect(circulationReportQuerySchema.safeParse({ from: '2026-01-01', to: '2026-12-31' }).success).toBe(true);
    expect(circulationReportQuerySchema.safeParse({ from: '2026-12-31', to: '2026-01-01' }).success).toBe(false);
    expect(circulationReportQuerySchema.safeParse({ from: 'not-a-date' }).success).toBe(false);
  });
});
