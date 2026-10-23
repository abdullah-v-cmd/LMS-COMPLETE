import { describe, expect, it } from 'vitest';
import { bookSchema, borrowSchema, finePolicySchema, barcodeSchema } from '../src/modules/library/library.schemas';

describe('Library request validation', () => {
  it('validates catalog fields and positive integer inventory', () => {
    const valid = { title: 'Learning TypeScript', author: 'A. Author', category: 'Technology', totalCopies: 3 };
    expect(bookSchema.safeParse(valid).success).toBe(true);
    expect(bookSchema.safeParse({ ...valid, totalCopies: 0 }).success).toBe(false);
    expect(bookSchema.safeParse({ ...valid, title: ' ' }).success).toBe(false);
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
});
